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

  it("keeps raw HTML colour markup so HackMD-styled notes render (第2輪#3)", () => {
    const out = sanitizePreviewHtml(
      '<p>紅 <font color="#ff0000">紅字</font> 藍 <span style="color:blue">藍字</span> ' +
        "<mark>標記</mark><s>刪除</s><kbd>K</kbd></p>",
    );
    expect(out).toContain('<font color="#ff0000">紅字</font>');
    expect(out).toContain('style="color:blue"');
    expect(out).toContain("<mark>標記</mark>");
    expect(out).toContain("<s>刪除</s>");
    expect(out).toContain("<kbd>K</kbd>");
  });

  it("still drops executable/hostile markup and unsafe colour values", () => {
    const out = sanitizePreviewHtml(
      '<font color="expression(alert(1))">x</font>' +
        '<span style="behavior:url(evil)">y</span><script>bad()</script>' +
        '<img src="x" onerror="bad()">',
    );
    // expression(...) has parens → colour attr stripped (font tag kept, text survives)
    expect(out).not.toContain("expression");
    expect(out).not.toContain("behavior");
    expect(out).not.toContain("script");
    expect(out).not.toContain("onerror");
    expect(out).toContain("x");
    expect(out).toContain("y");
  });

  it("renders markdown-with-embedded-HTML end to end (font survives parse+sanitize)", () => {
    const html = sanitizePreviewHtml(
      renderPreviewMarkdown('注意：<font color="#e74c3c">紅色警告</font>與`code`並存'),
    );
    expect(html).toContain('<font color="#e74c3c">紅色警告</font>');
    expect(html).toContain("<code>code</code>");
  });

  it("keeps the mermaid placeholder div + data-mermaid attribute", () => {
    const html = sanitizePreviewHtml(
      '<div class="mermaid-placeholder" data-mermaid="graph TD; A--&gt;B;">x</div>',
    );
    expect(html).toContain("mermaid-placeholder");
    expect(html).toContain("data-mermaid=");
  });
});
