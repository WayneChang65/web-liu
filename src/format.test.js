import { describe, it, expect } from "vitest";
import {
  toggleInline,
  toggleLinePrefix,
  toggleHeading,
  toggleCodeFence,
  insertLink,
} from "./format.js";

const P = (line, ch) => ({ line, ch });

describe("toggleInline", () => {
  it("wraps a selection with the marker and keeps it selected", () => {
    const r = toggleInline("hello world", P(0, 6), P(0, 11), "**");
    expect(r.text).toBe("hello **world**");
    expect(r.text.slice(offset(r.text, r.anchor), offset(r.text, r.head))).toBe(
      "world",
    );
  });

  it("unwraps when already wrapped (toggle off)", () => {
    const r = toggleInline("hello **world**", P(0, 8), P(0, 13), "**");
    expect(r.text).toBe("hello world");
  });

  it("cursor with no selection inserts an empty pair, cursor inside", () => {
    const r = toggleInline("ab", P(0, 1), P(0, 1), "*");
    expect(r.text).toBe("a**b".replace(/\*\*/g, "**"));
    expect(r.anchor).toEqual({ line: 0, ch: 2 });
  });

  it("multi-line document: wraps only the selected range", () => {
    const r = toggleInline("one\ntwo", P(1, 0), P(1, 3), "*");
    expect(r.text).toBe("one\n*two*");
  });

  it("reversed selection is normalized", () => {
    const r = toggleInline("hello", P(0, 5), P(0, 0), "**");
    expect(r.text).toBe("**hello**");
  });
});

function offset(text, pos) {
  const lines = text.split("\n");
  return lines.slice(0, pos.line).reduce((a, l) => a + l.length + 1, 0) + pos.ch;
}

describe("toggleLinePrefix", () => {
  it("adds prefix to each selected line, removes when all have it", () => {
    const r1 = toggleLinePrefix("a\nb", P(0, 0), P(1, 1), "- ");
    expect(r1.text).toBe("- a\n- b");
    const r2 = toggleLinePrefix(r1.text, P(0, 0), P(1, 2), "- ");
    expect(r2.text).toBe("a\nb");
  });

  it("blockquote toggle", () => {
    const r = toggleLinePrefix("x", P(0, 0), P(0, 1), "> ");
    expect(r.text).toBe("> x");
  });
});

describe("toggleHeading", () => {
  it("adds heading, replaces another level, toggles off on repeat", () => {
    const r1 = toggleHeading("標題", P(0, 0), P(0, 0), 2);
    expect(r1.text).toBe("## 標題");
    const r2 = toggleHeading(r1.text, P(0, 0), P(0, 0), 3);
    expect(r2.text).toBe("### 標題");
    const r3 = toggleHeading(r2.text, P(0, 0), P(0, 0), 3);
    expect(r3.text).toBe("標題");
  });
});

describe("toggleCodeFence", () => {
  it("wraps selected lines in a fence", () => {
    const r = toggleCodeFence("let x=1", P(0, 0), P(0, 7), "js");
    expect(r.text).toBe("```js\nlet x=1\n```");
  });

  it("unwraps a full fenced block selected across its fence lines", () => {
    const src = "```js\nlet x=1\n```";
    const r = toggleCodeFence(src, P(0, 0), P(2, 3), "js");
    expect(r.text).toBe("let x=1");
  });

  it("keeps selection on the code lines after wrapping", () => {
    const r = toggleCodeFence("a\nb", P(0, 0), P(1, 1));
    expect(r.text).toBe("```\na\nb\n```");
    expect(r.anchor.line).toBe(1);
    expect(r.head.line).toBe(2);
  });
});

describe("insertLink", () => {
  it("wraps selection label and selects the url slot", () => {
    const r = insertLink("點我", P(0, 0), P(0, 2));
    expect(r.text).toBe("[點我](url)");
    const urlText = r.text.slice(offset(r.text, r.anchor), offset(r.text, r.head));
    expect(urlText).toBe("url");
  });

  it("empty selection gets a placeholder label", () => {
    const r = insertLink("", P(0, 0), P(0, 0));
    expect(r.text).toBe("[文字](url)");
  });
});
