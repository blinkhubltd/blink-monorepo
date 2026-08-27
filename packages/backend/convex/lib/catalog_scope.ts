import {
  CATEGORY_MAX_DEPTH,
  depthOf,
  isSelfOrDescendant,
  pathOf,
  type CategoryNode,
} from "./category_tree";

/**
 * Which categories a customer's product listing may read from.
 *
 * Pure and ctx-free so it can be tested directly and — more importantly — run
 * on **both** sides: the server uses it to pick which indexed reads to make,
 * and the shop client uses it to build the level-3 filter pills. Running the
 * same function in both places is what guarantees the pills and the query agree
 * about the tree. Two implementations of "which leaves are under this node"
 * would drift, and the symptom would be a pill that returns nothing.
 */

/** A category with the fields this module needs, plus status and ordering. */
export interface ScopedCategory extends CategoryNode {
  status: string;
  sort_order: number;
  name: string;
}

/**
 * Resolve the depth-3 leaf categories to read products from.
 *
 * Products only ever attach at `CATEGORY_MAX_DEPTH`, so browsing a level-1 or
 * level-2 category means reading its level-3 descendants; a level-3 id yields
 * just itself.
 *
 * `l3CategoryId` is the second pill row's selection and is **client-supplied**,
 * so it is validated rather than trusted: it must be both a descendant of
 * `rootId` and actually at leaf depth. Without that check a caller could pair
 * any level-3 id with an unrelated root and read products from a category the
 * UI never offered. An invalid pairing returns an empty leaf set — no products,
 * rather than the wrong products.
 *
 * Returns leaves grouped by branch, in display order. Ordering is by the
 * *path* — each ancestor's `sort_order` in turn — not by the leaf's own
 * `sort_order`. A flat sort interleaves branches: browsing Supermarkets would
 * read Household's "Cleaning" in between Groceries' "Rice" and "Bread", purely
 * because it happens to share a sort number. Under offset paging that means a
 * customer scrolling one department gets products from another spliced in.
 *
 * Stable across requests either way, which is what offset paging needs.
 */
export function resolveLeafCategoryIds<T extends ScopedCategory>(
  all: readonly T[],
  byId: Map<string, T>,
  rootId: T["_id"],
  l3CategoryId?: T["_id"],
): Array<T["_id"]> {
  if (l3CategoryId) {
    const isDescendant = isSelfOrDescendant(byId, rootId, l3CategoryId);
    const atLeafDepth = depthOf(byId, l3CategoryId) === CATEGORY_MAX_DEPTH;
    return isDescendant && atLeafDepth ? [l3CategoryId] : [];
  }

  // A level-3 root is its own only leaf. Checked before the scan below because
  // that scan would also return it, but only via a full pass over every
  // category.
  if (depthOf(byId, rootId) === CATEGORY_MAX_DEPTH) return [rootId];

  const leaves = all.filter(
    (c) =>
      c.status === "active" &&
      depthOf(byId, c._id) === CATEGORY_MAX_DEPTH &&
      isSelfOrDescendant(byId, rootId, c._id),
  );

  return leaves
    .map((c) => ({ category: c, key: branchSortKey(byId, c) }))
    .sort((a, b) => compareBranchKeys(a.key, b.key))
    .map((entry) => entry.category._id);
}

/**
 * A leaf's position expressed as its ancestors' ordering, root-first.
 *
 * `[sort_order, name]` per level, so siblings with the same `sort_order` still
 * order deterministically instead of falling back on insertion order.
 */
function branchSortKey<T extends ScopedCategory>(
  byId: Map<string, T>,
  leaf: T,
): Array<[number, string]> {
  const path = pathOf(byId, leaf._id);
  // A broken chain cannot be placed relative to anything. It is already
  // excluded by the depth check above, so this is belt-and-braces.
  if (!path) return [[Number.MAX_SAFE_INTEGER, leaf.name]];
  return path.map((node) => [node.sort_order, node.name]);
}

function compareBranchKeys(
  a: Array<[number, string]>,
  b: Array<[number, string]>,
): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const [aSort, aName] = a[i]!;
    const [bSort, bName] = b[i]!;
    if (aSort !== bSort) return aSort - bSort;
    const byName = aName.localeCompare(bName);
    if (byName !== 0) return byName;
  }
  return a.length - b.length;
}

/**
 * The level-3 categories to offer as filter pills under a level-2 category.
 *
 * The same set the query will read from, which is the point — a pill that
 * cannot return anything should not be on screen. Callers add their own "All"
 * chip; it is not a category.
 */
export function pillCategoriesFor<T extends ScopedCategory>(
  all: readonly T[],
  byId: Map<string, T>,
  level2Id: string,
): T[] {
  return all
    .filter(
      (c) =>
        c.status === "active" &&
        c.parent_category_id === level2Id &&
        depthOf(byId, c._id) === CATEGORY_MAX_DEPTH,
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}
