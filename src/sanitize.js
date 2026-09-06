// --- Stored-content sanitizer ---
//
// Editor content round-trips through localStorage. That storage is writable by
// any script that ever ran on this origin (and on shared devices by other
// users' apps), so saved HTML must be treated as UNTRUSTED whenever it comes
// back and is restored via innerHTML.
//
// The editor only ever produces this small set of markup:
//   strong / em / u / div / br / span[data-font-sized][style="font-size:..."]
// so we allowlist on both save and restore. The CSP meta tag
// (script-src 'self') in the HTML pages is the second line of defense.
//
// Implementation note: parsing is done with DOMParser (inert parse — no
// scripts run, no requests fire, no events dispatch), and the allowlist pass
// only reads the serialized result.

const ALLOWED_TAGS = new Set(["STRONG", "EM", "U", "DIV", "P", "BR", "SPAN"]);

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
 * - Allowed tags are kept; every attribute is stripped except `data-font-sized`
 *   and a `style` containing only font-size declarations.
 * - Dangerous tags (script, img, iframe, ...) are removed with their content.
 * - Any other wrapper (b, p, table, a, ...) is unwrapped so its text survives.
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
