import { test, expect } from "@playwright/test";
import { sample } from "../src/sample.js";
import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=";

async function mockBridge(page, text = sample, svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="green"/></svg>') {
  await page.route("**/src/bridge.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      export const bridge = {
        open: async (path) => {
          (window.openPaths ??= []).push(path ?? null);
          return {documents:[{id:window.nextId ?? 1,name:"テスト.md",path:"C:/docs/テスト.md",text:window.nextText ?? ${JSON.stringify(text)}}],errors:[]};
        },
        activate: async (id) => {window.activeDocument=id},
        close: async () => {},
        reload: async (id) => {
          (window.reloadIds ??= []).push(id);
          if (window.delayReload) await new Promise(resolve => {window.finishReload=resolve});
          if (window.reloadError) throw new Error(window.reloadError);
          return {id,name:"テスト.md",path:"C:/docs/テスト.md",text:window.nextText ?? ${JSON.stringify(text)}};
        },
        readImage: async (_id, reference) => reference.endsWith(".png")
          ? {mime:"image/png",data:"${png}"}
          : {mime:"image/svg+xml",data:${JSON.stringify(Buffer.from(svg).toString("base64"))}},
        savePdf: async (id) => {
          window.exportDocumentId = id;
          window.exportPalette = document.documentElement.dataset.exporting;
          if (window.holdPdf) await new Promise(resolve => {window.finishPdf=resolve});
          if (window.failPdf) throw new Error("Native PDF failure");
          return window.cancelPdf ? null : "C:/docs/テスト.pdf";
        },
        openExternal: async (url) => {window.externalLink=url},
        exit: async () => {window.didExit=true},
        onDrop: async (handler) => {window.dropFile=handler; return ()=>{}}
      };
    `
  }));
}

test("welcome is polished at the minimum window size and dark theme works", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "読むことに、集中を。" })).toBeVisible();
  await expect(page.locator("#export-button")).toBeDisabled();
  await expect(page.locator("#reload-button")).toBeDisabled();
  await page.locator("#sample-button").click();
  await expect(page.locator("#status")).toContainText("サンプル表示中");
  await expect(page.locator("#reload-button")).toBeDisabled();
  await page.reload();
  await page.screenshot({ path: "test-results/welcome.png" });
  await page.getByRole("button", { name: "ダークテーマに切り替える" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 760, height: 560 });
  await expect(page.locator("#welcome-open")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("reload refreshes the active document, rebuilds content and locks actions until rendering finishes", async ({ page }) => {
  await mockBridge(page, "# Before");
  await page.goto("/");
  await page.locator("#open-button").click();
  await expect(page.locator("#status")).toHaveText("読み込み完了");
  await page.evaluate(() => {
    window.delayReload = true;
    window.nextText = "# After\n\n## Details\n\n$x^2$\n\n```mermaid\ngraph LR; A-->B\n```\n\n![Updated](plot.png)";
  });
  await page.getByRole("button", { name: "ファイルを再読み込み", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("ファイルを再読み込みしています…");
  for (const id of ["reload-button", "open-button", "export-button", "exit-button", "sidebar-open"]) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  await page.keyboard.press("Control+o");
  expect(await page.evaluate(() => window.openPaths)).toEqual([null]);
  expect(await page.evaluate(() => window.reloadIds)).toEqual([1]);
  await expect(page.locator("#notice")).toContainText("処理中です。");
  await page.locator("#notice-close").click();
  await page.evaluate(() => window.finishReload());
  await expect(page.locator("#status")).toHaveText("再読み込み完了", { timeout: 15000 });
  await expect(page.locator("#article h1")).toHaveText("After");
  await expect(page.locator("#outline a")).toHaveText(["After", "Details"]);
  await expect(page.locator("#article .katex")).toHaveCount(1);
  await expect(page.locator("#article .diagram svg")).toBeVisible();
  await expect(page.locator('#article img[alt="Updated"]')).toHaveJSProperty("naturalWidth", 1);
  await expect(page.locator("#reload-button")).toBeEnabled();
  await expect(page.locator("#notice")).toBeHidden();
  await page.locator("#export-button").click();
  await expect(page.locator("#notice")).toContainText("PDFを保存しました");
  expect(await page.evaluate(() => window.exportDocumentId)).toBe(1);
  await page.setViewportSize({ width: 760, height: 560 });
  await expect(page.locator("#reload-button")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("reload read failure preserves the preview and allows a successful retry", async ({ page }) => {
  await mockBridge(page, "# Keep");
  await page.goto("/");
  await page.locator("#open-button").click();
  await expect(page.locator("#status")).toHaveText("読み込み完了");
  await page.evaluate(() => { window.reloadError = "Cannot read document"; });
  await page.locator("#reload-button").click();
  await expect(page.locator("#status")).toHaveText("再読み込みに失敗しました");
  await expect(page.locator("#notice")).toContainText("ファイルを再読み込みできませんでした: Cannot read document");
  await expect(page.locator("#article h1")).toHaveText("Keep");
  await expect(page.locator("#outline a")).toHaveText("Keep");
  await expect(page.locator("#export-button")).toBeEnabled();
  await expect(page.locator("#reload-button")).toBeEnabled();
  await page.evaluate(() => { window.reloadError = null; window.nextText = "# Recovered"; });
  await page.locator("#reload-button").click();
  await expect(page.locator("#status")).toHaveText("再読み込み完了");
  await expect(page.locator("#article h1")).toHaveText("Recovered");
  await expect(page.locator("#notice")).toBeHidden();
  expect(await page.evaluate(() => window.openPaths)).toEqual([null]);
  expect(await page.evaluate(() => window.reloadIds)).toEqual([1, 1]);
});

test("native workflow renders real math, Mermaid and image then saves without printing UI", async ({ page }) => {
  await mockBridge(page, `${sample}\n\n![ローカル図](plot.svg)\n\n![PNG](plot.png)\n\n![Remote](https://images.example/p.png)\n\n[External](https://example.com)`);
  await page.route("https://images.example/p.png", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(png, "base64") }));
  await page.goto("/");
  await page.locator("#open-button").click();
  await expect(page.locator("#status")).toHaveText("読み込み完了");
  await expect(page.locator("#article .katex")).toHaveCount(2);
  await expect(page.locator("#article .diagram svg")).toBeVisible();
  await expect(page.locator("#article .diagram svg")).toContainText("Markdownを開く");
  await expect(page.locator("#article .katex svg")).toBeVisible();
  await expect(page.locator('#article img[alt="ローカル図"]')).toHaveJSProperty("naturalWidth", 80);
  await expect(page.locator('#article img[alt="PNG"]')).toHaveJSProperty("naturalWidth", 1);
  await expect(page.locator('#article img[alt="Remote"]')).toHaveJSProperty("naturalWidth", 1);
  await expect(page.locator('#article img[alt="Remote"]')).toHaveJSProperty("referrerPolicy", "no-referrer");
  await expect(page.locator("#article input[type=checkbox]")).toHaveCount(3);
  await expect(page.locator("#article .note-info")).toBeVisible();
  await expect(page.locator("#outline a")).toHaveCount(4);
  expect(await page.locator("#article .katex [style]").count()).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/document.png", fullPage: true });
  await page.getByRole("link", { name: "External", exact: true }).click();
  expect(await page.evaluate(() => window.externalLink)).toBe("https://example.com");
  await page.locator("#export-button").click();
  await expect(page.locator("#notice")).toContainText("PDFを保存しました");
  expect(await page.evaluate(() => window.exportPalette)).toBe("true");
  await expect(page.locator("html")).not.toHaveAttribute("data-exporting");
  await page.locator("#theme-button").click();
  await page.emulateMedia({ media: "print" });
  expect(await page.locator("#article").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(34, 34, 34)");
  await expect(page.locator(".toolbar")).toBeHidden();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator("#article")).toBeVisible();
  await page.pdf({ path: "test-results/browser-layout.pdf", format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await page.locator("#exit-button").click();
  expect(await page.evaluate(() => window.didExit)).toBe(true);
});

test("malicious HTML is inert and broken resources explicitly block PDF", async ({ page }) => {
  await mockBridge(page, '# Unsafe\n\n<img src="file:///secret.png" onerror="window.pwned=true">\n\n<script>window.pwned=true</script>\n\n```mermaid\ninvalid graph\n```\n');
  await page.goto("/");
  await page.locator("#open-button").click();
  await expect(page.locator("#status")).toHaveText("表示エラーあり");
  await expect(page.locator("#article [data-render-error]")).toHaveCount(2);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await page.locator("#export-button").click();
  await expect(page.locator("#notice")).toContainText("PDFを保存できませんでした");
  expect(await page.evaluate(() => window.exportPalette)).toBeUndefined();
});

test("styled SVG keeps actual colors and glyph pixels alongside bracket TeX in screen and print", async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="120" height="60"><defs><path id="glyph" d="M0 0h4v20h-4z"/></defs><rect width="120" height="60" style="fill:#ffffff"/><rect x="10" y="10" width="20" height="40" style="fill:#ff0000"/><use xlink:href="#glyph" x="70" y="15" style="fill:#0000ff"/></svg>';
  await mockBridge(page, String.raw`# Images and TeX

![Chart](plot.svg)

Inline \(\bar r\) and $x$.

\[\frac{a}{b}\]

$$y^2$$

Literal ` + "`" + String.raw`\(\bar r\)` + "`", svg);
  await page.goto("/");
  await page.locator("#open-button").click();
  await expect(page.locator("#status")).toHaveText("読み込み完了");
  await expect(page.locator("#article .katex")).toHaveCount(4);
  await expect(page.locator("#article .katex-display")).toHaveCount(2);
  await expect(page.locator("#article code")).toHaveText(String.raw`\(\bar r\)`);
  const image = page.locator('#article img[alt="Chart"]');
  await expect(image).toHaveJSProperty("naturalWidth", 120);
  const pixels = () => image.evaluate((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return [[5, 5], [20, 20], [72, 20]].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
  });
  expect(await pixels()).toEqual([[255, 255, 255, 255], [255, 0, 0, 255], [0, 0, 255, 255]]);
  await page.locator("#theme-button").click();
  expect(await pixels()).toEqual([[255, 255, 255, 255], [255, 0, 0, 255], [0, 0, 255, 255]]);
  await page.emulateMedia({ media: "print" });
  await expect(image).toBeVisible();
  await expect(page.locator("#article .katex")).toHaveCount(4);
  expect((await page.pdf({ format: "A4", printBackground: true })).length).toBeGreaterThan(1000);
});

test("PDF uses a high-resolution PNG with embedded SVG pixels and restores SVG on all outcomes", async ({ page }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60">
    <rect width="120" height="60" fill="red"/>
    <image href="data:image/png;base64,${png}" x="20" y="10" width="20" height="40"/>
  </svg>`;
  await mockBridge(page, "# Raster export\n\n![Chart](plot.svg)\n\n![PNG](plot.png)", svg);
  await page.goto("/");
  await page.locator("#open-button").click();
  await expect(page.locator("#status")).toHaveText("読み込み完了");
  const chart = page.locator('#article img[alt="Chart"]');
  const original = await chart.getAttribute("src");
  const originalPng = await page.locator('#article img[alt="PNG"]').getAttribute("src");
  const width = await chart.evaluate((image) => image.getBoundingClientRect().width);
  for (const outcome of ["success", "cancel", "failure"]) {
    await page.evaluate((outcome) => {
      window.holdPdf = true;
      window.finishPdf = null;
      window.cancelPdf = outcome === "cancel";
      window.failPdf = outcome === "failure";
    }, outcome);
    await page.locator("#export-button").click();
    await page.waitForFunction(() => typeof window.finishPdf === "function");
    await expect(chart).toHaveAttribute("src", /^data:image\/png;base64,/);
    expect(await chart.evaluate((image) => image.getBoundingClientRect().width)).toBe(width);
    expect(await chart.evaluate((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 60;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, 120, 60);
      return [[5, 5], [25, 25]].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    })).toEqual([[255, 0, 0, 255], [255, 255, 255, 255]]);
    await expect(chart).toHaveJSProperty("naturalWidth", 375);
    await expect(page.locator('#article img[alt="PNG"]')).toHaveAttribute("src", originalPng);
    if (outcome === "success") {
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      expect(pdf.toString("latin1")).toMatch(/\/Subtype \/Image\s*\/Width 375\s*\/Height 188/);
    }
    await page.evaluate(() => window.finishPdf());
    await expect(page.locator("html")).not.toHaveAttribute("data-exporting");
    await expect(chart).toHaveAttribute("src", original);
    if (outcome === "cancel") await expect(page.locator("#status")).toHaveText("PDF保存をキャンセルしました");
    else await expect(page.locator("#notice")).toContainText(outcome === "success" ? "PDFを保存しました" : "PDFを保存できませんでした");
  }
});

test("PDF contains consecutive page numbers centered in each bottom margin", async ({ page }) => {
  await mockBridge(page, Array.from({ length: 12 }, (_, index) => `# Page ${index + 1}`).join("\n\n"));
  await page.goto("/");
  await page.locator("#open-button").click();
  await expect(page.locator("#status")).toHaveText("読み込み完了");
  await page.locator("#article h1").evaluateAll((headings) => {
    for (const heading of headings.slice(1)) heading.style.breakBefore = "page";
  });
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  const objects = new Map([...pdf.toString("latin1").matchAll(/(\d+) 0 obj\b([\s\S]*?)endobj/g)].map((match) => [Number(match[1]), match[2]]));
  const stream = (id) => {
    const body = objects.get(Number(id));
    const data = body.split(/stream\r?\n/)[1].split(/\r?\nendstream/)[0];
    return inflateSync(Buffer.from(data, "latin1")).toString("latin1");
  };
  const pages = [...objects.values()].filter((body) => /\/Type \/Page\b/.test(body));
  expect(pages).toHaveLength(12);
  for (const [index, body] of pages.entries()) {
    const content = stream(body.match(/\/Contents (\d+) 0 R/)[1]);
    const footer = content.match(/BT\s*\/(F\d+) 12 Tf\s*1 0 0 -1 ([\d.]+) ([\d.]+) Tm\s*<([A-Fa-f\d]+)> Tj/);
    expect(footer, `page ${index + 1} must have a footer`).not.toBeNull();
    const fontId = body.match(new RegExp(`/${footer[1]} (\\d+) 0 R`))[1];
    const cmap = stream(objects.get(Number(fontId)).match(/\/ToUnicode (\d+) 0 R/)[1]);
    const mapping = new Map();
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const match of block[1].matchAll(/<([\dA-Fa-f]+)> <([\dA-Fa-f]+)>/g)) {
        mapping.set(parseInt(match[1], 16), parseInt(match[2], 16));
      }
    }
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const match of block[1].matchAll(/<([\dA-Fa-f]+)> <([\dA-Fa-f]+)> <([\dA-Fa-f]+)>/g)) {
        const start = parseInt(match[1], 16), end = parseInt(match[2], 16), unicode = parseInt(match[3], 16);
        for (let glyph = start; glyph <= end; glyph++) mapping.set(glyph, unicode + glyph - start);
      }
    }
    const number = footer[4].match(/.{4}/g).map((glyph) => String.fromCodePoint(mapping.get(parseInt(glyph, 16)))).join("");
    expect(number).toBe(String(index + 1));
    const [, pageWidth, pageHeight] = body.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/).map(Number);
    const textWidth = await page.evaluate((number) => {
      const context = document.createElement("canvas").getContext("2d");
      context.font = '12px "Segoe UI", sans-serif';
      return context.measureText(number).width;
    }, number);
    expect(Math.abs(Number(footer[2]) + textWidth / 2 - pageWidth / 0.75 / 2)).toBeLessThan(1.5);
    expect(Number(footer[3])).toBeGreaterThan((pageHeight - 16 / 25.4 * 72) / 0.75);
    expect(Number(footer[3])).toBeLessThan(pageHeight / 0.75);
  }
});

test("fatal rendering of a new tab restores the previous document and its export identity", async ({ page }) => {
  await mockBridge(page, "# Good document");
  await page.route("**/src/renderer.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      import {createRenderer as real, renderDiagrams} from "/src/renderer.js?actual";
      export {renderDiagrams};
      export function createRenderer(window) {
        const renderer = real(window);
        return {render: source => {
          if (source === "THROW_RENDER") throw new Error("Render failed");
          return renderer.render(source);
        }};
      }
    `
  }));
  await page.goto("/");
  await page.locator("#open-button").click();
  await expect(page.locator("#status")).toHaveText("読み込み完了");
  await page.evaluate(() => { window.nextId = 2; window.nextText = "THROW_RENDER"; });
  await page.locator("#open-button").click();
  await expect(page.locator("#notice")).toContainText("Render failed");
  await expect(page.locator("#export-button")).toBeEnabled();
  await expect(page.locator("#reload-button")).toBeEnabled();
  await expect(page.locator("#article")).toContainText("Good document");
  await expect(page.getByRole("tab")).toHaveCount(1);
  expect(await page.evaluate(() => window.activeDocument)).toBe(1);
});
