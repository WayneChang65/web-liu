// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderPreviewMarkdown, sanitizePreviewHtml } from "./preview.js";

describe("renderPreviewMarkdown", () => {
  it("renders headings, lists, tables and code fences", () => {
    const html = renderPreviewMarkdown(
      "# T\n\n- a\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```js\nlet a=1;\n```\n",
    );
    expect(html).toContain("<h1");
    expect(html).toContain("<li");
    expect(html).toContain("<table");
    expect(html).toContain("language-js");
  });

  it("emits a mermaid placeholder (not a plain code block) — marked>=15 token API", () => {
    const html = renderPreviewMarkdown("```mermaid\ngraph TD; A-->B;\n```");
    expect(html).toContain("mermaid-placeholder");
    expect(html).toContain("data-mermaid=");
    expect(html).not.toContain("language-mermaid");
  });

  it("renders inline and block math via KaTeX", () => {
    const html = renderPreviewMarkdown("行內 $E=mc^2$ 結尾");
    expect(html).toContain("katex");
  });
});

describe("sanitizePreviewHtml", () => {
  it("strips scripts, iframes and inline handlers", () => {
    const html = sanitizePreviewHtml(
      '<div><script>alert(1)</script><iframe src="x"></iframe><p onclick="bad()">hi</p></div>',
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("onclick");
    expect(html).toContain("hi");
  });

  it("keeps https links, drops javascript: ones", () => {
    const html = sanitizePreviewHtml(
      '<a href="https://ok.example">ok</a><a href="javascript:alert(1)">bad</a>',
    );
    expect(html).toContain('href="https://ok.example"');
    expect(html).not.toContain("javascript:");
  });

  it("keeps the mermaid placeholder div + data-mermaid attribute", () => {
    const html = sanitizePreviewHtml(
      '<div class="mermaid-placeholder" data-mermaid="graph TD; A--&gt;B;">x</div>',
    );
    expect(html).toContain("mermaid-placeholder");
    expect(html).toContain("data-mermaid=");
  });
});
