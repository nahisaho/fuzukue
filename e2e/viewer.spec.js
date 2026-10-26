import { test, expect } from "@playwright/test";
import { sample } from "../src/sample.js";
import { Buffer } from "node:buffer";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=";

async function mockBridge(page, text = sample, svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="green"/></svg>') {
  await page.route("**/src/bridge.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      export const bridge = {
        open: async () => ({id:1,name:"テスト.md",path:"C:/docs/テスト.md",text:window.nextText ?? ${JSON.stringify(text)}}),
        readImage: async (_id, reference) => reference.endsWith(".png")
          ? {mime:"image/png",data:"${png}"}
          : {mime:"image/svg+xml",data:${JSON.stringify(Buffer.from(svg).toString("base64"))}},
        savePdf: async () => {
          window.exportPalette = document.documentElement.dataset.exporting;
          return "C:/docs/テスト.pdf";
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
  await page.screenshot({ path: "test-results/welcome.png" });
  await page.getByRole("button", { name: "ダークテーマに切り替える" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 760, height: 560 });
  await expect(page.locator("#welcome-open")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
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

test("fatal render failure cannot export old content under a new document", async ({ page }) => {
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
  await page.evaluate(() => { window.nextText = "THROW_RENDER"; });
  await page.locator("#open-button").click();
  await expect(page.locator("#notice")).toContainText("Render failed");
  await expect(page.locator("#export-button")).toBeDisabled();
  await expect(page.locator("#welcome")).toBeVisible();
});
