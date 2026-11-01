import "./styles.css";
import "katex/dist/katex.min.css";
import { shellMarkup, applyTheme, buildOutline } from "./shell.js";
import { canAct } from "./policy.js";
import { createRenderer, renderDiagrams } from "./renderer.js";
import { resolveImages } from "./resources.js";
import { exportDocument } from "./pdf.js";
import { bridge } from "./bridge.js";
import { sample } from "./sample.js";
import { ReadingTabs } from "./tabs.js";

const $ = (selector) => document.querySelector(selector);
$("#app").innerHTML = shellMarkup();
const renderer = createRenderer(window);
const tabs = new ReadingTabs();
let current = null;
let busy = false;
let synchronized = true;
let ready = Promise.resolve([]);
let tabDrag = null;
let suppressTabClick = false;
const state = () => busy ? "busy" : current ? "ready" : "empty";

function notice(message, error = true) {
  $("#notice-text").textContent = message;
  $("#notice").dataset.kind = error ? "error" : "success";
  $("#notice").hidden = false;
}

function update(message) {
  if (busy) finishTabDrag(false);
  if (message) $("#status").textContent = message;
  for (const selector of ["#open-button", "#sidebar-open", "#welcome-open", "#sample-button"]) {
    $(selector).disabled = !canAct(state(), "open");
  }
  $("#export-button").disabled = !canAct(state(), "export") || !current?.id || !synchronized;
  $("#reload-button").disabled = !canAct(state(), "reload") || !current?.id || !current.path;
  $("#exit-button").disabled = !canAct(state(), "exit");
  $("#reading-pane").setAttribute("aria-busy", String(busy));
  $("#tab-strip").hidden = !tabs.items.length;
  $("#zoom-reset").textContent = `${tabs.active?.zoom ?? 100}%`;
  $("#zoom-in").disabled = busy || !tabs.active || tabs.active.zoom >= 200;
  $("#zoom-out").disabled = busy || !tabs.active || tabs.active.zoom <= 50;
  $("#zoom-reset").disabled = busy || !tabs.active;
  for (const button of $("#tabs").querySelectorAll("button")) button.disabled = busy;
}

function tabButtons() {
  const strip = $("#tabs");
  strip.replaceChildren();
  for (const tab of tabs.items) {
    const item = document.createElement("div");
    item.className = "reading-tab";
    const button = document.createElement("button");
    button.id = `tab-${tab.document.id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab === tabs.active));
    button.setAttribute("aria-controls", "document-view");
    button.tabIndex = tab === tabs.active ? 0 : -1;
    button.textContent = tab.document.name;
    button.title = tab.document.path;
    button.addEventListener("pointerdown", (event) => startTabDrag(event, tab.document.id));
    button.addEventListener("click", () => selectTab(tab.document.id));
    const close = document.createElement("button");
    close.className = "tab-close";
    close.textContent = "×";
    close.setAttribute("aria-label", `${tab.document.name} を閉じる`);
    close.addEventListener("click", () => closeTab(tab.document.id));
    item.append(button, close);
    strip.append(item);
  }
}

function startTabDrag(event, id) {
  if (event.pointerType !== "mouse" || event.button !== 0 || !canAct(state(), "switch")) return;
  const button = event.currentTarget;
  tabDrag = { id, button, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
    clientX: event.clientX, index: null, frame: null };
  button.setPointerCapture(event.pointerId);
}

function clearTabDragStyles() {
  for (const item of $("#tabs").children) item.classList.remove("tab-dragging", "tab-drop-before", "tab-drop-after");
}

function finishTabDrag(commit) {
  if (!tabDrag) return;
  const { id, button, pointerId, index, frame } = tabDrag;
  tabDrag = null;
  window.cancelAnimationFrame(frame);
  suppressTabClick = index !== null;
  clearTabDragStyles();
  if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
  if (commit && index !== null && canAct(state(), "switch")) {
    const scrollLeft = $("#tabs").scrollLeft;
    tabs.move(id, index);
    tabButtons();
    update();
    $("#tabs").scrollLeft = scrollLeft;
    document.getElementById(`tab-${id}`).focus({ preventScroll: true });
  }
}

$("#tabs").addEventListener("click", (event) => {
  if (!suppressTabClick || event.detail === 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener("pointerdown", () => { suppressTabClick = false; }, true);

document.addEventListener("pointermove", (event) => {
  if (!tabDrag || event.pointerId !== tabDrag.pointerId) return;
  if (!canAct(state(), "switch")) { finishTabDrag(false); return; }
  if (tabDrag.index === null && Math.hypot(event.clientX - tabDrag.x, event.clientY - tabDrag.y) < 5) return;
  event.preventDefault();
  tabDrag.clientX = event.clientX;
  updateTabDrag();
});

function updateTabDrag() {
  window.cancelAnimationFrame(tabDrag.frame);
  tabDrag.frame = null;
  const { clientX } = tabDrag;
  const strip = $("#tabs");
  const bounds = strip.getBoundingClientRect();
  const scrollLeft = strip.scrollLeft;
  if (clientX < bounds.left + 24) strip.scrollLeft -= 20;
  else if (clientX > bounds.right - 24) strip.scrollLeft += 20;
  clearTabDragStyles();
  const source = tabDrag.button.parentElement;
  source.classList.add("tab-dragging");
  const others = [...strip.children].filter((item) => item !== source);
  const index = others.findIndex((item) => {
    const rect = item.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });
  tabDrag.index = index < 0 ? others.length : index;
  if (others.length) {
    const target = others[tabDrag.index] ?? others.at(-1);
    target.classList.add(tabDrag.index < others.length ? "tab-drop-before" : "tab-drop-after");
  }
  if (strip.scrollLeft !== scrollLeft) tabDrag.frame = requestAnimationFrame(updateTabDrag);
}

document.addEventListener("pointerup", (event) => {
  if (event.pointerId === tabDrag?.pointerId) finishTabDrag(true);
});
document.addEventListener("pointercancel", (event) => {
  if (event.pointerId === tabDrag?.pointerId) finishTabDrag(false);
});
document.addEventListener("lostpointercapture", (event) => {
  if (event.pointerId === tabDrag?.pointerId) finishTabDrag(false);
});
window.addEventListener("blur", () => finishTabDrag(false));

function stash() {
  if (!tabs.active || current?.id !== tabs.active.document.id) return;
  const tab = tabs.active;
  tab.scroll = $("#reading-pane").scrollTop;
  tab.scrollLeft = $("#reading-pane").scrollLeft;
  tab.content = document.createDocumentFragment();
  tab.content.append(...$("#article").childNodes);
}

function resetPreview() {
  current = null;
  $("#article").replaceChildren();
  $("#outline").replaceChildren();
  $("#document-view").hidden = true;
  $("#welcome").hidden = false;
  $("#current-file").hidden = true;
  $("#toolbar-filename").textContent = "ようこそ";
  $("#document-info").textContent = "UTF-8 · Markdown Viewer";
  document.title = "Fuzukue — Markdownを、美しく。";
  $("#document-view").style.zoom = "1";
  $("#document-view").removeAttribute("aria-labelledby");
  ready = Promise.resolve([]);
}

function metadata(documentData) {
  const article = $("#article");
  $("#welcome").hidden = true;
  $("#document-view").hidden = false;
  $("#toolbar-filename").textContent = documentData.name;
  $("#sidebar-filename").textContent = documentData.name;
  $("#current-file").hidden = false;
  $("#document-view").style.zoom = String((tabs.active?.zoom ?? 100) / 100);
  $("#document-view").setAttribute("role", "tabpanel");
  if (documentData.id) $("#document-view").setAttribute("aria-labelledby", `tab-${documentData.id}`);
  document.title = `${documentData.name} — Fuzukue`;
  const outline = buildOutline(article);
  const nav = $("#outline");
  nav.replaceChildren();
  for (const heading of outline) {
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.text;
    link.style.paddingLeft = `${16 + (heading.level - 1) * 12}px`;
    link.title = heading.text;
    nav.append(link);
  }
  if (!outline.length) nav.textContent = "この文書には見出しがありません。";
  const length = [...documentData.text].length;
  $("#reading-time").textContent = `約 ${Math.max(1, Math.ceil(length / 600))} 分で読めます`;
  $("#document-info").textContent = `${length.toLocaleString("ja-JP")} 文字 · UTF-8`;
}

function restore(tab) {
  if (!tab) { resetPreview(); return; }
  current = tab.document;
  $("#article").replaceChildren(tab.content);
  metadata(current);
  ready = Promise.resolve(tab.errors);
  $("#reading-pane").scrollTop = tab.scroll;
  $("#reading-pane").scrollLeft = tab.scrollLeft;
}

async function render(documentData) {
  const article = $("#article");
  article.innerHTML = renderer.render(documentData.text);
  current = documentData;
  metadata(documentData);
  $("#reading-pane").scrollTop = 0;
  $("#reading-pane").scrollLeft = 0;
  ready = Promise.all([
    resolveImages(article, documentData.id, bridge),
    renderDiagrams(article)
  ]).then((results) => results.flat());
  const errors = await ready;
  if (errors.length) notice(`${errors.length}件の表示エラーがあります。本文中のメッセージを確認してください。`);
  return errors;
}

/** @id CODE-TABS-UI @implements REQ-TABS-002 REQ-TABS-003 REQ-TABS-004 */
async function selectTab(id) {
  if (!canAct(state(), "switch") || tabs.active?.document.id === id) return;
  const previous = tabs.active;
  busy = true;
  update("タブを切り替えています…");
  try {
    await bridge.activate(id);
    stash();
    restore(tabs.select(id));
    synchronized = true;
    tabButtons();
    update(tabs.active.errors.length ? "表示エラーあり" : "読み込み完了");
  } catch (error) {
    if (previous && tabs.active !== previous) {
      stash();
      restore(tabs.select(previous.document.id));
      tabButtons();
    }
    await recoverSelection(error);
  } finally {
    busy = false;
    update();
    if (tabs.active) document.getElementById(`tab-${tabs.active.document.id}`).focus();
  }
}

async function recoverSelection(error) {
  try {
    if (tabs.active) await bridge.activate(tabs.active.document.id);
    synchronized = true;
  } catch (rollback) {
    synchronized = false;
    error = new Error(`${error.message || error} / 選択の復元に失敗しました: ${rollback.message || rollback}`);
  }
  notice(`文書の操作に失敗しました: ${error.message || error}`);
  update("操作に失敗しました");
}

async function closeTab(id) {
  if (!canAct(state(), "close")) return;
  busy = true;
  update("タブを閉じています…");
  try {
    await bridge.close(id);
    const active = tabs.active?.document.id === id;
    if (active) {
      tabs.close(id);
      restore(tabs.active);
    } else {
      tabs.close(id);
    }
    tabButtons();
    if (active && tabs.active) await bridge.activate(tabs.active.document.id);
    synchronized = true;
    update(tabs.active ? "読み込み完了" : "準備完了");
  } catch (error) { await recoverSelection(error); }
  finally {
    busy = false;
    update();
    if (tabs.active) document.getElementById(`tab-${tabs.active.document.id}`).focus();
    else $("#welcome-open").focus();
  }
}

async function open(paths) {
  if (!canAct(state(), "open")) {
    notice("処理中です。完了してからファイルを開いてください。");
    return;
  }
  busy = true;
  update("ファイルを開いています…");
  $("#notice").hidden = true;
  try {
    const result = await bridge.open(paths);
    if (!result.documents.length && !result.errors.length) {
      update("ファイル選択をキャンセルしました");
      return;
    }
    const failures = result.errors.map(({ path, message }) => `${path}: ${message}`);
    for (const selected of result.documents) {
      const previous = tabs.active;
      const existing = tabs.items.find((tab) => tab.document.id === selected.id);
      try {
        await bridge.activate(selected.id);
        stash();
        if (existing) restore(tabs.select(selected.id));
        else {
          const tab = tabs.add(selected);
          tab.errors = await render(selected);
        }
        synchronized = true;
      } catch (error) {
        failures.push(`${selected.name}: ${error.message || error}`);
        if (!existing) {
          try { await bridge.close(selected.id); }
          catch (closeError) {
            synchronized = false;
            throw new Error(`${error.message || error} / タブの破棄に失敗しました: ${closeError.message || closeError}`);
          }
          if (tabs.items.some((tab) => tab.document.id === selected.id)) tabs.close(selected.id);
        }
        if (previous) {
          await bridge.activate(previous.document.id);
          restore(tabs.select(previous.document.id));
        } else resetPreview();
      }
    }
    if (tabs.active) await bridge.activate(tabs.active.document.id);
    tabButtons();
    if (failures.length) notice(failures.join("\n"));
    update(failures.length ? "一部のファイルを開けませんでした" : tabs.active?.errors.length ? "表示エラーあり" : "読み込み完了");
  } catch (error) {
    await recoverSelection(error);
    tabButtons();
  } finally {
    busy = false;
    update();
  }
}

async function reload() {
  if (!canAct(state(), "reload") || !tabs.active || !current?.id) return;
  const tab = tabs.active;
  busy = true;
  update("ファイルを再読み込みしています…");
  $("#notice").hidden = true;
  let rendering = false;
  try {
    const selected = await bridge.reload(tab.document.id);
    stash();
    rendering = true;
    tab.errors = await render(selected);
    tab.document = selected;
    tab.content = null;
    $("#reading-pane").scrollTop = tab.scroll;
    $("#reading-pane").scrollLeft = tab.scrollLeft;
    synchronized = true;
    tabButtons();
    update(tab.errors.length ? "表示エラーあり" : "再読み込み完了");
  } catch (error) {
    if (rendering) {
      tab.errors = [...tab.errors, error.message || String(error)];
      restore(tab);
    }
    notice(`ファイルを再読み込みできませんでした: ${error.message || error}`);
    update("再読み込みに失敗しました");
  } finally {
    busy = false;
    update();
  }
}

async function save() {
  if (!canAct(state(), "export") || !current?.id || !synchronized) return;
  busy = true;
  update("PDFを準備しています…");
  try {
    const path = await exportDocument({
      article: $("#article"), ready,
      fonts: document.fonts.ready,
      save: () => bridge.savePdf(current.id)
    });
    if (path) {
      notice(`PDFを保存しました: ${path}`, false);
      update("PDFの保存が完了しました");
    } else {
      update("PDF保存をキャンセルしました");
    }
  } catch (error) {
    notice(`PDFを保存できませんでした: ${error.message || error}`);
    update("PDF保存に失敗しました");
  } finally {
    busy = false;
    update();
  }
}

for (const selector of ["#open-button", "#sidebar-open", "#welcome-open"]) {
  $(selector).addEventListener("click", () => open());
}
$("#export-button").addEventListener("click", save);
$("#reload-button").addEventListener("click", reload);
$("#notice-close").addEventListener("click", () => { $("#notice").hidden = true; });
$("#exit-button").addEventListener("click", async () => {
  if (!canAct(state(), "exit")) return;
  try { await bridge.exit(); } catch (error) { notice(`終了できませんでした: ${error.message || error}`); }
});
$("#sample-button").addEventListener("click", async () => {
  if (!canAct(state(), "open")) return;
  busy = true;
  update("サンプルを準備しています…");
  current = { id: null, name: "はじめに.md", text: sample };
  try {
    const errors = await render(current);
    update(errors.length ? "表示エラーあり" : "サンプル表示中 · ファイルを開いて読み始めましょう");
  } catch (error) {
    resetPreview();
    notice(`サンプルを表示できませんでした: ${error.message || error}`);
    update("サンプルの表示に失敗しました");
  } finally {
    busy = false;
    update();
  }
});

function theme(value) {
  applyTheme(document, value);
  $("#theme-button").setAttribute("aria-pressed", String(value === "dark"));
  $("#theme-button").setAttribute("aria-label", `${value === "dark" ? "ライト" : "ダーク"}テーマに切り替える`);
}
theme("light");
$("#theme-button").addEventListener("click", () => theme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && tabDrag) { event.preventDefault(); finishTabDrag(false); }
  if (event.ctrlKey && event.key.toLowerCase() === "o") { event.preventDefault(); open(); }
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
  if (event.ctrlKey && event.key.toLowerCase() === "w") { event.preventDefault(); if (tabs.active) closeTab(tabs.active.document.id); }
  if (event.ctrlKey && ["+", "=", "-", "0"].includes(event.key)) {
    event.preventDefault();
    zoom(event.key === "0" ? "reset" : event.key === "-" ? "out" : "in");
  }
  if (event.ctrlKey && event.key === "Tab") {
    event.preventDefault();
    cycleTab(event.shiftKey ? -1 : 1);
  }
});

function cycleTab(delta) {
  if (!canAct(state(), "switch") || !tabs.items.length) return;
  const index = tabs.items.indexOf(tabs.active);
  selectTab(tabs.items[(index + delta + tabs.items.length) % tabs.items.length].document.id);
}

$("#tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  if (!canAct(state(), "switch") || !tabs.items.length) return;
  if (event.key === "Home" || event.key === "End") selectTab(tabs.items[event.key === "Home" ? 0 : tabs.items.length - 1].document.id);
  else cycleTab(event.key === "ArrowRight" ? 1 : -1);
});

function zoom(action) {
  if (!canAct(state(), "zoom") || !tabs.active) return;
  $("#document-view").style.zoom = String(tabs.zoom(action) / 100);
  update();
}
for (const [id, action] of [["zoom-in", "in"], ["zoom-out", "out"], ["zoom-reset", "reset"]]) {
  document.getElementById(id).addEventListener("click", () => zoom(action));
}

document.addEventListener("click", async (event) => {
  const link = event.target.closest("a");
  if (!link || !(link.closest("#article") || link.closest("#outline"))) return;
  event.preventDefault();
  const href = link.getAttribute("href");
  if (!href) return;
  if (href.startsWith("#")) {
    try {
      const target = document.getElementById(decodeURIComponent(href.slice(1)));
      if (target && $("#article").contains(target)) target.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      notice(`見出しリンクが不正です: ${error.message}`);
    }
  } else if (/^https?:\/\//i.test(href)) {
    try { await bridge.openExternal(href); } catch (error) { notice(`リンクを開けませんでした: ${error.message || error}`); }
  } else {
    notice("このリンク形式はアプリ内では開けません。");
  }
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
bridge.onDrop(
  (path, error) => error ? notice(error) : open(path),
  (active) => { $("#drop-overlay").hidden = !active; }
).catch((error) => notice(`ドラッグ＆ドロップを初期化できませんでした: ${error.message || error}`));
update();
