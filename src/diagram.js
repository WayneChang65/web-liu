// --- Mermaid diagrams for preview (D25) with display isolation ---
//
// mermaid turns user-authored text into SVG. Rendering happens with our own
// (CSP 'self') module, but the RESULT is user-generated markup, so it never
// touches this document: we render to an SVG string and display it inside a
// fully sandboxed iframe (srcdoc, no allow-scripts) — opaque world, zero
// event-handler or script surface against the main page.

let mermaidPromise = null;
let seq = 0;

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict", // mermaid's own sanitizer + no scripts
        theme: "neutral",
        fontFamily: "sans-serif",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

/**
 * Replace every .mermaid-placeholder inside `root` with an isolated
 * sandboxed iframe showing the rendered diagram.
 */
export async function hydrateMermaidBlocks(root) {
  const placeholders = Array.from(
    root.querySelectorAll(".mermaid-placeholder"),
  );
  if (placeholders.length === 0) return;
  const mermaid = await loadMermaid();
  for (const el of placeholders) {
    const code = el.getAttribute("data-mermaid") || "";
    try {
      const { svg } = await mermaid.render(`mmd-${++seq}`, code);
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", ""); // no scripts, opaque origin
      frame.setAttribute("title", "mermaid 圖表");
      frame.className = "mermaid-frame";
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:4px;background:transparent;overflow:hidden}
svg{max-width:100%;height:auto}</style></head><body>${svg}</body></html>`;
      el.replaceWith(frame);
    } catch (err) {
      const errBox = document.createElement("pre");
      errBox.className = "mermaid-error";
      errBox.textContent = `（mermaid 圖表無法渲染：${err && err.message ? err.message : err}）`;
      el.replaceWith(errBox);
    }
  }
}
