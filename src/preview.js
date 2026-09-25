// --- Preview renderer: Markdown → HTML with KaTeX, tables, code, diagrams ---
//
// Preview mode renders the editor's Markdown for reading. It uses marked with
// the KaTeX extension so $...$ / $$...$$ math renders (D25). Tables and code
// fences render natively (marked/gfm). mermaid blocks are NOT rendered here —
// they are emitted as a placeholder <div data-mermaid> that main.js fills in
// via the isolated renderer (mermaid is heavy + needs a script-enabled scope
// that the main page CSP forbids).
//
// Output goes through sanitizePreviewHtml() (preview.js owns a *wider*
// allowlist than the editor sanitizer: tables/img-free/kaTeX spans) before it
// reaches the DOM.

import { marked } from "marked";
import markedKatex from "marked-katex-extension";

const katexOptions = { throwOnError: false, output: "html" };
marked.use(markedKatex(katexOptions));

// Turn ```mermaid fences into a placeholder div the caller hydrates with the
// sandboxed renderer. Everything else renders normally.
// Note: marked >= 15 calls renderer methods with a token object; older marked
// uses positional args. Accept both.
const mermaidPlaceholder = {
  renderer: {
    code(codeOrToken, infostring) {
      const isToken = typeof codeOrToken === "object" && codeOrToken !== null;
      const code = isToken ? codeOrToken.text : codeOrToken;
      const lang = (isToken ? codeOrToken.lang || "" : infostring || "").match(
        /\S*/,
      )[0];
      if (lang === "mermaid") {
        const esc = String(code)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;");
        return `<div class="mermaid-placeholder" data-mermaid="${esc}">[mermaid 圖表]</div>`;
      }
      return false; // fall through to default code renderer
    },
  },
};
marked.use(mermaidPlaceholder);

export function renderPreviewMarkdown(markdown) {
  if (!markdown) return "";
  return marked.parse(markdown, { async: false, gfm: true, breaks: false });
}

const PREVIEW_ALLOWED = new Set([
  "STRONG", "EM", "U", "DEL", "CODE", "PRE", "BR", "HR", "P",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "BLOCKQUOTE", "A", "TABLE", "THEAD", "TBODY",
  "TR", "TH", "TD", "DIV", "SPAN", "SUP", "SUB",
  // 第2輪#3 (主人 2026-09-25): HackMD 工具列插入的顏色/字型標籤走安全子集——
  // <font color> 轉成 inline style 保留；S/STRIKE/MARK/KBD/BIG/SMALL/TT 純視覺，
  // 不開放任何可執行標籤（script/iframe/img/svg/form 仍在 DROP  blacklist）。
  "FONT", "BIG", "SMALL", "TT", "S", "STRIKE", "MARK", "KBD",
  "DETAILS", "SUMMARY", "FIGURE", "FIGCAPTION", "CAPTION",
  "DL", "DT", "DD", "ARTICLE", "SECTION", "HEADER", "FOOTER",
  // KaTeX HTML output (mathml=false, output:"html") — a fixed, well-known set.
  "MATH", "SEMANTICS", "MROW", "MI", "MN", "MO", "MSUP", "MSUB",
  "MUNDER", "MUNDEROVER", "MTEXT", "MPADDED", "MSPACE", "MFRAC",
  "MTABLE", "ML", "MTR", "MTD", "MSTYLE", "ANNOTATION", "INPUT",
]);

// Only plain colour values survive inside a <font>'s color attr — hex, named
// colours, or comma lists. Parentheses are forbidden outright: that blocks
// legacy `expression(...)`/`url(...)` tricks no matter how the case is spelled.
const SAFE_COLOR = /^[#0-9a-zA-Z,]{1,60}$/;

// KaTeX emits class + a few style/data attributes; keep them so math is styled.
function keepAttribute(tag, name, value) {
  if (name === "href") return tag === "A";
  if (name === "color") return tag === "FONT" && SAFE_COLOR.test(value || "");
  if (name === "size") return tag === "FONT" && /^[1-7]$/.test((value || "").trim());
  if (name === "class") return true;
  // style 放行（KaTeX/顏色需要），但攔掉 CSS 執行向量：expression()、
  // -moz-binding、behavior、url() —— 現代瀏覽器基本不吃，但零成本 Defense-in-depth。
  if (name === "style") return !/expression|behaviou?r|moz-binding|url\s*\(|javascript:/i.test(value || "");
  if (name.startsWith("data-")) return tag === "DIV" && name === "data-mermaid";
  // KaTeX/MathML layout attributes (name-spaced).
  if (name.startsWith("data-") || name.startsWith("aria-")) return true;
  if (["encoding", "mathvariant", "displaystyle", "scriptlevel", "columnalign",
       "rowspacing", "columnspacing", "stretchy", "accent", "accentunder"].includes(name))
    return true;
  return false;
}

const DROP = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "IMG", "VIDEO", "AUDIO",
  "SVG", "LINK", "META", "BASE", "FORM", "BUTTON", "SELECT", "TEXTAREA",
  "OPTION", "LABEL", "NAV", "ASIDE",
]);

const SAFE_HREF = /^https?:\/\//i;

/**
 * Sanitize rendered-preview HTML: keep the markdown+katex allowlist, drop
 * scripts/images/iframes outright, unwrap anything else (text survives).
 */
export function sanitizePreviewHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (node) => {
    for (const child of Array.from(node.children)) {
      walk(child);
      if (DROP.has(child.tagName)) {
        child.remove();
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const keep = attr.name === "href"
          ? SAFE_HREF.test(attr.value.trim())
          : keepAttribute(child.tagName, attr.name, attr.value);
        if (!keep) child.removeAttribute(attr.name);
      }
      if (!PREVIEW_ALLOWED.has(child.tagName)) {
        const parent = child.parentNode;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        child.remove();
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
