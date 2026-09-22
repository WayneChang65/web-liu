// --- Stored-content sanitizer ---
//
// Editor content round-trips through localStorage (and now also through
// HackMD Markdown rendered via marked). Saved HTML must be treated as
// UNTRUSTED whenever it comes back and is restored via innerHTML.
//
// The editor produces this markup:
//   strong / em / u / div / p / br / span[data-font-sized][style="font-size:..."]
// plus (since the HackMD feature, rendered by marked) the Markdown-safe set:
//   h1-h3 / ul / ol / li / blockquote / del / code / pre / hr / a[href]
// so we allowlist on both save and restore. The CSP meta tag
// (script-src 'self') in the HTML pages is the second line of defense.
//
// Implementation note: parsing is done with DOMParser (inert parse — no
// scripts run, no requests fire, no events dispatch), and the allowlist pass
// only reads the serialized result.

const ALLOWED_TAGS = new Set([
  "STRONG",
  "EM",
  "U",
  "DIV",
  "P",
  "BR",
  "SPAN",
  "H1",
  "H2",
  "H3",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "DEL",
  "CODE",
  "PRE",
  "HR",
  "A",
]);

// Tags whose element (and subtree) must be removed entirely — including
// <img>, whose src is a data-exfiltration vector even without scripts.
const DROP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "IMG",
  "VIDEO",
  "AUDIO",
  "SOURCE",
  "TRACK",
  "LINK",
  "META",
  "BASE",
  "FORM",
  "INPUT",
  "BUTTON",
  "SELECT",
  "TEXTAREA",
  "OPTION",
  "SVG",
  "MATH",
]);

// Only a bare font-size declaration is allowed inside style attributes.
const FONT_SIZE_RE = /^font-size\s*:\s*-?[\d.]+(px|pt|em|rem|%)?$/i;

// Links may only carry safe schemes; everything else (javascript:, data:,
// relative URLs that could break under other deployments) loses the href and
// degrades to plain text via the attribute loop.
const SAFE_HREF_RE = /^https:\/\/|^http:\/\/|^mailto:/i;

function cleanStyle(styleText) {
  return styleText
    .split(";")
    .map((part) => part.trim())
    .filter((part) => FONT_SIZE_RE.test(part))
    .join("; ");
}

/**
 * Reduce arbitrary HTML down to the editor's allowlisted markup.
 *
 * - Allowed tags are kept; every attribute is stripped except `data-font-sized`,
 *   a `style` containing only font-size declarations, and `href` on <a> when it
 *   matches a safe scheme (https/http/mailto).
 * - Dangerous tags (script, img, iframe, ...) are removed with their content.
 * - Any other wrapper (b, table, h4, ...) is unwrapped so its text survives.
 *
 * Safe on empty input; returns the cleaned HTML string.
 */
export function sanitizeEditorHtml(html) {
  if (html === "") return "";

  const doc = parseHtmlFragment(html);
  const root = doc.body;

  const sanitizeElement = (el) => {
    if (DROP_TAGS.has(el.tagName)) {
      el.remove();
      return;
    }

    for (const attr of Array.from(el.attributes)) {
      if (attr.name === "style") {
        const clean = cleanStyle(attr.value);
        if (clean) el.setAttribute("style", clean);
        else el.removeAttribute("style");
      } else if (attr.name === "href" && el.tagName === "A") {
        if (!SAFE_HREF_RE.test(attr.value.trim())) {
          el.removeAttribute("href");
        }
      } else if (attr.name !== "data-font-sized") {
        el.removeAttribute(attr.name);
      }
    }

    if (!ALLOWED_TAGS.has(el.tagName)) {
      // Unwrap: keep the (already sanitized) children, drop the wrapper.
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
    }
  };

  // Depth-first over a stable snapshot so node removal can't skip children.
  const walk = (node) => {
    for (const child of Array.from(node.children)) {
      walk(child);
      sanitizeElement(child);
    }
  };
  walk(root);

  return root.innerHTML;
}

function parseHtmlFragment(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * Replace an element's content with sanitized HTML, without ever assigning
 * innerHTML/outerHTML. Sanitized nodes are parsed in an inert document and
 * imported, so inline event-handler attributes can never be activated.
 */
export function applyEditorContent(el, html) {
  const clean = sanitizeEditorHtml(html);
  while (el.firstChild) el.removeChild(el.firstChild);
  if (!clean) return;
  const doc = parseHtmlFragment(clean);
  for (const node of Array.from(doc.body.childNodes)) {
    el.appendChild(doc.importNode(node, true));
  }
}
