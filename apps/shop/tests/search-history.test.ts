import { describe, expect, it } from "vitest";

import { normaliseTerm, withRecentSearch } from "../lib/search-history";

describe("normaliseTerm", () => {
  it("trims and collapses whitespace", () => {
    expect(normaliseTerm("  milk   powder ")).toBe("milk powder");
  });

  it("truncates, so a pasted paragraph cannot become an entry", () => {
    expect(normaliseTerm("a".repeat(200))).toHaveLength(60);
  });
});

describe("withRecentSearch", () => {
  it("puts the newest first", () => {
    expect(withRecentSearch(["bread"], "milk")).toEqual(["milk", "bread"]);
  });

  it("moves a repeat to the front rather than duplicating it", () => {
    expect(withRecentSearch(["bread", "milk"], "milk")).toEqual([
      "milk",
      "bread",
    ]);
  });

  it("treats case as the same term", () => {
    // "Milk" and "milk" as two entries is a list that fills with one word.
    expect(withRecentSearch(["milk"], "MILK")).toEqual(["MILK"]);
  });

  it("ignores a blank term", () => {
    expect(withRecentSearch(["milk"], "   ")).toEqual(["milk"]);
  });

  it("keeps at most eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => `term ${i}`);
    const result = many.reduce<string[]>(
      (acc, term) => withRecentSearch(acc, term),
      [],
    );
    expect(result).toHaveLength(8);
    expect(result[0]).toBe("term 11");
  });

  it("does not mutate what it was given", () => {
    const existing = ["bread"];
    withRecentSearch(existing, "milk");
    expect(existing).toEqual(["bread"]);
  });
});
