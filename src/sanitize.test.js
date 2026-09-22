// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { sanitizeEditorHtml } from "./sanitize.js";

describe("sanitizeEditorHtml", () => {
  it("passes through normal editor markup untouched", () => {
    const html =
      "<div>普通文字</div><strong>粗體</strong>" +
      '<span data-font-sized="true" style="font-size:20px">大</span><br>';
    expect(sanitizeEditorHtml(html)).toBe(html);
  });

  it("removes script elements entirely", () => {
    expect(sanitizeEditorHtml("<div><script>alert(1)</script>甲</div>")).toBe(
      "<div>甲</div>",
    );
  });

  it("drops full-document payloads (head content excluded)", () => {
    const payload =
      "<html><head><script>alert(1)</script></head><body>甲</body></html>";
    expect(sanitizeEditorHtml(payload)).toBe("甲");
  });

  it("removes img (data-exfiltration vector) entirely", () => {
    expect(
      sanitizeEditorHtml('<div><img src="https://evil.example/?x=1">甲</div>'),
    ).toBe("<div>甲</div>");
  });

  it("drops iframe/object/embed with their content", () => {
    expect(
      sanitizeEditorHtml('甲<iframe src="https://evil.example"></iframe>乙'),
    ).toBe("甲乙");
  });

  it("strips event-handler and foreign attributes from allowed tags", () => {
    expect(
      sanitizeEditorHtml(
        '<strong onmouseover="alert(1)" class="x" data-x="y">粗</strong>',
      ),
    ).toBe("<strong>粗</strong>");
  });

  it("keeps only font-size declarations in style attributes", () => {
    expect(
      sanitizeEditorHtml(
        '<span style="font-size:18px; background:url(x)"><u>甲</u></span>',
      ),
    ).toBe('<span style="font-size:18px"><u>甲</u></span>');
  });

  it("unwraps unknown wrappers but keeps their text", () => {
    expect(
      sanitizeEditorHtml('<div><b>甲</b>乙<font color="red">丙</font></div>'),
    ).toBe("<div>甲乙丙</div>");
  });

  it("normalizes parser-closed structures safely (table closes <p>)", () => {
    // Per the HTML spec, <table> implicitly closes an open <p>.
    expect(
      sanitizeEditorHtml(
        "<p><b>甲</b>乙<table><tr><td>丙</td></tr></table></p>",
      ),
    ).toBe("<p>甲乙</p>丙");
  });

  it("keeps anchors but strips unsafe-scheme hrefs (markdown link contract)", () => {
    expect(
      sanitizeEditorHtml('<a href="javascript:alert(1)">連結文字</a>'),
    ).toBe("<a>連結文字</a>");
  });

  it("keeps https/mailto hrefs and drops other attributes", () => {
    expect(
      sanitizeEditorHtml(
        '<a href="https://ok.example/x" target="_blank" rel="x">連結</a>',
      ),
    ).toBe('<a href="https://ok.example/x">連結</a>');
    expect(sanitizeEditorHtml('<a href="mailto:a@b.c">信</a>')).toBe(
      '<a href="mailto:a@b.c">信</a>',
    );
    // Relative hrefs are stripped too (site-relative links from HackMD notes
    // would point at liu's own origin and mislead readers).
    expect(sanitizeEditorHtml('<a href="/local">甲</a>')).toBe("<a>甲</a>");
  });

  it("passes through the markdown-safe tag set untouched", () => {
    const html =
      "<h1>乙</h1><h2>丙</h2><h3>丁</h3><ul><li>甲</li></ul>" +
      "<ol><li>乙</li></ol><blockquote>引</blockquote><del>刪</del>" +
      "<p><code>行内碼</code></p><pre>區塊碼</pre><hr>";
    expect(sanitizeEditorHtml(html)).toBe(html);
  });

  it("unwraps h4+ and keeps text (heading levels capped at h3)", () => {
    expect(sanitizeEditorHtml("<h4>深度</h4>")).toBe("深度");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeEditorHtml("")).toBe("");
  });
});
