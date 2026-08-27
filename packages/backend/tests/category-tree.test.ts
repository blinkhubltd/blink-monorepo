import { describe, expect, it } from "vitest";
import {
  assertCategoryPlacement,
  breadcrumbOf,
  CATEGORY_MAX_DEPTH,
  CategoryTreeError,
  depthOf,
  indexById,
  isSelfOrDescendant,
  LEVEL_LABELS,
  pathOf,
  productCategoryOptions,
  productPlacementError,
  subtreeHeight,
  type CategoryNode,
} from "../convex/lib/category_tree";

/**
 * The cases that actually break a hierarchy.
 *
 * Nothing enforced the three-level shape before, so the tree in a live database
 * may already contain any of these. Each one is silent through the happy path —
 * the form saves, the row exists — and shows up later as a product no listing
 * reaches, or a `ctx.db.get` walk that never terminates.
 */

/** Supermarkets › Groceries › Bread & Bakery, plus a second branch. */
function tree(): CategoryNode[] {
  return [
    { _id: "supermarkets", name: "Supermarkets", parent_category_id: undefined },
    { _id: "groceries", name: "Groceries", parent_category_id: "supermarkets" },
    { _id: "bread", name: "Bread & Bakery", parent_category_id: "groceries" },
    { _id: "dairy", name: "Dairy & Eggs", parent_category_id: "groceries" },
    { _id: "household", name: "Household", parent_category_id: "supermarkets" },
    { _id: "cleaning", name: "Cleaning", parent_category_id: "household" },
    { _id: "pharmacy", name: "Pharmacy", parent_category_id: undefined },
    { _id: "otc", name: "Over the Counter", parent_category_id: "pharmacy" },
    { _id: "painrelief", name: "Pain Relief", parent_category_id: "otc" },
    // A depth-2 category with no children yet — the shape a product must NOT
    // be allowed to attach to, and the one the old CascadingSelect accepted
    // because it fired on any leaf regardless of depth.
    { _id: "orphanlevel2", name: "Seasonal", parent_category_id: "pharmacy" },
  ];
}

describe("depth and path", () => {
  const byId = indexById(tree());

  it("reports 1-based depth", () => {
    expect(depthOf(byId, "supermarkets")).toBe(1);
    expect(depthOf(byId, "groceries")).toBe(2);
    expect(depthOf(byId, "bread")).toBe(3);
  });

  it("builds the breadcrumb root-first", () => {
    expect(breadcrumbOf(byId, "bread")).toBe(
      "Supermarkets › Groceries › Bread & Bakery",
    );
    expect(breadcrumbOf(byId, "supermarkets")).toBe("Supermarkets");
  });

  it("returns the path in root-to-leaf order", () => {
    expect(pathOf(byId, "bread")?.map((c) => c._id)).toEqual([
      "supermarkets",
      "groceries",
      "bread",
    ]);
  });

  it("returns null rather than a partial path when a parent is missing", () => {
    // A dangling parent id is reachable today: deleteCategory blocks a parent
    // WITH children, but a category whose parent was removed some other way
    // (direct dashboard edit, failed migration) leaves this exact shape. A
    // partial path would yield a plausible-but-wrong depth.
    const broken = indexById([
      { _id: "child", name: "Child", parent_category_id: "ghost" },
    ]);
    expect(pathOf(broken, "child")).toBeNull();
    expect(depthOf(broken, "child")).toBeNull();
    expect(breadcrumbOf(broken, "child")).toBeNull();
  });

  it("returns null on a cycle instead of looping forever", () => {
    // Two updateCategory calls produce this. Without the cycle guard the walk
    // never terminates and takes the Convex function down with it, which is a
    // worse failure than any wrong answer.
    const cyclic = indexById([
      { _id: "a", name: "A", parent_category_id: "b" },
      { _id: "b", name: "B", parent_category_id: "a" },
    ]);
    expect(pathOf(cyclic, "a")).toBeNull();
    expect(depthOf(cyclic, "a")).toBeNull();
  });

  it("returns null on a self-parent", () => {
    const selfish = indexById([
      { _id: "a", name: "A", parent_category_id: "a" },
    ]);
    expect(depthOf(selfish, "a")).toBeNull();
  });
});

describe("isSelfOrDescendant", () => {
  const byId = indexById(tree());

  it("is true for the category itself", () => {
    expect(isSelfOrDescendant(byId, "groceries", "groceries")).toBe(true);
  });

  it("is true for a child and a grandchild", () => {
    expect(isSelfOrDescendant(byId, "supermarkets", "groceries")).toBe(true);
    expect(isSelfOrDescendant(byId, "supermarkets", "bread")).toBe(true);
  });

  it("is false for an ancestor, a sibling, and another branch", () => {
    expect(isSelfOrDescendant(byId, "bread", "groceries")).toBe(false);
    expect(isSelfOrDescendant(byId, "bread", "dairy")).toBe(false);
    expect(isSelfOrDescendant(byId, "supermarkets", "pharmacy")).toBe(false);
  });

  it("terminates on a cyclic chain", () => {
    const cyclic = indexById([
      { _id: "a", name: "A", parent_category_id: "b" },
      { _id: "b", name: "B", parent_category_id: "a" },
    ]);
    expect(isSelfOrDescendant(cyclic, "z", "a")).toBe(false);
  });
});

describe("subtreeHeight", () => {
  const nodes = tree();

  it("counts the category itself as height 1", () => {
    expect(subtreeHeight(nodes, "bread")).toBe(1);
  });

  it("counts levels beneath, not nodes", () => {
    expect(subtreeHeight(nodes, "groceries")).toBe(2); // groceries + bread/dairy
    expect(subtreeHeight(nodes, "supermarkets")).toBe(3);
  });
});

describe("assertCategoryPlacement — creating", () => {
  const nodes = tree();

  it("allows a new top-level category", () => {
    expect(assertCategoryPlacement(nodes, undefined)).toBe(1);
  });

  it("allows a child of level 1 and of level 2", () => {
    expect(assertCategoryPlacement(nodes, "supermarkets")).toBe(2);
    expect(assertCategoryPlacement(nodes, "groceries")).toBe(3);
  });

  it("refuses a fourth level", () => {
    // The rule the whole feature rests on, and the one nothing checked before.
    expect(() => assertCategoryPlacement(nodes, "bread")).toThrow(
      CategoryTreeError,
    );
    expect(() => assertCategoryPlacement(nodes, "bread")).toThrow(
      /limited to 3 levels/,
    );
  });

  it("names the offending parent and its level in the message", () => {
    // A limit error that does not say WHICH category is too deep leaves the
    // admin guessing at which of three pickers to change.
    try {
      assertCategoryPlacement(nodes, "bread");
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain("Bread & Bakery");
      expect((err as Error).message).toContain("level 3");
    }
  });

  it("refuses a parent that does not exist", () => {
    expect(() => assertCategoryPlacement(nodes, "ghost")).toThrow(
      /does not exist/,
    );
  });

  it("refuses a parent whose own chain is broken", () => {
    const broken: CategoryNode[] = [
      { _id: "child", name: "Child", parent_category_id: "ghost" },
    ];
    expect(() => assertCategoryPlacement(broken, "child")).toThrow(
      /broken or circular/,
    );
  });
});

describe("assertCategoryPlacement — moving an existing category", () => {
  const nodes = tree();

  it("refuses making a category its own parent", () => {
    expect(() =>
      assertCategoryPlacement(nodes, "groceries", "groceries"),
    ).toThrow(/cannot be its own parent/);
  });

  it("refuses re-parenting under its own descendant", () => {
    // The silent tree-detaching case: Supermarkets under Bread & Bakery leaves
    // the entire branch unreachable from any root, with no error anywhere and
    // nothing visibly wrong in the form.
    expect(() =>
      assertCategoryPlacement(nodes, "bread", "supermarkets"),
    ).toThrow(/would detach this category/);
  });

  it("refuses a move that would push its CHILDREN past the limit", () => {
    // Groceries itself would land at depth 2 — legal on its own. Its children
    // land at 3 and are fine, but moving Supermarkets (height 3) under
    // Pharmacy puts its deepest level at 4. Checking only the moved
    // category's own depth misses this entirely.
    expect(() =>
      assertCategoryPlacement(nodes, "pharmacy", "supermarkets"),
    ).toThrow(/deepest subcategory to level 4/);
  });

  it("allows a legal move of a subtree", () => {
    // Cleaning (height 1) from Household to Groceries — both depth 2, so it
    // lands at 3. Legal.
    expect(assertCategoryPlacement(nodes, "groceries", "cleaning")).toBe(3);
  });

  it("allows promoting a category to the root", () => {
    expect(assertCategoryPlacement(nodes, undefined, "groceries")).toBe(1);
  });
});

describe("productCategoryOptions", () => {
  const nodes = tree();
  const options = productCategoryOptions(nodes);

  it("offers only level-3 categories", () => {
    expect(options.map((o) => o.value).sort()).toEqual(
      ["bread", "cleaning", "dairy", "painrelief"].sort(),
    );
  });

  it("excludes a childless level-2 category", () => {
    // `orphanlevel2` has no children, so a leaf-based picker would offer it.
    // Depth is the rule, not leafness — this is the specific bug being fixed.
    expect(options.some((o) => o.value === "orphanlevel2")).toBe(false);
  });

  it("labels each option with its full breadcrumb", () => {
    expect(options.find((o) => o.value === "bread")?.label).toBe(
      "Supermarkets › Groceries › Bread & Bakery",
    );
  });

  it("sorts by breadcrumb so siblings group under their parent", () => {
    const labels = options.map((o) => o.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });

  it("returns nothing for a tree with no third level", () => {
    expect(
      productCategoryOptions([
        { _id: "a", name: "A", parent_category_id: undefined },
        { _id: "b", name: "B", parent_category_id: "a" },
      ]),
    ).toEqual([]);
  });
});

describe("productPlacementError", () => {
  const nodes = tree();

  it("accepts a level-3 category", () => {
    expect(productPlacementError(nodes, "bread")).toBeNull();
  });

  it("rejects level 1 and level 2, naming the level", () => {
    expect(productPlacementError(nodes, "supermarkets")).toMatch(/level 1/);
    expect(productPlacementError(nodes, "groceries")).toMatch(/level 2/);
  });

  it("rejects a childless level-2 category", () => {
    expect(productPlacementError(nodes, "orphanlevel2")).toMatch(/level 2/);
  });

  it("rejects a missing category", () => {
    expect(productPlacementError(nodes, "ghost")).toMatch(/does not exist/);
  });

  it("rejects a category with a circular chain", () => {
    expect(
      productPlacementError(
        [
          { _id: "a", name: "A", parent_category_id: "b" },
          { _id: "b", name: "B", parent_category_id: "a" },
        ],
        "a",
      ),
    ).toMatch(/broken or circular/);
  });

  it("tells the admin what a valid target looks like", () => {
    // The message has to be actionable: "wrong level" alone leaves someone
    // clicking through three pickers to find out what is expected.
    const message = productPlacementError(nodes, "groceries")!;
    expect(message).toContain(LEVEL_LABELS.join(" › "));
  });
});

describe("the constants stay in step", () => {
  it("has a label for every level", () => {
    // LEVEL_LABELS is indexed by depth - 1 in the error messages, so a mismatch
    // produces "undefined" in text shown to an admin.
    expect(LEVEL_LABELS.length).toBe(CATEGORY_MAX_DEPTH);
  });
});
