import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import container from "markdown-it-container";
import texmath from "markdown-it-texmath";
import katex from "katex";
import hljs from "highlight.js/lib/common";
import createDOMPurify from "dompurify";

const escape = (text) => text.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);

function renderMath(source, options) {
  try {
    return katex.renderToString(source, { ...options, throwOnError: true, trust: false, maxExpand: 1000 });
  } catch (error) {
    return `<span class="render-error" data-render-error="true">${escape(`TeX: ${error.message}`)}</span>`;
  }
}

/** @id CODE-MARKDOWN-001 @implements REQ-MARKDOWN-001 REQ-MARKDOWN-002 REQ-MARKDOWN-003 REQ-MARKDOWN-004 */
export function createRenderer(window) {
  const purifier = createDOMPurify(window);
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false })
    .use(footnote)
    .use(taskLists)
    .use(texmath, {
      engine: { renderToString: renderMath },
      delimiters: ["dollars", "brackets"],
      katexOptions: { trust: false, strict: "warn", throwOnError: false, maxExpand: 1000 }
    })
    .use(container, "note", {
      validate: (info) => /^note(?:\s+(info|warn|alert))?$/.test(info.trim()),
      render: (tokens, index) => {
        if (tokens[index].nesting === -1) return "</aside>\n";
        const level = tokens[index].info.trim().split(/\s+/)[1] || "info";
        return `<aside class="note note-${level}"><div class="note-label">${{ info: "Note", warn: "Warning", alert: "Important" }[level]}</div>\n`;
      }
    });
  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const [language, ...filename] = token.info.trim().split(":");
    if (language === "mermaid") return `<pre class="diagram" data-mermaid>${escape(token.content)}</pre>\n`;
    if (language === "math") {
      return `<div class="math-block">${renderMath(token.content, {
        displayMode: true, throwOnError: false, trust: false, maxExpand: 1000
      })}</div>\n`;
    }
    const code = hljs.getLanguage(language)
      ? hljs.highlight(token.content, { language, ignoreIllegals: true }).value
      : escape(token.content);
    return `<div class="code-block">${filename.length ? `<div class="code-filename">${escape(filename.join(":"))}</div>` : ""}<pre><code class="hljs language-${escape(language || "text")}">${code}</code></pre></div>\n`;
  };
  const rawOptions = {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["data-image-src"],
    ADD_URI_SAFE_ATTR: ["data-image-src"],
    FORBID_TAGS: ["style", "script", "iframe", "form", "button", "textarea", "select", "object", "embed", "base", "link", "meta"],
    FORBID_ATTR: ["style", "id", "name", "srcset", "autofocus", "formaction", "contenteditable", "tabindex"],
    ALLOW_DATA_ATTR: false
  };
  for (const rule of ["html_block", "html_inline"]) {
    md.renderer.rules[rule] = (tokens, index) => tokens[index].content
      .split(/(<\/?(?:details|summary)\b[^>]*>)/gi)
      .map((part) => {
        const tag = part.match(/^<(\/?)(details|summary)\b[^>]*>$/i);
        if (!tag) return purifier.sanitize(part, rawOptions);
        const name = tag[2].toLowerCase();
        // Markdown separates the opening/closing fold across tokens; balance it in the final sanitize pass.
        if (tag[1]) return `</${name}>`;
        return `<${name}${name === "details" && /\sopen(?:[\s=>])/i.test(part) ? " open" : ""}>`;
      }).join("");
  }
  purifier.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.nodeName === "IMG" && data.attrName === "src") {
      node.setAttribute("data-image-src", data.attrValue);
      data.keepAttr = false;
    }
    if (data.attrName === "href" && !/^(?:https?:\/\/|mailto:|#)/i.test(data.attrValue)) {
      data.keepAttr = false;
    }
  });
  return {
    render: (source) => purifier.sanitize(md.render(source), {
      USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true },
      FORBID_TAGS: ["style", "script", "iframe", "form", "button", "textarea", "select", "object", "embed", "base", "link", "meta"],
      ADD_TAGS: ["input"],
      ADD_ATTR: ["disabled", "checked", "type", "data-mermaid", "data-image-src", "data-render-error"],
      ADD_URI_SAFE_ATTR: ["data-image-src"],
      FORBID_ATTR: ["name", "srcset", "autofocus", "formaction", "contenteditable", "tabindex"],
      ALLOW_DATA_ATTR: false
    }).replace(/<input\b[^>]*>/g, (tag) => /type="checkbox"/.test(tag) ? tag.replace(/>$/, " disabled>") : "")
  };
}

let sequence = 0;

/** @id CODE-MARKDOWN-DIAGRAM @implements REQ-MARKDOWN-002 REQ-MARKDOWN-003 */
export async function renderDiagrams(article, draw) {
  const blocks = [...article.querySelectorAll("[data-mermaid]")];
  if (!blocks.length) return [];
  if (!draw) {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false, securityLevel: "strict", theme: "neutral", htmlLabels: false,
      suppressErrorRendering: true, maxTextSize: 100000,
      flowchart: { htmlLabels: false }, themeVariables: { fontFamily: "Segoe UI, sans-serif" }
    });
    draw = (id, source) => mermaid.render(id, source);
  }
  const purifier = createDOMPurify(article.ownerDocument.defaultView);
  const errors = [];
  for (const block of blocks) {
    try {
      const { svg } = await draw(`fuzukue-diagram-${++sequence}`, block.textContent);
      const fragment = purifier.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ["foreignObject", "script", "a", "image"],
        FORBID_ATTR: ["href", "xlink:href", "onload"]
      });
      block.innerHTML = fragment;
      if (!block.querySelector("svg")) throw new Error("Diagram renderer returned no SVG.");
      block.className = "diagram rendered";
      delete block.dataset.mermaid;
    } catch (error) {
      const message = `Mermaid: ${error.message}`;
      block.dataset.renderError = "true";
      block.className = "render-error";
      block.textContent = message;
      errors.push(message);
    }
  }
  return errors;
}
