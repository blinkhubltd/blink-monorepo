import { describe, expect, it } from "vitest";
import {
  matches,
  score,
  searchEntries,
  type Entry,
} from "../lib/palette-search";

/**
 * Palette matching and ranking.
 *
 * The palette previously did not filter at all, so there was nothing to test.
 * Now that it does, the failure mode is ordering: a subsequence match will
 * happily rank "Prescription rejection reasons" above "Products" for the query
 * "pro", and nothing on screen says the order is wrong — it just feels
 * unhelpful, which is the kind of thing nobody files a bug about.
 */

function entry(title: string, group = "Operations", url = "/" + title): Entry {
  return { title, group, url };
}

/** A slice of the real nav, including the names that actually collide. */
const NAV: Entry[] = [
  entry("Overview", "Home", "/"),
  entry("Orders", "Operations", "/orders"),
  entry("Orders · Insights", "Operations", "/orders/insights"),
  entry("Shipments", "Operations", "/shipments"),
  entry("Products", "Catalog", "/products"),
  entry("Products · Insights", "Catalog", "/products/insights"),
  entry("Prescriptions", "Operations", "/prescriptions/rejection-reasons"),
  entry("Payments", "Finance", "/payments"),
  entry("Payroll", "Finance", "/payroll"),
  entry("Platform settings", "System", "/settings"),
  entry("Staff", "People", "/staff"),
  entry("Schedules", "People", "/schedules"),
];

describe("matches", () => {
  it("accepts everything for an empty query", () => {
    expect(matches("Orders", "")).toBe(true);
  });

  it("is case insensitive both ways", () => {
    expect(matches("Orders", "ORD")).toBe(true);
    expect(matches("ORDERS", "ord")).toBe(true);
  });

  it("matches a subsequence, not just a substring", () => {
    // The point of the subsequence: "ordins" is how someone types
    // "Orders · Insights" without the separator.
    expect(matches("Orders · Insights", "ordins")).toBe(true);
    expect(matches("Platform settings", "pfset")).toBe(true);
  });

  it("ignores spaces in the query", () => {
    // So "plat set" behaves like "platset" rather than failing on the literal
    // space, which is not in the haystack between those letters.
    expect(matches("Platform settings", "plat set")).toBe(true);
  });

  it("rejects when a character is missing or out of order", () => {
    expect(matches("Orders", "ordz")).toBe(false);
    // Subsequence is order-sensitive by design: "sredro" is not "Orders".
    expect(matches("Orders", "sredro")).toBe(false);
  });
});

describe("score", () => {
  it("ranks an exact title first", () => {
    expect(score(entry("Orders"), "orders")).toBe(0);
  });

  it("ranks a title prefix above a word start", () => {
    expect(score(entry("Orders"), "ord")).toBeLessThan(
      score(entry("Orders · Insights"), "insights"),
    );
  });

  it("ranks a word start above a mid-word hit", () => {
    const wordStart = score(entry("Orders · Insights"), "insights");
    const midWord = score(entry("Shipments"), "ment");
    expect(wordStart).toBeLessThan(midWord);
  });

  it("ranks a group-only hit last of the real matches", () => {
    // "finance" is not in "Payroll" at all — it matches via the group, and must
    // not outrank anything whose title actually contains the query.
    const groupOnly = score(entry("Payroll", "Finance"), "finance");
    const titleHit = score(entry("Payments", "Finance"), "payments");
    expect(titleHit).toBeLessThan(groupOnly);
  });

  it("is 0 for an empty query so the nav order survives", () => {
    // With no query the list should read in navigation order, not be reshuffled
    // by an arbitrary tiebreak.
    expect(score(entry("Payroll"), "")).toBe(0);
    expect(score(entry("Overview"), "")).toBe(0);
  });
});

describe("searchEntries", () => {
  it("returns everything, in order, for an empty query", () => {
    expect(searchEntries(NAV, "").map((e) => e.title)).toEqual(
      NAV.map((e) => e.title),
    );
  });

  it("puts the obvious answer first — the 'pro' case", () => {
    // The specific regression this ranking exists for. Both "Products" and
    // "Prescriptions" match "pro" as a subsequence; nav order alone would put
    // whichever comes first in the file at the top.
    const results = searchEntries(NAV, "pro");
    expect(results[0]?.title).toBe("Products");
  });

  it("puts an exact title above its own drill-down", () => {
    const results = searchEntries(NAV, "orders");
    expect(results[0]?.title).toBe("Orders");
    expect(results.map((e) => e.title)).toContain("Orders · Insights");
  });

  it("finds a drill-down by the parent-and-child query", () => {
    const results = searchEntries(NAV, "ordins");
    expect(results.map((e) => e.title)).toContain("Orders · Insights");
  });

  it("distinguishes Payments from Payroll", () => {
    // Both start "pay"; the more specific query must win outright.
    expect(searchEntries(NAV, "payr")[0]?.title).toBe("Payroll");
    expect(searchEntries(NAV, "paym")[0]?.title).toBe("Payments");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchEntries(NAV, "zzzqq")).toEqual([]);
  });

  it("caps the result count", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      entry(`Page ${i}`, "Group", `/p${i}`),
    );
    expect(searchEntries(many, "").length).toBe(40);
    expect(searchEntries(many, "", 5).length).toBe(5);
  });

  it("keeps ranking stable for equally-ranked entries", () => {
    // Array.prototype.sort is stable in every engine this runs on, so two
    // entries at the same rank stay in nav order rather than swapping between
    // renders — which would make the highlighted row jump while typing.
    const a = entry("Alpha", "G", "/a");
    const b = entry("Alpher", "G", "/b");
    const first = searchEntries([a, b], "alph").map((e) => e.url);
    const again = searchEntries([a, b], "alph").map((e) => e.url);
    expect(first).toEqual(["/a", "/b"]);
    expect(again).toEqual(first);
  });

  it("does not mutate the input", () => {
    // It sorts, and sorting the caller's array in place would reorder the nav
    // itself on every keystroke.
    const original = NAV.map((e) => e.title);
    searchEntries(NAV, "pro");
    expect(NAV.map((e) => e.title)).toEqual(original);
  });
});
