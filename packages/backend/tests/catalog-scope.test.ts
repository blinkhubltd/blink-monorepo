import { describe, expect, it } from "vitest";
import { indexById } from "../convex/lib/category_tree";
import {
  pillCategoriesFor,
  resolveLeafCategoryIds,
  type ScopedCategory,
} from "../convex/lib/catalog_scope";

/**
 * Which categories a customer's product listing may read from.
 *
 * Two failure modes worth a test, neither of which shows up on screen as an
 * error:
 *
 *  1. **Wrong leaves.** Return too few and the aisle looks empty; return a
 *     level-1 or level-2 category and you read products that, per the depth-3
 *     rule, should not exist there. Either way the grid renders fine.
 *  2. **A trusted client argument.** `l3CategoryId` is the second pill row's
 *     selection, so it arrives from the client. If it is not checked against
 *     the browsed root, a caller can pair any level-3 id with any root and read
 *     a category the UI never offered.
 */

function cat(
  id: string,
  parent: string | undefined,
  opts: { status?: string; sort?: number; name?: string } = {},
): ScopedCategory {
  return {
    _id: id,
    parent_category_id: parent,
    status: opts.status ?? "active",
    sort_order: opts.sort ?? 0,
    name: opts.name ?? id,
  };
}

/**
 * Supermarkets > Groceries      > { Bread, Rice }
 *              > Household      > { Cleaning }
 * Pharmacy     > OTC            > { Painkillers }
 *
 * Plus an inactive leaf and an orphan, because both exist in real data.
 */
const TREE: ScopedCategory[] = [
  cat("supermarkets", undefined, { name: "Supermarkets" }),
  cat("groceries", "supermarkets", { sort: 1, name: "Groceries" }),
  cat("household", "supermarkets", { sort: 2, name: "Household" }),
  cat("bread", "groceries", { sort: 2, name: "Bread & Bakery" }),
  cat("rice", "groceries", { sort: 1, name: "Rice & Grains" }),
  cat("cleaning", "household", { sort: 1, name: "Cleaning" }),
  cat("pharmacy", undefined, { name: "Pharmacy" }),
  cat("otc", "pharmacy", { sort: 1, name: "Over the counter" }),
  cat("painkillers", "otc", { sort: 1, name: "Painkillers" }),
  cat("retired", "groceries", { status: "inactive", sort: 9, name: "Retired" }),
  cat("orphan", "does-not-exist", { name: "Orphan" }),
];

const byId = indexById(TREE);

describe("resolveLeafCategoryIds", () => {
  it("returns every level-3 leaf under a level-1 root", () => {
    expect(resolveLeafCategoryIds(TREE, byId, "supermarkets")).toEqual([
      "rice",
      "bread",
      "cleaning",
    ]);
  });

  it("returns only the leaves under the chosen level-2 branch", () => {
    // The point of the drill-down: picking Groceries must not leak Household.
    expect(resolveLeafCategoryIds(TREE, byId, "groceries")).toEqual([
      "rice",
      "bread",
    ]);
  });

  it("returns a level-3 root as its own only leaf", () => {
    expect(resolveLeafCategoryIds(TREE, byId, "bread")).toEqual(["bread"]);
  });

  it("orders leaves by sort_order, not insertion order", () => {
    // "rice" is declared after "bread" in TREE but sorts before it. Without a
    // stable order, offset paging shows some products twice and hides others.
    const leaves = resolveLeafCategoryIds(TREE, byId, "groceries");
    expect(leaves).toEqual(["rice", "bread"]);
  });

  it("groups leaves by branch rather than by their own sort_order", () => {
    // The bug this pins: "cleaning" (Household, sort 1) and "rice" (Groceries,
    // sort 1) share a sort number, so a flat sort by sort_order put Cleaning
    // first and spliced Household into the middle of Groceries. Under offset
    // paging a customer scrolling Groceries would see Household products
    // appear between Rice and Bread.
    expect(resolveLeafCategoryIds(TREE, byId, "supermarkets")).toEqual([
      "rice",
      "bread",
      "cleaning",
    ]);
  });

  it("keeps each branch contiguous", () => {
    // Stated as an invariant rather than a fixed list, so it still holds if the
    // fixture grows: once a branch's leaves start, they finish before the next
    // branch begins.
    const leaves = resolveLeafCategoryIds(TREE, byId, "supermarkets");
    const branchOf = (id: string) => byId.get(id)!.parent_category_id;
    const order = leaves.map(branchOf);
    const firstSeen = new Map<string | undefined, number>();
    order.forEach((b, i) => {
      if (!firstSeen.has(b)) firstSeen.set(b, i);
    });
    for (const [branch, start] of firstSeen) {
      const indices = order
        .map((b, i) => (b === branch ? i : -1))
        .filter((i) => i >= 0);
      // Contiguous means the indices run start..start+n-1 with no gaps.
      expect(indices).toEqual(
        Array.from({ length: indices.length }, (_, k) => start + k),
      );
    }
  });

  it("excludes inactive leaves", () => {
    expect(resolveLeafCategoryIds(TREE, byId, "groceries")).not.toContain(
      "retired",
    );
  });

  it("never returns a level-1 or level-2 category as a leaf", () => {
    // Products only attach at depth 3, so anything shallower in this list would
    // mean reading a category that cannot legitimately hold products.
    const nonLeaves = ["supermarkets", "groceries", "household", "pharmacy", "otc"];
    for (const root of ["supermarkets", "pharmacy"]) {
      const leaves = resolveLeafCategoryIds(TREE, byId, root);
      for (const id of leaves) expect(nonLeaves).not.toContain(id);
    }
  });

  it("returns nothing for a root that is not in the tree", () => {
    expect(resolveLeafCategoryIds(TREE, byId, "nonexistent")).toEqual([]);
  });

  it("returns nothing for an orphan whose parent is dangling", () => {
    // depthOf cannot resolve a broken chain, so it yields null rather than
    // guessing — and a category of unknown depth must not be read from.
    expect(resolveLeafCategoryIds(TREE, byId, "orphan")).toEqual([]);
  });
});

describe("resolveLeafCategoryIds — the client-supplied l3CategoryId", () => {
  it("accepts a leaf that really is under the root", () => {
    expect(
      resolveLeafCategoryIds(TREE, byId, "groceries", "bread"),
    ).toEqual(["bread"]);
  });

  it("rejects a leaf from a different branch", () => {
    // "cleaning" is a valid leaf, just not under Groceries. Accepting it would
    // show Household products on a Groceries screen.
    expect(resolveLeafCategoryIds(TREE, byId, "groceries", "cleaning")).toEqual(
      [],
    );
  });

  it("rejects a leaf from a different root entirely", () => {
    // The case that matters: browsing Supermarkets, asking for a Pharmacy leaf.
    expect(
      resolveLeafCategoryIds(TREE, byId, "supermarkets", "painkillers"),
    ).toEqual([]);
  });

  it("rejects a level-2 id passed where a leaf is expected", () => {
    // A descendant, but not at leaf depth — so it fails the second half of the
    // check. Reading it would return products attached above depth 3.
    expect(
      resolveLeafCategoryIds(TREE, byId, "supermarkets", "groceries"),
    ).toEqual([]);
  });

  it("rejects an id that is not a category at all", () => {
    expect(
      resolveLeafCategoryIds(TREE, byId, "groceries", "nonexistent"),
    ).toEqual([]);
  });

  it("rejects rather than falling back to the whole subtree", () => {
    // The dangerous failure would be treating an invalid narrow as "no narrow"
    // and widening to every leaf. Empty means empty.
    const wide = resolveLeafCategoryIds(TREE, byId, "supermarkets");
    const narrowed = resolveLeafCategoryIds(
      TREE,
      byId,
      "supermarkets",
      "painkillers",
    );
    expect(wide.length).toBeGreaterThan(0);
    expect(narrowed).toEqual([]);
  });
});

describe("pillCategoriesFor", () => {
  it("offers the level-3 children of a level-2 category, in order", () => {
    expect(pillCategoriesFor(TREE, byId, "groceries").map((c) => c._id)).toEqual(
      ["rice", "bread"],
    );
  });

  it("omits inactive children", () => {
    expect(
      pillCategoriesFor(TREE, byId, "groceries").map((c) => c._id),
    ).not.toContain("retired");
  });

  it("offers nothing for a level-1 category", () => {
    // Its children are level 2, not filter pills.
    expect(pillCategoriesFor(TREE, byId, "supermarkets")).toEqual([]);
  });

  it("offers nothing for a leaf", () => {
    expect(pillCategoriesFor(TREE, byId, "bread")).toEqual([]);
  });

  it("agrees exactly with what the query will read", () => {
    // The invariant that keeps a pill from returning an empty grid: every pill
    // offered must be a leaf the listing query would actually read from.
    const pills = pillCategoriesFor(TREE, byId, "groceries").map((c) => c._id);
    const leaves = resolveLeafCategoryIds(TREE, byId, "groceries");
    expect(pills).toEqual(leaves);
  });
});
