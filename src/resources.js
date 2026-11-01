import createDOMPurify from "dompurify";

function embeddedPng(value, window) {
  const match = value?.match(/^data:image\/png;base64,([\s\S]*)$/i);
  if (!match) return null;
  const data = match[1].replace(/\s/g, "");
  if (data.length < 12 || data.length % 4 || !/^[a-z0-9+/]*={0,2}$/i.test(data)) return null;
  if (!window.atob(data.slice(0, 12)).startsWith("\x89PNG\r\n\x1a\n")) return null;
  return `data:image/png;base64,${data}`;
}

/** @id CODE-IMAGES-004 @implements REQ-IMAGES-004 */
function imageData(image, window) {
  if (image.mime === "image/png") return `data:image/png;base64,${image.data}`;
  if (image.mime !== "image/svg+xml") throw new Error("Unsupported image type.");
  const bytes = Uint8Array.from(window.atob(image.data), (character) => character.charCodeAt(0));
  const svg = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const purifier = createDOMPurify(window);
  const fragment = /^#[a-z0-9_.:-]+$/i;
  const localUrl = /^url\(\s*(["']?)#[a-z0-9_.:-]+\1\s*\)$/i;
  const color = /^(?:#[a-f0-9]{3,4}|#[a-f0-9]{6}|#[a-f0-9]{8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%+/-]+\))$/i;
  const number = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
  const length = `${number}(?:px|pt|pc|mm|cm|in|em|ex|rem|%)?`;
  const numeric = new RegExp(`^${number}$`, "i");
  const dimension = new RegExp(`^${length}$`, "i");
  const opacity = new RegExp(`^${number}%?$`, "i");
  const paint = { test: (value) => color.test(value) || localUrl.test(value) };
  const styles = {
    fill: paint, stroke: paint,
    "fill-opacity": opacity, "stroke-opacity": opacity, opacity,
    "fill-rule": /^(?:nonzero|evenodd)$/i,
    "stroke-width": dimension,
    "stroke-linecap": /^(?:butt|round|square)$/i,
    "stroke-linejoin": /^(?:miter|round|bevel)$/i,
    "stroke-miterlimit": numeric,
    "stroke-dasharray": new RegExp(`^(?:none|${length}(?:[ ,]+${length})*)$`, "i"),
    "stroke-dashoffset": dimension,
    "font-size": dimension,
    "font-family": /^[\p{L}\p{N}\s_'",.-]+$/u,
    "font-weight": /^(?:normal|bold|bolder|lighter|[1-9]\d{0,2}|1000)$/i,
    "font-style": /^(?:normal|italic|oblique)$/i,
    "text-anchor": /^(?:start|middle|end)$/i
  };
  purifier.addHook("uponSanitizeElement", (node) => {
    if (node.namespaceURI !== "http://www.w3.org/2000/svg") return;
    if (node.localName === "image" && !["href", "xlink:href"].some((attribute) => embeddedPng(node.getAttribute(attribute), window))) {
      node.remove();
      return;
    }
    for (const [property, rule] of Object.entries(styles)) {
      const value = node.style?.getPropertyValue(property).trim();
      if (value && rule.test(value)) node.setAttribute(property, value);
    }
  });
  purifier.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName === "href" || data.attrName === "xlink:href") {
      const png = node.localName === "image" && embeddedPng(data.attrValue, window);
      data.keepAttr = node.namespaceURI === "http://www.w3.org/2000/svg"
        && (node.localName === "use" && fragment.test(data.attrValue) || Boolean(png));
      if (png) data.attrValue = png;
    }
    if (/^(?:fill|stroke|filter|clip-path|mask|cursor|marker-start|marker-mid|marker-end)$/.test(data.attrName)
      && /url\s*\(|\\|\/\*/i.test(data.attrValue) && !localUrl.test(data.attrValue)) {
      data.keepAttr = false;
    }
  });
  const clean = purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use", "image"],
    ADD_DATA_URI_TAGS: ["image"],
    FORBID_TAGS: ["script", "foreignObject", "style", "feImage", "a", "animate", "set", "animateTransform", "animateMotion", "mpath"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false
  });
  if (!/<svg[\s>]/i.test(clean)) throw new Error("Invalid SVG image.");
  const encoded = new TextEncoder().encode(clean);
  let binary = "";
  for (const byte of encoded) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${window.btoa(binary)}`;
}

function waitForImage(image, source, timeoutMs) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
      if (error) reject(error);
      else resolve();
    };
    const loaded = () => finish();
    const failed = () => finish(new Error("画像を読み込めませんでした。"));
    const timer = setTimeout(() => finish(new Error("画像の読み込みがタイムアウトしました。")), timeoutMs);
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
    image.src = source;
    if (image.complete && image.naturalWidth > 0) finish();
  });
}

/** @id CODE-IMAGES-003 @implements REQ-IMAGES-003 REQ-IMAGES-002 */
export async function resolveImages(article, documentId, bridge, { timeoutMs = 15000 } = {}) {
  const window = article.ownerDocument.defaultView;
  return (await Promise.all([...article.querySelectorAll("img[data-image-src]")].map(async (image) => {
    const reference = image.dataset.imageSrc;
    image.referrerPolicy = "no-referrer";
    image.loading = "eager";
    try {
      let source;
      if (/^https?:\/\//i.test(reference)) {
        source = new URL(reference).href;
      } else {
        if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || /^[\\/]/.test(reference)) {
          throw new Error("相対パスまたはHTTP(S)の画像のみ表示できます。");
        }
        source = imageData(await bridge.readImage(documentId, reference), window);
      }
      await waitForImage(image, source, timeoutMs);
      return null;
    } catch (error) {
      const message = `${image.alt || reference}: ${error.message}`;
      const diagnostic = article.ownerDocument.createElement("span");
      diagnostic.className = "render-error image-error";
      diagnostic.dataset.renderError = "true";
      diagnostic.textContent = message;
      image.replaceWith(diagnostic);
      return message;
    }
  }))).filter(Boolean);
}
