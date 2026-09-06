import { describe, it, expect } from "vitest";
import {
  lookupCandidates,
  selectByDigit,
  resolveSpaceCommit,
} from "./ime.js";
import { boshiamyData } from "./boshiamy-data.js";

describe("lookupCandidates", () => {
  it("returns [] for the prototype key 'constructor' (regression H1)", () => {
    // Every character of "constructor" is a legal boshiamy input character,
    // so a user can actually type it. A naive `data[code]` lookup would
    // return Object.prototype.constructor (a function) and the subsequent
    // `.split("")` would crash the editor.
    expect(lookupCandidates(boshiamyData, "constructor")).toEqual([]);
  });

  it("returns [] for other Object.prototype keys", () => {
    expect(lookupCandidates(boshiamyData, "valueOf")).toEqual([]);
    expect(lookupCandidates(boshiamyData, "toString")).toEqual([]);
  });

  it("returns [] for unknown codes", () => {
    expect(lookupCandidates({ ab: "甲" }, "zz")).toEqual([]);
    expect(lookupCandidates({ ab: "甲" }, "")).toEqual([]);
    expect(lookupCandidates({ ab: "甲" }, null)).toEqual([]);
  });

  it("returns candidate characters for a known code", () => {
    expect(lookupCandidates(boshiamyData, "a")).toEqual(["對"]);
  });

  it("splits multi-character values into individual candidates", () => {
    expect(lookupCandidates({ ab: "甲乙丙" }, "ab")).toEqual(["甲", "乙", "丙"]);
  });

  it("keeps astral (surrogate-pair) characters as single candidates", () => {
    const data = { q: "\u{20000}乙" };
    expect(lookupCandidates(data, "q")).toEqual(["\u{20000}", "乙"]);
  });

  it("returns [] for malformed (non-string) entries", () => {
    expect(lookupCandidates({ ab: null }, "ab")).toEqual([]);
    expect(lookupCandidates({ ab: 42 }, "ab")).toEqual([]);
  });
});

describe("selectByDigit", () => {
  const cands = Array.from("甲乙丙丁戊己庚辛壬癸子丑寅卯");

  it("maps digit 0 to the first candidate of the current page", () => {
    expect(selectByDigit(cands, 0, 10, 0)).toBe("甲");
  });

  it("offsets by the current page", () => {
    expect(selectByDigit(cands, 1, 10, 0)).toBe("子");
    expect(selectByDigit(cands, 1, 10, 2)).toBe("寅");
  });

  it("returns null when the index is out of range", () => {
    expect(selectByDigit(["甲"], 0, 10, 1)).toBeNull();
    expect(selectByDigit(cands, 5, 10, 0)).toBeNull();
  });
});

describe("resolveSpaceCommit", () => {
  const data = {
    ab: "甲乙丙丁戊",
  };

  it("commits the first candidate when the buffer is a valid code", () => {
    expect(resolveSpaceCommit(data, "ab")).toBe("甲");
  });

  it("commits the selected candidate via v/r/s/f on the root code", () => {
    expect(resolveSpaceCommit(data, "abv")).toBe("乙");
    expect(resolveSpaceCommit(data, "abr")).toBe("丙");
    expect(resolveSpaceCommit(data, "abs")).toBe("丁");
    expect(resolveSpaceCommit(data, "abf")).toBe("戊");
  });

  it("returns null when the selector index exceeds the candidates", () => {
    const d = { c: "甲" };
    expect(resolveSpaceCommit(d, "cv")).toBeNull();
  });

  it("treats a selector-typed buffer as a full code when it is one", () => {
    const d = { abv: "庚", ab: "甲乙" };
    // "abv" is itself a valid code → commit its own first candidate.
    expect(resolveSpaceCommit(d, "abv")).toBe("庚");
  });

  it("returns null for an empty buffer", () => {
    expect(resolveSpaceCommit(data, "")).toBeNull();
  });

  it("returns null for an unknown buffer", () => {
    expect(resolveSpaceCommit(data, "zz")).toBeNull();
  });

  it("never crashes on the real dictionary (regression H1)", () => {
    // "constructor" is all-lowercase a-z (typeable via the IME buffer) and
    // would resolve to Object.prototype.constructor on a naive data[code] read.
    expect(lookupCandidates(boshiamyData, "constructor")).toEqual([]);
    expect(resolveSpaceCommit(boshiamyData, "constructor")).toBeNull();
  });
});
