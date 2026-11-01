import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { shellMarkup, applyTheme, buildOutline } from "../src/shell.js";
import { canAct } from "../src/policy.js";
import { createRenderer, renderDiagrams } from "../src/renderer.js";
import { resolveImages } from "../src/resources.js";
import { exportDocument } from "../src/pdf.js";

const dom = (html = "") => new JSDOM(html, { url: "http://localhost/" });

/** @id TEST-SHELL-001 @verifies REQ-SHELL-001 */
test("TEST-SHELL-001 empty shell has accessible native actions", () => {
  const { document } = dom(shellMarkup()).window;
  assert.ok(document.querySelector("#open-button"));
  assert.equal(document.querySelector("#export-button").disabled, true);
  assert.equal(document.querySelector("#reload-button").disabled, true);
  assert.ok(document.querySelector("#theme-button"));
  assert.ok(document.querySelector("#exit-button"));
  assert.ok(document.querySelector('[role="status"]'));
});

/** @id TEST-SHELL-002 @verifies REQ-SHELL-002 */
test("TEST-SHELL-002 theme and duplicate heading outline", () => {
  const { document } = dom("<article><h1>日本語</h1><h2>日本語</h2><h2>Other</h2></article>").window;
  applyTheme(document, "dark");
  assert.equal(document.documentElement.dataset.theme, "dark");
  applyTheme(document, "light");
  assert.equal(document.documentElement.dataset.theme, "light");
  const outline = buildOutline(document.querySelector("article"));
  assert.equal(outline.length, 3);
  assert.equal(new Set(outline.map((item) => item.id)).size, 3);
  assert.equal(outline[0].text, "日本語");
  assert.equal(document.querySelector("h1").id, outline[0].id);
});

/** @id TEST-FILES-003 @verifies REQ-FILES-003 */
test("TEST-FILES-003 action policy enumerates every state and operation", () => {
  const expected = {
    empty: { open: true, reload: false, export: false, exit: true },
    ready: { open: true, reload: true, export: true, exit: true },
    busy: { open: false, reload: false, export: false, exit: false }
  };
  for (const [state, actions] of Object.entries(expected)) {
    for (const [action, allowed] of Object.entries(actions)) {
      assert.equal(canAct(state, action), allowed, `${state}/${action}`);
    }
  }
  assert.equal(canAct("unknown", "open"), false);
  assert.equal(canAct("ready", "unknown"), false);
});

/** @id TEST-MARKDOWN-001 @verifies REQ-MARKDOWN-001 */
test("TEST-MARKDOWN-001 GFM and Qiita semantic extensions", () => {
  const { window } = dom();
  const html = createRenderer(window).render(`
# Article

| name | value |
| --- | --- |
| a | b |

- [x] done
- [ ] todo

~~removed~~ and footnote[^one].

[^one]: Footnote body.

\`\`\`rust:main.rs
fn main() {}
\`\`\`

:::note warn
Careful
:::

<details><summary>More</summary>

Body **inside** the fold.

</details>
`);
  for (const expected of ["<table", 'type="checkbox"', "<s>", "footnote", "hljs", "main.rs", "note-warn", "<details", "<summary"]) {
    assert.ok(html.includes(expected), expected);
  }
  const details = dom(html).window.document.querySelector("details");
  assert.match(details.textContent, /Body inside the fold/);
  assert.equal(details.querySelector("strong").textContent, "inside");
});

/** @id TEST-MARKDOWN-002 @verifies REQ-MARKDOWN-002 */
test("TEST-MARKDOWN-002 math fences, dollars and diagram diagnostics", async () => {
  const { window } = dom();
  const renderer = createRenderer(window);
  const html = renderer.render("$x^2 + \\sqrt{\\pi}$\\n\\n$$\\ny=2\\n$$\\n\\n```math\\na+b\\n```".replaceAll("\\n", "\n"));
  assert.equal((html.match(/class="katex"/g) || []).length, 3);
  assert.match(html, /<svg[\s>]/);
  const invalidMath = renderer.render("```math\n\\definitelyUnknownCommand\n```");
  assert.ok(invalidMath.includes("katex-error") || invalidMath.includes("data-render-error"));
  const document = window.document;
  document.body.innerHTML = renderer.render("```mermaid\ngraph LR; A-->B\n```\n\n```mermaid\ninvalid\n```");
  const errors = await renderDiagrams(document.body, async (_id, source) => {
    if (source.trim() === "invalid") throw new Error("Invalid graph");
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Graph</text></svg>' };
  });
  assert.ok(document.querySelector("svg"));
  assert.equal(errors.length, 1);
  assert.match(document.body.textContent, /Invalid graph/);
});

/** @id TEST-MARKDOWN-003 @verifies REQ-MARKDOWN-003 */
test("TEST-MARKDOWN-003 untrusted HTML cannot become active content", () => {
  const { window } = dom();
  const html = createRenderer(window).render(`
<script>window.pwned=1</script>
<iframe src="https://example.com"></iframe>
<form><input autofocus></form>
<p style="position:fixed" onclick="alert(1)">Safe body</p>
<a href="javascript:alert(1)">Bad</a>
<a href="https://example.com" id="open-button">Good</a>
<img src="x.png" onerror="alert(1)">
<img src="file:///private.png">
<svg onload="alert(1)"><foreignObject>bad</foreignObject></svg>
`);
  const fragment = dom(html).window.document;
  assert.match(fragment.body.textContent, /Safe body/);
  assert.equal(fragment.querySelector("script,iframe,form,input,svg"), null);
  assert.equal(fragment.querySelector("[onclick],[onerror],[style],#open-button"), null);
  assert.equal(fragment.querySelector('a[href^="javascript:"]'), null);
  assert.ok(fragment.querySelector('a[href="https://example.com"]'));
  assert.equal(fragment.querySelector("img").getAttribute("src"), null);
  assert.equal(fragment.querySelector("img").dataset.imageSrc, "x.png");
  assert.equal(fragment.querySelectorAll("img")[1].dataset.imageSrc, "file:///private.png");
});

/** @id TEST-MARKDOWN-004 @verifies REQ-MARKDOWN-004 */
test("TEST-MARKDOWN-004 bracket TeX renders without changing dollar math or literal code", () => {
  const { window } = dom();
  const renderer = createRenderer(window);
  const fragment = dom(renderer.render([
    String.raw`Inline \(\bar r\) and $x^2$.`,
    String.raw`\[\frac{a}{b}\]`,
    "$$y^2$$",
    "```math\nz^2\n```",
    String.raw`Literal code: ` + "`" + String.raw`\(\bar r\)` + "`",
    "```text\n" + String.raw`\[a+b\]` + "\n```"
  ].join("\n\n"))).window.document;
  assert.equal(fragment.querySelectorAll(".katex").length, 5);
  assert.equal(fragment.querySelectorAll(".katex-display").length, 3);
  assert.equal(fragment.querySelector("mover mi").textContent, "r");
  assert.deepEqual([...fragment.querySelectorAll("code")].map((code) => code.textContent.trim()), [
    String.raw`\(\bar r\)`, String.raw`\[a+b\]`
  ]);
  const invalid = dom(renderer.render(String.raw`\(\definitelyUnknownCommand\)`)).window.document;
  assert.ok(invalid.querySelector("[data-render-error]"));
});

/** @id TEST-IMAGES-003 @verifies REQ-IMAGES-003 */
test("TEST-IMAGES-003 images settle with no-referrer and visible errors; SVG is inert", async () => {
  const { document, Event } = dom(`
<article>
<img alt="Remote" data-image-src="https://example.com/p.png">
<img alt="Bad" data-image-src="file:///private.png">
<img alt="SVG" data-image-src="plot.svg">
</article>`).window;
  const article = document.querySelector("article");
  const bridge = { readImage: async () => ({
    mime: "image/svg+xml",
    data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="evil()"><script>evil()</script><foreignObject>bad</foreignObject><image href="https://evil.example/a.png"/><rect width="10" height="10"/></svg>').toString("base64")
  }) };
  const pending = resolveImages(article, 1, bridge, { timeoutMs: 1000 });
  await new Promise((resolve) => setImmediate(resolve));
  const remote = article.querySelector('img[alt="Remote"]');
  assert.equal(remote.referrerPolicy, "no-referrer");
  assert.equal(remote.getAttribute("src"), "https://example.com/p.png");
  remote.dispatchEvent(new Event("error"));
  const svg = article.querySelector('img[alt="SVG"]');
  assert.match(svg.src, /^data:image\/svg\+xml;base64,/);
  const sanitized = Buffer.from(svg.src.split(",")[1], "base64").toString();
  assert.doesNotMatch(sanitized, /foreignObject|onload|script|https:\/\/evil/);
  assert.match(sanitized, /rect/);
  svg.dispatchEvent(new Event("load"));
  const errors = await pending;
  assert.equal(errors.length, 2);
  assert.equal(article.querySelectorAll("[data-render-error]").length, 2);
  assert.match(article.textContent, /Remote/);
});

/** @id TEST-IMAGES-004 @verifies REQ-IMAGES-004 */
test("TEST-IMAGES-004 SVG preserves safe paint and local glyphs, not CSS or external resources", async () => {
  const styles = [
    ["fill", "#ffffff", true], ["fill", "rgb(255, 0, 0)", true], ["fill", "burlywood", true],
    ["fill", "url(#paint)", true], ["fill", "url(https://invalid.example/a.svg#paint)", false],
    ["stroke", "#083370", true], ["stroke-width", "1.5", true],
    ["stroke-width", "2px", true], ["stroke-width", "url(#paint)", false],
    ["stroke-linecap", "round", true], ["stroke-linecap", "invalid", false],
    ["stroke-linejoin", "miter", true], ["stroke-dasharray", "2, 4", true],
    ["fill-opacity", "0.5", true], ["opacity", "0.8", true],
    ["font-size", "12px", true], ["font-weight", "bold", true],
    ["font-style", "italic", true], ["text-anchor", "middle", true],
    ["font-family", "'DejaVu Sans', sans-serif", true],
    ["font-family", "url(https://invalid.example/font)", false],
    ["position", "fixed", false], ["background", "url(https://invalid.example/x)", false],
    ["fill", String.raw`u\72l(https://invalid.example/x)`, false]
  ];
  const references = [
    ["href", "#glyph", true], ["xlink:href", "#glyph", true],
    ["href", "https://invalid.example/a.svg#glyph", false],
    ["href", "//invalid.example/a.svg#glyph", false],
    ["href", "other.svg#glyph", false], ["href", "data:image/svg+xml,bad", false],
    ["href", "javascript:evil()", false], ["href", "#glyph other", false]
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="evil()">
    <style>@import url(https://invalid.example/x); * { fill: red }</style>
    <defs><path id="glyph" d="M0 0h5v10z"/><linearGradient id="paint"/></defs>
    ${styles.map(([property, value], index) => `<rect id="style-${index}" style="${property}:${value}"/>`).join("")}
    ${references.map(([attribute, value], index) => `<use id="ref-${index}" ${attribute}="${value}"/>`).join("")}
    <rect id="external" fill="url(https://invalid.example/x)" clip-path="url(//invalid.example/x)" filter="url(data:text/plain,x)" mask="url(other.svg#mask)" marker-end="url(other.svg#arrow)" cursor="url/**/(https://invalid.example/x)"/>
    <path id="local" clip-path="url(#clip)" fill="url(#paint)" />
    <image href="https://invalid.example/x"/><a href="#glyph">link</a>
    <foreignObject>bad</foreignObject><script>evil()</script>
    <animate attributeName="href" to="https://invalid.example/x"/>
    <set attributeName="fill" to="url(https://invalid.example/x)"/>
  </svg>`;
  const { document, Event } = dom('<article><img alt="SVG" data-image-src="plot.svg"><img alt="PNG" data-image-src="plot.png"></article>').window;
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=";
  const article = document.querySelector("article");
  const pending = resolveImages(article, 1, { readImage: async (_id, reference) => reference.endsWith(".png")
    ? { mime: "image/png", data: png }
    : { mime: "image/svg+xml", data: Buffer.from(svg).toString("base64") }
  }, { timeoutMs: 1000 });
  await new Promise((resolve) => setImmediate(resolve));
  const image = article.querySelector('img[alt="SVG"]');
  const clean = Buffer.from(image.src.split(",")[1], "base64").toString();
  const parsed = dom(clean).window.document;
  try {
    for (const [index, [property, value, allowed]] of styles.entries()) {
      const actual = parsed.querySelector(`#style-${index}`).getAttribute(property);
      if (allowed) assert.ok(actual, `${property}:${value} must survive`);
      else assert.equal(actual, null, `${property}:${value} must be rejected`);
    }
    assert.equal(parsed.querySelector("#style-0").getAttribute("fill"), "#ffffff");
    for (const [index, [attribute, value, allowed]] of references.entries()) {
      const reference = parsed.querySelector(`#ref-${index}`);
      if (allowed) assert.equal(reference?.getAttribute(attribute), value);
      else assert.ok(!reference?.hasAttribute(attribute), value);
    }
    assert.match(parsed.querySelector("#glyph").getAttribute("d"), /M0/);
    assert.equal(parsed.querySelector("#local").getAttribute("clip-path"), "url(#clip)");
    for (const attribute of ["fill", "clip-path", "filter", "mask", "marker-end", "cursor"]) {
      assert.equal(parsed.querySelector("#external").getAttribute(attribute), null, attribute);
    }
    assert.equal(parsed.querySelector("style,script,image,a,foreignObject,animate,set,[style],[onload]"), null);
    assert.doesNotMatch(clean, /invalid\.example|javascript:|data:text/);
    assert.equal(article.querySelector('img[alt="PNG"]').src, `data:image/png;base64,${png}`);
  } finally {
    for (const loaded of article.querySelectorAll("img")) loaded.dispatchEvent(new Event("load"));
    assert.deepEqual(await pending, []);
  }
});

test("SVG preserves embedded PNGs but removes external images and other data types", async () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <image id="png" href="data:image/png;base64,${png}"/>
    <image id="xlink" xlink:href="data:image/png;base64,\n${png}"/>
    <image href="https://invalid.example/image.png"/>
    <image href="data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}"/>
    <image href="data:image/png;base64,${Buffer.from("<svg/>").toString("base64")}"/>
    <image href="data:image/png;base64,invalid!"/>
  </svg>`;
  const { document, Event } = dom('<article><img data-image-src="plot.svg"></article>').window;
  const article = document.querySelector("article");
  const pending = resolveImages(article, 1, {
    readImage: async () => ({ mime: "image/svg+xml", data: Buffer.from(svg).toString("base64") })
  });
  await new Promise((resolve) => setImmediate(resolve));
  const image = article.querySelector("img");
  const sanitized = dom(Buffer.from(image.src.split(",")[1], "base64").toString()).window.document;
  image.dispatchEvent(new Event("load"));
  assert.deepEqual(await pending, []);
  assert.equal(sanitized.querySelectorAll("image").length, 2);
  assert.equal(sanitized.querySelector("#png").getAttribute("href"), `data:image/png;base64,${png}`);
  assert.equal(sanitized.querySelector("#xlink").getAttribute("xlink:href"), `data:image/png;base64,${png}`);
});

/** @id TEST-PDF-001 @verifies REQ-PDF-001 */
test("TEST-PDF-001 export awaits render and fonts and rejects missing resources", async () => {
  const { document } = dom("<article>Body</article>").window;
  const article = document.querySelector("article");
  let finishRender, finishFonts, calls = 0;
  const ready = new Promise((resolve) => { finishRender = resolve; });
  const fonts = new Promise((resolve) => { finishFonts = resolve; });
  const pending = exportDocument({ article, ready, fonts, save: async () => {
    calls++;
    assert.equal(document.documentElement.dataset.exporting, "true");
    return "saved.pdf";
  } });
  await Promise.resolve();
  assert.equal(calls, 0);
  finishRender([]);
  await Promise.resolve();
  assert.equal(calls, 0);
  finishFonts();
  assert.equal(await pending, "saved.pdf");
  assert.equal(calls, 1);
  assert.equal(document.documentElement.hasAttribute("data-exporting"), false);
  await assert.rejects(exportDocument({
    article, ready: Promise.resolve(["broken image"]), fonts: Promise.resolve(),
    save: async () => { throw new Error("must not save"); }
  }), /broken image/);
});

/** @id TEST-PDF-003 @verifies REQ-PDF-003 */
test("TEST-PDF-003 cancellation and failure restore reading state", async () => {
  const { document } = dom("<article>Keep me</article>").window;
  const article = document.querySelector("article");
  const options = { article, ready: Promise.resolve([]), fonts: Promise.resolve() };
  assert.equal(await exportDocument({ ...options, save: async () => null }), null);
  await assert.rejects(exportDocument({ ...options, save: async () => { throw new Error("Disk full"); } }), /Disk full/);
  assert.equal(document.documentElement.hasAttribute("data-exporting"), false);
  assert.equal(article.textContent, "Keep me");
});

test("PDF rasterizes local SVGs only and restores original nodes on every save outcome", async () => {
  for (const outcome of ["saved.pdf", null, new Error("Native failure")]) {
    const { document, HTMLImageElement, HTMLCanvasElement } = dom(`<article>
      <img alt="Chart" src="data:image/svg+xml;base64,PHN2Zy8+">
      <img alt="PNG" src="data:image/png;base64,cG5n">
      <img alt="Remote" src="https://example.com/image.svg">
    </article>`).window;
    const article = document.querySelector("article");
    const originals = [...article.querySelectorAll("img")];
    Object.defineProperties(HTMLImageElement.prototype, {
      naturalWidth: { get: () => 128 }, naturalHeight: { get: () => 64 }
    });
    const decoded = [];
    HTMLImageElement.prototype.decode = async function () { decoded.push(this); };
    const drawings = [];
    HTMLCanvasElement.prototype.getContext = function () {
      return { drawImage: (image, _x, _y, width, height) => drawings.push({ image, width, height }) };
    };
    HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,cmFzdGVyaXplZA==";
    const pending = exportDocument({
      article, ready: Promise.resolve([]), fonts: Promise.resolve(),
      save: async () => {
        const [raster, png, remote] = article.querySelectorAll("img");
        assert.match(raster.src, /^data:image\/png;base64,/);
        assert.equal(raster.width, 128, "raster DPI must not enlarge the layout");
        assert.equal(raster.alt, "Chart");
        assert.equal(png, originals[1]);
        assert.equal(remote, originals[2]);
        assert.deepEqual(decoded, [originals[0], raster]);
        assert.equal(drawings.length, 1);
        assert.equal(drawings[0].image, originals[0]);
        assert.ok(drawings[0].width > 128);
        assert.equal(drawings[0].width / drawings[0].height, 2);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      }
    });
    if (outcome instanceof Error) await assert.rejects(pending, /Native failure/);
    else assert.equal(await pending, outcome);
    assert.deepEqual([...article.querySelectorAll("img")], originals);
    assert.equal(document.documentElement.dataset.exporting, undefined);
  }
});

test("PDF preparation failure restores earlier SVG replacements and never saves", async () => {
  const { document, HTMLImageElement, HTMLCanvasElement } = dom(`<section id="document-view"><article>
    <img alt="First" src="data:image/svg+xml;base64,Zmlyc3Q=">
    <img alt="Broken" src="data:image/svg+xml;base64,c2Vjb25k">
  </article></section>`).window;
  const article = document.querySelector("article");
  const originals = [...article.querySelectorAll("img")];
  const view = article.parentElement;
  view.style.zoom = "1.5";
  Object.defineProperties(HTMLImageElement.prototype, {
    naturalWidth: { get: () => 100 }, naturalHeight: { get: () => 100 }
  });
  HTMLImageElement.prototype.decode = async function () {
    if (this.alt === "Broken") throw new Error("Decode failed");
  };
  HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,cmFzdGVyaXplZA==";
  await assert.rejects(exportDocument({
    article, ready: Promise.resolve([]), fonts: Promise.resolve(),
    save: async () => assert.fail("must not save")
  }), /Broken.*Decode failed/);
  assert.deepEqual([...article.querySelectorAll("img")], originals);
  assert.equal(view.style.zoom, "1.5");
  assert.equal(document.documentElement.dataset.exporting, undefined);
});
