// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import TurndownService from "turndown";
import { renderMarkdownToHtml, detectUnsupportedSyntax } from "./markdown.js";
import { sanitizeEditorHtml } from "./sanitize.js";

// --- Safe-subset round trip: md -> html(sanitized) -> turndown -> md ---
// Plan §2: semantics must survive; cosmetic whitespace may differ, so we
// normalize before comparing.

function makeTurndown() {
  const td = new TurndownService({ headingStyle: "atx" });
  td.addRule("underline", {
    filter: "u",
    replacement: (c) => "<u>" + c + "</u>",
  });
  td.addRule("italic", { filter: ["em", "i"], replacement: (c) => "*" + c + "*" });
  return td;
}

function roundTrip(md) {
  const html = sanitizeEditorHtml(renderMarkdownToHtml(md));
  return makeTurndown().turndown(html);
}

const norm = (s) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();

describe("markdown render + sanitize pipeline", () => {
  it("renders the safe subset to editor-allowlisted markup", () => {
    const md =
      "# 標題一\n\n段落文字 **粗** 與 *斜* 與 `碼`。\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n> 引用\n\n[連結](https://ok.example)\n\n~~刪~~";
    const html = sanitizeEditorHtml(renderMarkdownToHtml(md));
    // Nothing from the safe subset may be dropped by the sanitizer.
    // (marked wraps blockquote content in <p> — compare against that shape.)
    for (const frag of ["<h1>標題一</h1>", "<strong>粗</strong>", "<em>斜</em>", "<code>碼</code>", "<li>甲</li>", "<blockquote>\n<p>引用</p>\n</blockquote>", 'href="https://ok.example"', "<del>刪</del>"]) {
      expect(html).toContain(frag);
    }
  });

  it("strips javascript: hrefs coming through marked", () => {
    const html = sanitizeEditorHtml(
      renderMarkdownToHtml("[壞](javascript:alert(1))"),
    );
    expect(html).not.toContain("javascript:");
  });

  it("drops raw HTML embedded in markdown at the sanitizer layer", () => {
    const html = sanitizeEditorHtml(
      renderMarkdownToHtml("<img src=x onerror=alert(1)>文字"),
    );
    expect(html).not.toContain("img");
    expect(html).not.toContain("onerror");
  });

  const roundTripCases = {
    heading: "# 甲\n\n段落",
    bold_italic: "文 **粗** 字 *斜* 尾",
    inline_code: "用 `ls -la` 看",
    unordered: "- 甲\n- 乙\n- 丙",
    ordered: "1. 一\n2. 二",
    nested_list: "- 甲\n  - 乙\n    - 丙",
    quote: "> 引者曰",
    link: "詳見 [官網](https://example.com/a) 說明",
    strikethrough: "~~錯的~~ 對的",
    mixed: "## 小標\n\n- 粗 **甲** 底\n- 碼 `x`\n\n> 尾聲",
  };

  for (const [name, md] of Object.entries(roundTripCases)) {
    it(`round-trips safe case: ${name}`, () => {
      const once = norm(roundTrip(md));
      // Semantics: re-rendering the once-converted markdown and converting
      // again must be a fixed point (second pass changes nothing).
      const twice = norm(roundTrip(once));
      expect(twice).toBe(once);
    });
  }

  it("keeps CJK content and punctuation intact through round trip", () => {
    const md = "主人買了 3 顆蛋（土雞蛋），很『好』；要 $ 符與 # 井字。";
    const out = norm(roundTrip(md));
    expect(out).toContain("主人買了 3 顆蛋（土雞蛋）");
    expect(out).toContain("$ 符與");
    expect(out).toContain("# 井字");
  });
});

describe("detectUnsupportedSyntax (D7)", () => {
  const safe = [
    "# 標題\n\n一般內文 **粗**",
    "- 甲\n- 乙\n\n> 引用",
    "[連結](https://ok.example) 與 `code`",
  ];
  for (const md of safe) {
    it(`allows safe doc: ${JSON.stringify(md.slice(0, 12))}…`, () => {
      expect(detectUnsupportedSyntax(md)).toEqual([]);
    });
  }

  const flagged = [
    ["fenced code", "```js\nlet x=1;\n```", "程式碼塊"],
    ["mermaid", "```mermaid\ngraph TD\n```", "圖表"],
    ["table", "| a | b |\n|---|---|\n| 1 | 2 |", "表格"],
    ["image", "![圖](https://x/y.png)", "圖片"],
    ["task list", "- [ ] 待辦\n- [x] 完成", "任務清單"],
    ["inline math", "質能方程式 $E=mc^2$ 很有名", "數學式"],
    ["hackmd alert", "> [!NOTE]\n> 注意", "提示區塊"],
    ["unsafe raw html", '<img src="a.png"><button>按</button>', "HTML"],
  ];
  for (const [name, md, expectLabel] of flagged) {
    it(`blocks ${name}`, () => {
      const issues = detectUnsupportedSyntax(md);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.join(",")).toContain(expectLabel);
    });
  }

  it("no longer flags preview-safe HTML (第2輪#3: font/span colours OK)", () => {
    const md = '紅 <font color="#e74c3c">色字</font> 與 <span style="color:blue">藍</span>';
    expect(detectUnsupportedSyntax(md)).toEqual([]);
  });

  it("flags multiple syntax families at once", () => {
    const md = "| a |\n|---|\n| 1 |\n\n```js\nx\n```";
    const issues = detectUnsupportedSyntax(md);
    expect(issues.join(",")).toContain("表格");
    expect(issues.join(",")).toContain("程式碼塊");
  });

  it("returns [] for empty content", () => {
    expect(detectUnsupportedSyntax("")).toEqual([]);
  });
});
