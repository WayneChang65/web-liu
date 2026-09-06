// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { sanitizeEditorHtml } from "./sanitize.js";

describe("sanitizeEditorHtml", () => {
  it("passes through normal editor markup untouched", () => {
    const html =
      '<div>普通文字</div><strong>粗體</strong>' +
      '<span data-font-sized="true" style="font-size:20px">大</span><br>';
    expect(sanitizeEditorHtml(html)).toBe(html);
  });

  it("removes script elements entirely", () => {
    expect(sanitizeEditorHtml("<div><script>alert(1)</script>甲</div>")).toBe(
      "<div>甲</div>"
    );
  });

  it("drops full-document payloads (head content excluded)", () => {
    const payload =
      '<html><head><script>alert(1)</script></head><body>甲</body></html>';
    expect(sanitizeEditorHtml(payload)).toBe("甲");
  });

  it("removes img (data-exfiltration vector) entirely", () => {
    expect(
      sanitizeEditorHtml('<div><img src="https://evil.example/?x=1">甲</div>')
    ).toBe("<div>甲</div>");
  });

  it("drops iframe/object/embed with their content", () => {
    expect(
      sanitizeEditorHtml('甲<iframe src="https://evil.example"></iframe>乙')
    ).toBe("甲乙");
  });

  it("strips event-handler and foreign attributes from allowed tags", () => {
    expect(
      sanitizeEditorHtml(
        '<strong onmouseover="alert(1)" class="x" data-x="y">粗</strong>'
      )
    ).toBe("<strong>粗</strong>");
  });

  it("keeps only font-size declarations in style attributes", () => {
    expect(
      sanitizeEditorHtml(
        '<span style="font-size:18px; background:url(x)"><u>甲</u></span>'
      )
    ).toBe('<span style="font-size:18px"><u>甲</u></span>');
  });

  it("unwraps unknown wrappers but keeps their text", () => {
    expect(
      sanitizeEditorHtml('<div><b>甲</b>乙<font color="red">丙</font></div>')
    ).toBe("<div>甲乙丙</div>");
  });

  it("normalizes parser-closed structures safely (table closes <p>)", () => {
    // Per the HTML spec, <table> implicitly closes an open <p>.
    expect(
      sanitizeEditorHtml("<p><b>甲</b>乙<table><tr><td>丙</td></tr></table></p>")
    ).toBe("<p>甲乙</p>丙");
  });

  it("keeps a href-less anchor's text via unwrapping", () => {
    expect(sanitizeEditorHtml('<a href="javascript:alert(1)">連結文字</a>')).toBe(
      "連結文字"
    );
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeEditorHtml("")).toBe("");
  });
});
