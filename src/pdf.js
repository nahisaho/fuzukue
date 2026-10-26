/** @id CODE-PDF-001 @implements REQ-PDF-001 REQ-PDF-003 */
export async function exportDocument({ article, ready, fonts, save }) {
  const errors = await ready;
  await fonts;
  if (errors.length) throw new Error(`PDF出力の前に表示エラーを解消してください: ${errors.join(" / ")}`);
  if (article.querySelector("[data-render-error], .katex-error")) {
    throw new Error("数式・画像・図に表示エラーがあるためPDFを保存できません。");
  }
  const root = article.ownerDocument.documentElement;
  root.dataset.exporting = "true";
  try {
    return await save();
  } finally {
    delete root.dataset.exporting;
  }
}
