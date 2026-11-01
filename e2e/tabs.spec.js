import { test, expect } from "@playwright/test";

async function setup(page) {
  await page.route("**/src/bridge.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      const docs = new Map([
        ["a.md", {id:1,path:"C:/a/read.md",name:"read.md",text:"# Alpha\\n\\n"+Array.from({length:100},(_,i)=>"Paragraph "+i+"\\n").join("\\n")}],
        ["b.md", {id:2,path:"C:/b/read.md",name:"read.md",text:"# Beta\\n\\n![Plot](plot.svg)"}],
        ["c.md", {id:3,path:"C:/docs/c.md",name:"c.md",text:"# Gamma"}]
      ]);
      const opened = new Map();
      let active = null;
      export const bridge = {
        open: async paths => {
          window.dialogRequests = (window.dialogRequests ?? 0) + (paths ? 0 : 1);
          const result = {documents:[], errors:[]};
          for (const path of paths ?? window.pickedPaths ?? ["a.md"]) {
            const doc=docs.get(path) ?? window.extraDocs?.[path];
            if (!doc) result.errors.push({path,message:"Cannot read file"});
            else {opened.set(doc.id,doc);active=doc.id;result.documents.push(doc);}
          }
          return result;
        },
        activate: async id => {
          if (window.rejectActivation === id) throw new Error("Cannot activate");
          if (!opened.has(id)) throw new Error("Closed document");
          active=id;window.activeId=id;
        },
        reload: async id => {
          (window.reloadIds ??= []).push(id);
          if(window.delayReload) await new Promise(resolve=>{window.finishReload=resolve});
          if(window.reloadError) throw new Error(window.reloadError);
          if(id!==active || !opened.has(id)) throw new Error("Wrong selected ID");
          const doc={...opened.get(id),text:window.reloadText ?? opened.get(id).text};
          opened.set(id,doc);
          return doc;
        },
        close: async id => {
          if (window.rejectClose) throw new Error("Cannot close");
          const ids=[...opened.keys()];const index=ids.indexOf(id);
          opened.delete(id);
          if(active===id) active=[...opened.keys()][index] ?? [...opened.keys()].at(-1) ?? null;
          window.activeId=active;
        },
        readImage: async id => {
          window.imageDocument=id;
          return {mime:"image/svg+xml", data:btoa('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="red"/></svg>')};
        },
        savePdf: async id => {
          if(id!==active) throw new Error("Wrong selected ID");
          window.capture={id,zoom:document.querySelector("#document-view").style.zoom,
            text:document.querySelector("#article").textContent};
          if(window.delayPdf) await new Promise(resolve=>{window.finishPdf=resolve});
          if(window.failPdf) throw new Error("Native PDF failure");
          return window.cancelPdf ? null : "C:/saved.pdf";
        },
        openExternal:async()=>{},exit:async()=>{},
        onDrop:async handler=>{window.dropFiles=handler;return()=>{}}
      };`
  }));
  await page.goto("/");
}

async function dragTab(page, from, to, side) {
  const source = await page.getByRole("tab").nth(from).boundingBox();
  const target = await page.locator(".reading-tab").nth(to).boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + (side === "left" ? 2 : target.width - 2), target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
}

test("mouse dragging reorders tabs both ways without changing selection or reading state", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.pickedPaths = ["a.md", "b.md", "c.md"]; });
  await page.locator("#open-button").click();
  await page.getByRole("tab").first().click();
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await page.locator("#zoom-in").click();
  await page.locator("#reading-pane").evaluate(el => { el.scrollTop = 500; });
  const scroll = await page.locator("#reading-pane").evaluate(el => el.scrollTop);
  const order = () => page.getByRole("tab").evaluateAll(elements => elements.map(el => el.id));
  await dragTab(page, 0, 2, "right");
  expect(await order()).toEqual(["tab-2", "tab-3", "tab-1"]);
  await expect(page.getByRole("tab", { selected: true })).toHaveAttribute("id", "tab-1");
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await expect(page.locator("#zoom-reset")).toHaveText("110%");
  expect(await page.locator("#reading-pane").evaluate(el => el.scrollTop)).toBe(scroll);
  expect(await page.evaluate(() => window.activeId)).toBe(1);
  await dragTab(page, 2, 0, "left");
  expect(await order()).toEqual(["tab-1", "tab-2", "tab-3"]);
  await dragTab(page, 2, 0, "left");
  expect(await order()).toEqual(["tab-3", "tab-1", "tab-2"]);
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await page.keyboard.press("Control+Shift+Tab");
  await expect(page.locator("#article h1")).toHaveText("Gamma");
  await page.getByRole("button", { name: "c.md を閉じる", exact: true }).click();
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await page.locator("#export-button").click();
  await expect(page.locator("#export-button")).toBeEnabled();
  expect(await page.evaluate(() => window.capture.id)).toBe(1);
  await expect(page.locator("#zoom-reset")).toHaveText("110%");
  expect(await page.locator("#reading-pane").evaluate(el => el.scrollTop)).toBe(scroll);
});

test("cancelled drags and busy operations do not reorder tabs, and clicks still select", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.pickedPaths = ["a.md", "b.md"]; });
  await page.locator("#open-button").click();
  const source = await page.getByRole("tab").first().boundingBox();
  const target = await page.locator(".reading-tab").nth(1).boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width - 2, target.y + target.height / 2, { steps: 5 });
  await expect(page.locator(".tab-drop-after")).toHaveCount(1);
  await page.getByRole("tab").first().dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse" });
  await page.mouse.up();
  await expect(page.locator(".tab-dragging, .tab-drop-after")).toHaveCount(0);
  await expect(page.getByRole("tab").first()).toHaveAttribute("id", "tab-1");
  await page.getByRole("tab").first().click();
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await page.evaluate(() => { window.delayPdf = true; });
  await page.locator("#export-button").click();
  await expect.poll(() => page.evaluate(() => typeof window.finishPdf)).toBe("function");
  await dragTab(page, 0, 1, "right");
  await expect(page.getByRole("tab").first()).toHaveAttribute("id", "tab-1");
  await expect(page.locator(".tab-dragging")).toHaveCount(0);
  await page.evaluate(() => window.finishPdf());
  await expect(page.locator("#export-button")).toBeEnabled();
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator("#article h1")).toHaveText("Beta");
});

test("holding the mouse at either edge scrolls overflowing tabs and stops after release", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    window.extraDocs = Object.fromEntries(Array.from({ length: 17 }, (_, i) => {
      const name = `long-document-name-${i + 4}.md`;
      return [name, { id: i + 4, path: `C:/docs/${name}`, name, text: `# Document ${i + 4}` }];
    }));
    window.pickedPaths = ["a.md", "b.md", "c.md", ...Object.keys(window.extraDocs)];
  });
  await page.locator("#open-button").click();
  await expect(page.getByRole("tab")).toHaveCount(20);
  await page.getByRole("tab").first().click();
  const strip = page.locator("#tabs");
  await strip.evaluate(el => { el.scrollLeft = 0; });
  const bounds = await strip.boundingBox();
  for (const side of ["right", "left"]) {
    const source = await page.locator("#tab-1").boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(side === "right" ? bounds.x + bounds.width - 2 : bounds.x + 2,
      source.y + source.height / 2, { steps: 5 });
    await expect.poll(() => strip.evaluate((el, direction) =>
      direction === "right" ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft,
    side)).toBe(0);
    await page.mouse.up();
    await expect(page.getByRole("tab").nth(side === "right" ? 19 : 0)).toHaveAttribute("id", "tab-1");
    await expect(page.getByRole("tab", { selected: true })).toHaveAttribute("id", "tab-1");
    await expect(page.locator("#article h1")).toHaveText("Alpha");
    await expect(page.locator(".tab-dragging, .tab-drop-before, .tab-drop-after")).toHaveCount(0);
    const scroll = await strip.evaluate(el => el.scrollLeft);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await strip.evaluate(el => el.scrollLeft)).toBe(scroll);
  }
});

test("Escape, capture loss and window blur cancel drags without selecting the dragged tab", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.pickedPaths = ["a.md", "b.md"]; });
  await page.locator("#open-button").click();
  for (const cancellation of ["escape", "capture", "blur"]) {
    const source = await page.getByRole("tab").first().boundingBox();
    const target = await page.locator(".reading-tab").nth(1).boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width - 2, target.y + target.height / 2, { steps: 5 });
    await expect(page.locator(".tab-drop-after")).toHaveCount(1);
    if (cancellation === "escape") await page.keyboard.press("Escape");
    else if (cancellation === "capture") {
      await page.getByRole("tab").first().evaluate(el => el.releasePointerCapture(1));
    } else await page.evaluate(() => window.dispatchEvent(new window.Event("blur")));
    await page.mouse.up();
    await expect(page.locator(".tab-dragging, .tab-drop-before, .tab-drop-after")).toHaveCount(0);
    await expect(page.getByRole("tab").first()).toHaveAttribute("id", "tab-1");
    await expect(page.getByRole("tab", { selected: true })).toHaveAttribute("id", "tab-2");
    await expect(page.locator("#article h1")).toHaveText("Beta");
  }
  await page.getByRole("tab").first().click();
  await expect(page.locator("#article h1")).toHaveText("Alpha");
});

test("failed activation after closing a reordered tab updates the strip and blocks unsynchronized export", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.pickedPaths = ["a.md", "b.md", "c.md"]; });
  await page.locator("#open-button").click();
  await dragTab(page, 2, 0, "left");
  await page.evaluate(() => { window.rejectActivation = 1; });
  await page.getByRole("button", { name: "c.md を閉じる", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { selected: true })).toHaveAttribute("id", "tab-1");
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await expect(page.locator("#notice")).toContainText("Cannot activate");
  await expect(page.locator("#export-button")).toBeDisabled();
  await page.evaluate(() => { window.rejectActivation = null; });
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator("#article h1")).toHaveText("Beta");
  await expect(page.locator("#export-button")).toBeEnabled();
});

test("batch dialog/drop, duplicate focus, cached scroll and deterministic closing", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.pickedPaths = ["a.md", "bad.md", "b.md"]; });
  await page.locator("#open-button").click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { selected: true })).toHaveAttribute("title", "C:/b/read.md");
  await expect(page.locator("#article h1")).toHaveText("Beta");
  await expect(page.locator("#notice")).toContainText("bad.md: Cannot read file");
  expect(await page.evaluate(() => window.imageDocument)).toBe(2);
  await page.getByRole("tab").first().click();
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await page.locator("#reading-pane").evaluate(el => { el.scrollTop = 500; });
  const scroll = await page.locator("#reading-pane").evaluate(el => el.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await page.getByRole("tab").nth(1).click();
  await page.evaluate(() => window.dropFiles(["c.md", "a.md"]));
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  expect(await page.locator("#reading-pane").evaluate(el => el.scrollTop)).toBe(scroll);
  await page.keyboard.press("Control+Tab");
  await expect(page.locator("#article h1")).toHaveText("Beta");
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();
  await page.keyboard.press("Control+Shift+Tab");
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await page.keyboard.press("Control+Tab");
  await expect(page.locator("#article h1")).toHaveText("Beta");
  await page.keyboard.press("Control+w");
  await expect(page.locator("#article h1")).toHaveText("Gamma");
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();
  expect(await page.evaluate(() => window.activeId)).toBe(3);
  await page.keyboard.press("Control+w");
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await page.keyboard.press("Control+w");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#export-button")).toBeDisabled();
  await expect(page.locator("#reload-button")).toBeDisabled();
  await expect(page.locator("#welcome-open")).toBeFocused();
  expect(await page.evaluate(() => window.dialogRequests)).toBe(1);
});

test("closing an inactive tab and cancelled or failed opens leave reading state intact", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.pickedPaths=["a.md","b.md"]; });
  await page.locator("#open-button").click();
  await page.getByRole("tab").first().click();
  await page.locator("#reading-pane").evaluate(el => {el.scrollTop=500;});
  await page.locator("#zoom-in").click();
  const scroll = await page.locator("#reading-pane").evaluate(el => el.scrollTop);
  await page.getByRole("button", {name:"read.md を閉じる",exact:true}).nth(1).click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  for (const paths of [[], ["bad.md"]]) {
    await page.evaluate(value=>{window.pickedPaths=value;}, paths);
    await page.locator("#open-button").click();
    await expect(page.locator("#open-button")).toBeEnabled();
    await expect(page.locator("#article h1")).toHaveText("Alpha");
    await expect(page.locator("#zoom-reset")).toHaveText("110%");
    expect(await page.locator("#reading-pane").evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.evaluate(() => window.activeId)).toBe(1);
  }
});

test("document-only zoom is tab-specific, bounded and never changes PDF scale", async ({ page }) => {
  await setup(page);
  await page.locator("#open-button").click();
  const toolbarHeight = await page.locator(".toolbar").evaluate(el => el.getBoundingClientRect().height);
  await page.locator("#zoom-in").click();
  await page.keyboard.press("Control+=");
  await expect(page.locator("#zoom-reset")).toHaveText("120%");
  expect(await page.locator("#document-view").evaluate(el => getComputedStyle(el).zoom)).toBe("1.2");
  expect(await page.locator(".toolbar").evaluate(el => el.getBoundingClientRect().height)).toBe(toolbarHeight);
  await page.evaluate(() => window.dropFiles(["b.md"]));
  await expect(page.locator("#zoom-reset")).toHaveText("100%");
  await page.keyboard.press("Control+-");
  await expect(page.locator("#zoom-reset")).toHaveText("90%");
  await page.getByRole("tab").first().click();
  await expect(page.locator("#zoom-reset")).toHaveText("120%");
  for (const outcome of ["success", "cancel", "failure"]) {
    await page.evaluate(value => { window.cancelPdf=value==="cancel";window.failPdf=value==="failure"; }, outcome);
    await page.locator("#export-button").click();
    await expect(page.locator("#export-button")).toBeEnabled();
    expect(await page.evaluate(() => window.capture)).toMatchObject({id:1,zoom:"1"});
    expect(await page.evaluate(() => window.capture.text)).not.toContain("Beta");
    await expect(page.locator("#zoom-reset")).toHaveText("120%");
    expect(await page.locator("#document-view").evaluate(el => getComputedStyle(el).zoom)).toBe("1.2");
  }
  await page.emulateMedia({media:"print"});
  expect(await page.locator("#document-view").evaluate(el => getComputedStyle(el).zoom)).toBe("1");
  await expect(page.locator("#tab-strip")).toBeHidden();
  await page.emulateMedia({media:"screen"});
  for (let i=0;i<20;i++) await page.keyboard.press("Control+=");
  await expect(page.locator("#zoom-reset")).toHaveText("200%");
  await expect(page.locator("#zoom-in")).toBeDisabled();
  for (let i=0;i<20;i++) await page.keyboard.press("Control+-");
  await expect(page.locator("#zoom-reset")).toHaveText("50%");
  await expect(page.locator("#zoom-out")).toBeDisabled();
  await page.keyboard.press("Control+0");
  await expect(page.locator("#zoom-reset")).toHaveText("100%");
});

test("busy capture locks tabs, close, open and zoom until completion; native failures preserve selection", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.pickedPaths=["a.md","b.md"]; });
  await page.locator("#open-button").click();
  await expect(page.locator("#article h1")).toHaveText("Beta");
  await page.evaluate(() => { window.rejectActivation=1; });
  await page.getByRole("tab").first().click();
  await expect(page.locator("#notice")).toContainText("Cannot activate");
  await expect(page.locator("#article h1")).toHaveText("Beta");
  await page.evaluate(() => { window.rejectClose=true; });
  await page.keyboard.press("Control+w");
  await expect(page.locator("#notice")).toContainText("Cannot close");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.evaluate(() => { window.delayPdf=true; });
  await page.locator("#export-button").click();
  await expect.poll(() => page.evaluate(() => typeof window.finishPdf)).toBe("function");
  await expect(page.getByRole("tab").first()).toBeDisabled();
  await expect(page.locator("#zoom-in")).toBeDisabled();
  await expect(page.locator("#reload-button")).toBeDisabled();
  await page.keyboard.press("Control+Tab");
  await page.keyboard.press("Control+w");
  await page.keyboard.press("Control+=");
  await page.evaluate(() => window.dropFiles(["c.md"]));
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator("#article h1")).toHaveText("Beta");
  await expect(page.locator("#zoom-reset")).toHaveText("100%");
  await page.evaluate(() => window.finishPdf());
  await expect(page.locator("#export-button")).toBeEnabled();
  await expect(page.locator("#zoom-in")).toBeEnabled();
  expect(await page.evaluate(() => window.capture.id)).toBe(2);
});

test("reload preserves tabs and per-tab reading state and exports only refreshed active content", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.pickedPaths = ["a.md", "b.md"]; });
  await page.locator("#open-button").click();
  await page.getByRole("tab").first().click();
  await page.locator("#zoom-in").click();
  await page.locator("#reading-pane").evaluate(el => { el.scrollTop = 500; });
  const scroll = await page.locator("#reading-pane").evaluate(el => el.scrollTop);
  await page.getByRole("tab").nth(1).click();
  await page.locator("#zoom-out").click();
  await page.evaluate(() => {
    window.reloadText = "# Updated Beta\n\n![New plot](plot.svg)";
    window.delayReload = true;
  });
  await page.locator("#reload-button").click();
  await expect.poll(() => page.evaluate(() => typeof window.finishReload)).toBe("function");
  await expect(page.getByRole("tab").first()).toBeDisabled();
  await expect(page.locator(".tab-close").first()).toBeDisabled();
  await expect(page.locator("#zoom-in")).toBeDisabled();
  await page.keyboard.press("Control+Tab");
  await page.keyboard.press("Control+w");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.evaluate(() => window.finishReload());
  await expect(page.locator("#status")).toHaveText("再読み込み完了");
  await expect(page.locator("#article h1")).toHaveText("Updated Beta");
  await expect(page.locator("#outline a")).toHaveText("Updated Beta");
  await expect(page.locator('#article img[alt="New plot"]')).toHaveJSProperty("naturalWidth", 12);
  await expect(page.locator("#zoom-reset")).toHaveText("90%");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.locator("#export-button").click();
  await expect(page.locator("#export-button")).toBeEnabled();
  expect(await page.evaluate(() => window.capture)).toMatchObject({id: 2, zoom: "1"});
  expect(await page.evaluate(() => window.capture.text)).toContain("Updated Beta");
  await page.getByRole("tab").first().click();
  await expect(page.locator("#article h1")).toHaveText("Alpha");
  await expect(page.locator("#zoom-reset")).toHaveText("110%");
  expect(await page.locator("#reading-pane").evaluate(el => el.scrollTop)).toBe(scroll);
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator("#article h1")).toHaveText("Updated Beta");
  expect(await page.evaluate(() => window.reloadIds)).toEqual([2]);
  expect(await page.evaluate(() => window.dialogRequests)).toBe(1);
});

test("fatal reload rendering restores the preview, blocks stale PDF and allows retry after switching tabs", async ({ page }) => {
  await page.route("**/src/renderer.js", route => route.fulfill({
    contentType: "application/javascript",
    body: `
      import {createRenderer as real, renderDiagrams} from "/src/renderer.js?actual";
      export {renderDiagrams};
      export function createRenderer(window) {
        const renderer=real(window);
        return {render:source=>{
          if(source==="THROW_RENDER") throw new Error("Reload render failed");
          return renderer.render(source);
        }};
      }`
  }));
  await setup(page);
  await page.evaluate(() => { window.pickedPaths = ["a.md", "b.md"]; });
  await page.locator("#open-button").click();
  await page.evaluate(() => { window.reloadText = "THROW_RENDER"; });
  await page.locator("#reload-button").click();
  await expect(page.locator("#notice")).toContainText("Reload render failed");
  await expect(page.locator("#article h1")).toHaveText("Beta");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("tab").first().click();
  await page.getByRole("tab").nth(1).click();
  await page.locator("#export-button").click();
  await expect(page.locator("#notice")).toContainText("PDFを保存できませんでした");
  expect(await page.evaluate(() => window.capture)).toBeUndefined();
  await page.evaluate(() => { window.reloadText = "# Recovered Beta"; });
  await page.locator("#reload-button").click();
  await expect(page.locator("#status")).toHaveText("再読み込み完了");
  await expect(page.locator("#article h1")).toHaveText("Recovered Beta");
  await page.locator("#export-button").click();
  await expect(page.locator("#notice")).toContainText("PDFを保存しました");
  expect(await page.evaluate(() => window.capture.id)).toBe(2);
});
