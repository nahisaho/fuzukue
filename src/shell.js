const paths = {
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a4 4 0 0 0-4-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v13a4 4 0 0 1 4-2h3z"/>',
  folder: '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  reload: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  exit: '<path d="M10 4H4v16h6m5-12 4 4-4 4m-6-4h10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  file: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v6h5M8 13h8m-8 4h5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M3 6h1m-1 6h1m-1 6h1"/>',
  check: '<path d="m5 12 4 4 10-10"/>'
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;

/** @id CODE-SHELL-001 @implements REQ-SHELL-001 */
export function shellMarkup() {
  return `
  <aside class="sidebar" aria-label="ナビゲーション">
    <div class="brand"><span class="brand-mark">${icon("book")}</span><div>fuzukue<span>YOUR READING DESK</span></div></div>
    <div class="workspace-label">WORKSPACE</div>
    <button class="sidebar-open" id="sidebar-open">${icon("folder")} ファイルを開く <kbd>Ctrl O</kbd></button>
    <div class="current-file" id="current-file" hidden>${icon("file")}<span id="sidebar-filename"></span></div>
    <div class="outline-header">${icon("list")} このドキュメント</div>
    <nav id="outline" aria-label="目次"><p class="outline-empty">ファイルを開くと、ここに<br>見出しが表示されます。</p></nav>
    <div class="sidebar-bottom"><span class="local-dot"></span>ローカルで、静かに。    <span class="version">v0.2.2</span></div>
  </aside>
  <div class="workspace">
    <header class="toolbar">
      <div class="breadcrumb">${icon("book")}<span>ライブラリ</span><span class="slash">/</span><strong id="toolbar-filename">ようこそ</strong></div>
      <div class="toolbar-actions">
        <button class="icon-button" id="theme-button" title="配色を切り替える" aria-label="ダークテーマに切り替える" aria-pressed="false">${icon("sun")}</button>
        <span class="toolbar-divider"></span>
        <button class="button subtle" id="open-button" title="Ctrl+O">${icon("folder")}<span>開く</span></button>
        <button class="icon-button" id="reload-button" disabled title="ファイルを再読み込み" aria-label="ファイルを再読み込み">${icon("reload")}</button>
        <button class="button primary" id="export-button" disabled title="Ctrl+Shift+S">${icon("download")}<span>PDFに保存</span></button>
        <button class="icon-button" id="exit-button" title="アプリを終了" aria-label="アプリを終了">${icon("exit")}</button>
      </div>
    </header>
    <div id="tab-strip" hidden>
      <div id="tabs" role="tablist" aria-label="開いている文書"></div>
      <div class="zoom-controls" aria-label="文書の倍率">
        <button id="zoom-out" disabled aria-label="縮小" title="Ctrl+-">−</button>
        <button id="zoom-reset" disabled aria-label="倍率を100%に戻す" title="Ctrl+0">100%</button>
        <button id="zoom-in" disabled aria-label="拡大" title="Ctrl++">+</button>
      </div>
    </div>
    <main id="reading-pane">
      <section id="welcome" class="welcome">
        <div class="welcome-kicker"><span></span> A LITTLE SPACE FOR BIG IDEAS</div>
        <div class="welcome-art" aria-hidden="true">
          <div class="art-shadow"></div><div class="art-paper paper-back"></div>
          <div class="art-paper paper-front"><span class="paper-tag">M<span>↓</span></span><div class="paper-heading"></div><div class="paper-line"></div><div class="paper-line short"></div><div class="paper-equation">E = mc²</div><div class="paper-line"></div><div class="paper-line medium"></div></div>
          <div class="art-spark spark-one">✧</div><div class="art-spark spark-two">+</div>
        </div>
        <h1>読むことに、<em>集中を。</em></h1>
        <p class="welcome-description">Markdownを、美しく、心地よく。<br>数式も、図も、ひとつの読みものに。</p>
        <button class="button primary welcome-open" id="welcome-open">${icon("folder")} Markdownファイルを開く ${icon("arrow")}</button>
        <p class="drop-hint">ここにファイルをドロップ <span>または</span> <kbd>Ctrl</kbd> + <kbd>O</kbd></p>
        <button id="sample-button" class="sample-button">サンプルを読んでみる <span>↗</span></button>
        <div class="feature-strip"><span>GitHub &amp; Qiita</span><span>TeX 数式</span><span>Mermaid</span><span>PDF エクスポート</span></div>
      </section>
      <section id="document-view" hidden>
        <div class="document-meta"><span class="document-kind">MARKDOWN</span><span id="reading-time"></span></div>
        <article id="article" class="markdown-body" aria-label="Markdownプレビュー"></article>
        <div class="document-end"><span></span>${icon("check")} END OF DOCUMENT<span></span></div>
      </section>
    </main>
    <footer class="statusbar"><span id="status" role="status" aria-live="polite">準備完了</span><span id="document-info">UTF-8<span class="status-separator">·</span>Markdown Viewer</span></footer>
  </div>
  <div id="notice" role="alert" hidden><span id="notice-text"></span><button id="notice-close" aria-label="通知を閉じる">×</button></div>
  <div id="drop-overlay" hidden>${icon("folder")}<strong>Markdownをここに</strong><span>ファイルを開いて読み始める</span></div>`;
}

/** @id CODE-SHELL-002 @implements REQ-SHELL-002 */
export function applyTheme(document, theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

/** @id CODE-SHELL-OUTLINE @implements REQ-SHELL-002 */
export function buildOutline(article) {
  return [...article.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((heading, index) => {
    heading.id = `fz-heading-${index + 1}`;
    return { id: heading.id, text: heading.textContent, level: Number(heading.tagName[1]) };
  });
}
