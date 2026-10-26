import "./styles.css";
import "katex/dist/katex.min.css";
import { shellMarkup, applyTheme, buildOutline } from "./shell.js";
import { canAct } from "./policy.js";
import { createRenderer, renderDiagrams } from "./renderer.js";
import { resolveImages } from "./resources.js";
import { exportDocument } from "./pdf.js";
import { bridge } from "./bridge.js";
import { sample } from "./sample.js";

const $ = (selector) => document.querySelector(selector);
$("#app").innerHTML = shellMarkup();
const renderer = createRenderer(window);
let current = null;
let busy = false;
let ready = Promise.resolve([]);
const state = () => busy ? "busy" : current ? "ready" : "empty";

function notice(message, error = true) {
  $("#notice-text").textContent = message;
  $("#notice").dataset.kind = error ? "error" : "success";
  $("#notice").hidden = false;
}

function update(message) {
  if (message) $("#status").textContent = message;
  for (const selector of ["#open-button", "#sidebar-open", "#welcome-open", "#sample-button"]) {
    $(selector).disabled = !canAct(state(), "open");
  }
  $("#export-button").disabled = !canAct(state(), "export") || !current?.id;
  $("#exit-button").disabled = !canAct(state(), "exit");
  $("#reading-pane").setAttribute("aria-busy", String(busy));
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
}

async function render(documentData) {
  const article = $("#article");
  article.innerHTML = renderer.render(documentData.text);
  $("#welcome").hidden = true;
  $("#document-view").hidden = false;
  $("#toolbar-filename").textContent = documentData.name;
  $("#sidebar-filename").textContent = documentData.name;
  $("#current-file").hidden = false;
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
  $("#reading-pane").scrollTop = 0;
  ready = Promise.all([
    resolveImages(article, documentData.id, bridge),
    renderDiagrams(article)
  ]).then((results) => results.flat());
  const errors = await ready;
  if (errors.length) notice(`${errors.length}件の表示エラーがあります。本文中のメッセージを確認してください。`);
  return errors;
}

async function open(path) {
  if (!canAct(state(), "open")) {
    notice("処理中です。完了してからファイルを開いてください。");
    return;
  }
  busy = true;
  update("ファイルを開いています…");
  $("#notice").hidden = true;
  let selected = null;
  try {
    selected = await bridge.open(path);
    if (!selected) {
      update("ファイル選択をキャンセルしました");
      return;
    }
    const errors = await render(selected);
    current = selected;
    update(errors.length ? "表示エラーあり" : "読み込み完了");
  } catch (error) {
    if (selected) resetPreview();
    notice(`ファイルを開けませんでした: ${error.message || error}`);
    update("読み込みに失敗しました");
  } finally {
    busy = false;
    update();
  }
}

async function save() {
  if (!canAct(state(), "export") || !current?.id) return;
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
  if (event.ctrlKey && event.key.toLowerCase() === "o") { event.preventDefault(); open(); }
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
});

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
