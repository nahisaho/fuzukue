async function rasterizeImage(image) {
  const document = image.ownerDocument;
  const canvas = document.createElement("canvas");
  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("画像の寸法が不正です。");
    // A4's 178 mm content width at 300 dpi; preserve smaller images' intrinsic layout.
    const width = Math.min(image.naturalWidth, 178 / 25.4 * 96);
    const pixelWidth = Math.ceil(width * 300 / 96);
    const pixelHeight = Math.ceil(pixelWidth * image.naturalHeight / image.naturalWidth);
    if (pixelHeight > 16384 || pixelWidth * pixelHeight > 16 * 1024 * 1024) {
      throw new Error("PDF用の画像が大きすぎます。画像を分割してください。");
    }
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PDF用の画像を描画できません。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const source = canvas.toDataURL("image/png");
    if (!source.startsWith("data:image/png;base64,")) throw new Error("PNG画像への変換に失敗しました。");
    const raster = image.cloneNode(false);
    if (!image.hasAttribute("width")) raster.width = image.naturalWidth;
    raster.src = source;
    await raster.decode();
    return raster;
  } catch (error) {
    throw new Error(`${image.alt || image.dataset.imageSrc || "SVG"}: ${error.message}`, { cause: error });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** @id CODE-PDF-001 @implements REQ-PDF-001 REQ-PDF-003 REQ-ZOOM-002 */
export async function exportDocument({ article, ready, fonts, save }) {
  const errors = await ready;
  await fonts;
  if (errors.length) throw new Error(`PDF出力の前に表示エラーを解消してください: ${errors.join(" / ")}`);
  if (article.querySelector("[data-render-error], .katex-error")) {
    throw new Error("数式・画像・図に表示エラーがあるためPDFを保存できません。");
  }
  const root = article.ownerDocument.documentElement;
  const view = article.closest("#document-view");
  const zoom = view?.style.zoom;
  const replacements = [];
  if (view) view.style.zoom = "1";
  root.dataset.exporting = "true";
  try {
    for (const image of article.querySelectorAll('img[src^="data:image/svg+xml;"]')) {
      const raster = await rasterizeImage(image);
      image.replaceWith(raster);
      replacements.push({ image, raster });
    }
    return await save();
  } finally {
    for (const { image, raster } of replacements) raster.replaceWith(image);
    delete root.dataset.exporting;
    if (view) view.style.zoom = zoom;
  }
}
