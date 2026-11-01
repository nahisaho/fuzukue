import { test } from "node:test";
import assert from "node:assert/strict";
import { ReadingTabs } from "../src/tabs.js";
import { JSDOM } from "jsdom";
import { shellMarkup } from "../src/shell.js";
import { exportDocument } from "../src/pdf.js";
import { canAct } from "../src/policy.js";

const doc = (id) => ({ id, path: `C:/docs/${id}.md`, name: `${id}.md`, text: `# ${id}` });

test("tab operation policy enumerates all empty/ready/busy cells", () => {
  for (const [state, expected] of [["empty", false], ["ready", true], ["busy", false]]) {
    for (const action of ["switch", "close", "zoom"]) assert.equal(canAct(state, action), expected, `${state}/${action}`);
  }
});

/** @id TEST-TABS-003 @verifies REQ-TABS-003 */
test("TEST-TABS-003 tab selection and close preserve independent reading state", () => {
  const tabs = new ReadingTabs();
  assert.equal(tabs.active, null);
  const first = tabs.add(doc(1));
  first.scroll = 470;
  first.scrollLeft = 32;
  first.content = "cached nodes";
  tabs.add(doc(2));
  tabs.add(doc(3));
  assert.equal(tabs.select(1), first);
  assert.equal(tabs.active.scroll, 470);
  assert.equal(tabs.active.scrollLeft, 32);
  assert.equal(tabs.active.content, "cached nodes");
  tabs.close(2);
  assert.equal(tabs.active, first);
  tabs.add(doc(4));
  tabs.select(3);
  tabs.close(3);
  assert.equal(tabs.active.document.id, 4);
  tabs.close(4);
  assert.equal(tabs.active, first);
  tabs.close(1);
  assert.equal(tabs.active, null);
  assert.deepEqual(tabs.items, []);
  assert.throws(() => tabs.select(999));
  assert.throws(() => tabs.close(999));
  const document = new JSDOM(shellMarkup()).window.document;
  assert.ok(document.querySelector('[role="tablist"]'));
  assert.equal(document.querySelector("#export-button").disabled, true);
});

test("moving tabs in both directions preserves selection and reading state and changes close order", () => {
  const tabs = new ReadingTabs();
  const first = tabs.add(doc(1));
  first.scroll = 470;
  first.scrollLeft = 32;
  first.zoom = 120;
  first.content = "cached nodes";
  first.errors = ["image error"];
  const second = tabs.add(doc(2));
  const third = tabs.add(doc(3));
  tabs.select(1);
  tabs.move(1, 2);
  assert.deepEqual(tabs.items, [second, third, first]);
  assert.equal(tabs.active, first);
  tabs.move(1, 0);
  tabs.move(3, 0);
  assert.deepEqual(tabs.items, [third, first, second]);
  assert.equal(tabs.active, first);
  assert.deepEqual(
    [first.scroll, first.scrollLeft, first.zoom, first.content, first.errors],
    [470, 32, 120, "cached nodes", ["image error"]]
  );
  tabs.move(1, 1);
  assert.deepEqual(tabs.items, [third, first, second]);
  for (const index of [-1, 3, 1.5]) assert.throws(() => tabs.move(1, index), /移動先/);
  assert.throws(() => tabs.move(999, 0), /見つかりません/);
  assert.deepEqual(tabs.items, [third, first, second]);
  tabs.close(1);
  assert.equal(tabs.active, second);
});

/** @id TEST-ZOOM-001 @verifies REQ-ZOOM-001 */
test("TEST-ZOOM-001 zoom is tab-specific, bounded and starts at 100", () => {
  const tabs = new ReadingTabs();
  assert.throws(() => tabs.zoom("in"));
  const first = tabs.add(doc(1));
  assert.equal(first.zoom, 100);
  assert.equal(tabs.zoom("in"), 110);
  for (let i = 0; i < 30; i++) tabs.zoom("in");
  assert.equal(first.zoom, 200);
  const second = tabs.add(doc(2));
  assert.equal(second.zoom, 100);
  assert.equal(tabs.zoom("out"), 90);
  for (let i = 0; i < 30; i++) tabs.zoom("out");
  assert.equal(second.zoom, 50);
  tabs.select(1);
  assert.equal(tabs.active.zoom, 200);
  assert.equal(second.zoom, 50);
  assert.equal(tabs.zoom("reset"), 100);
  assert.throws(() => tabs.zoom("invalid"));
  assert.equal(first.zoom, 100);
  const document = new JSDOM(shellMarkup()).window.document;
  for (const id of ["zoom-in", "zoom-out", "zoom-reset"]) {
    assert.ok(document.getElementById(id));
    assert.equal(document.getElementById(id).disabled, true);
  }
});

/** @id TEST-ZOOM-002 @verifies REQ-ZOOM-002 */
test("TEST-ZOOM-002 export temporarily removes document zoom on all native outcomes", async () => {
  const { document } = new JSDOM('<section id="document-view" style="zoom:1.7"><article></article></section>').window;
  const article = document.querySelector("article");
  const view = article.parentElement;
  view.style.zoom = "1.7";
  for (const outcome of ["saved.pdf", null, new Error("Native failure")]) {
    let captured = false;
    const operation = exportDocument({
      article, ready: Promise.resolve([]), fonts: Promise.resolve(),
      save: async () => {
        assert.equal(view.style.zoom, "1");
        assert.equal(document.documentElement.dataset.exporting, "true");
        captured = true;
        if (outcome instanceof Error) throw outcome;
        return outcome;
      }
    });
    if (outcome instanceof Error) await assert.rejects(operation, /Native failure/);
    else assert.equal(await operation, outcome);
    assert.equal(captured, true);
    assert.equal(view.style.zoom, "1.7");
    assert.equal(document.documentElement.dataset.exporting, undefined);
  }
});
