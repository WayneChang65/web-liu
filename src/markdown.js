// --- Markdown <-> editor rendering (HackMD integration) ---
//
// marked parses note content (Markdown) into HTML ONCE at open time; the
// result then goes through sanitizeEditorHtml() before touching the editor,
// so no separate sanitizer dependency is needed. marked runs string-in /
// string-out: it never registers listeners or touches the live DOM, which is
// why the IME pipeline is completely unaffected by this module (plan §3.1).
//
// Round-trip reality (plan §2): Markdown -> HTML -> Turndown -> Markdown is
// NOT byte-identical. The *safe subset* below survives with identical
// semantics; everything in UNSUPPORTED_SYNTAX must be caught by
// detectUnsupportedSyntax() and blocked at open time (D7: block by default,
// user may force-open knowingly).

import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Render Markdown to an HTML string. The caller MUST pass the result through
 * sanitizeEditorHtml() before injecting it anywhere (marked passes raw HTML
 * from the source straight through, by design).
 */
export function renderMarkdownToHtml(markdown) {
  if (!markdown) return "";
  return marked.parse(markdown, { async: false });
}

// Diagram/script block languages HackMD renders but liu cannot round-trip.
const DIAGRAM_LANGS = /^(mermaid|plantuml|wavedrom|vega|vega-lite|flowchart|sequence|math|latex)$/i;

// Raw-regex checks for syntax that marked may silently pass through as text.
const RAW_PATTERNS = [
  {
    label: "數學式（$...$）",
    re: /\$[^$\n]+\$/,
  },
  {
    label: "HackMD 提示區塊（> [!NOTE]）",
    re: /^>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/im,
  },
];

/**
 * Scan Markdown for syntax the liu editor cannot safely round-trip.
 *
 * Returns an array of human-readable labels (empty = safe to open). Parsing
 * with the same lexer that renders means no divergence between "what we show"
 * and "what we scan".
 */
export function detectUnsupportedSyntax(markdown) {
  if (!markdown) return [];
  const found = new Set();

  const tokens = marked.lexer(markdown);
  const visit = (list) => {
    for (const token of list || []) {
      switch (token.type) {
        case "code":
          if (token.lang && DIAGRAM_LANGS.test(token.lang.trim())) {
            found.add(`圖表／特殊區塊（${token.lang.trim()}）`);
          } else {
            found.add("程式碼塊（```）");
          }
          break;
        case "table":
          found.add("表格");
          break;
        case "image":
          found.add("圖片");
          break;
        case "checkbox":
          found.add("任務清單（- [ ]）");
          break;
        case "html":
          if (/<[a-z!/]/i.test(token.raw || token.text || "")) {
            found.add("HTML 原生標籤");
          }
          break;
        case "list_item":
          // Older/newer marked versions flag task items on the item itself.
          if (typeof token.checked === "boolean") {
            found.add("任務清單（- [ ]）");
          }
          break;
        default:
          break;
      }
      // marked keeps list children under `items`, everything else under
      // `tokens` — recurse through both so list_item/checkbox are reachable.
      if (token.tokens) visit(token.tokens);
      if (token.items) visit(token.items);
    }
  };
  visit(tokens);

  for (const { label, re } of RAW_PATTERNS) {
    if (re.test(markdown)) found.add(label);
  }

  return Array.from(found);
}
