/**
 * The category hierarchy: exactly three levels, products on the third.
 *
 *   Supermarkets  ›  Groceries  ›  Bread & Bakery  ›  [products]
 *   depth 1          depth 2       depth 3
 *
 * ── Why this is a pure module ─────────────────────────────────────────────
 *
 * Nothing enforced the shape before. `createCategory` accepted any parent, so a
 * fourth or fifth level could be created; `createProduct` only checked the
 * category EXISTED, so a product could hang off a depth-1 category. Both are
 * silent — the row saves, and the damage only shows up later as a half-empty
 * breadcrumb, a product no category listing reaches, or a picker that cascades
 * one level further than the UI has labels for.
 *
 * The rules live here, without a database, so they can be tested against the
 * cases that actually break them: a cycle, a self-parent, a missing parent, a
 * category being re-pointed under its own descendant. Every one of those is a
 * shape a `ctx.db.get` walk would loop or lie on, and none is reachable through
 * the happy path a manual test would try.
 *
 * ── Terminology ──────────────────────────────────────────────────────────
 *
 * Depth is 1-based, matching how the UI labels the pickers ("Level 1"). A
 * top-level category is depth 1, not 0.
 */

/** The only shape these helpers need — satisfied by `Doc<"categories">`. */
export interface CategoryNode {
  _id: string;
  name: string;
  parent_category_id?: string | undefined;
}

/**
 * How many levels the tree may have, and therefore the depth a product must
 * attach to.
 *
 * Changing this is a data migration, not a config tweak: lowering it orphans
 * every product on a now-too-deep category, and raising it means the cascading
 * picker needs another label. `LEVEL_LABELS` below is deliberately the same
 * length so the two cannot drift.
 */
export const CATEGORY_MAX_DEPTH = 3;

/** Human names for each level, indexed by depth - 1. */
export const LEVEL_LABELS = ["Category", "Subcategory", "Product type"] as const;

/**
 * A cycle guard bound. Any walk longer than this is a cycle, not a deep tree —
 * `CATEGORY_MAX_DEPTH` is 3, so even a corrupt-but-acyclic chain terminates
 * long before here.
 *
 * Without it, a category whose ancestor chain loops (A→B→A, reachable today by
 * two `updateCategory` calls) makes `depthOf` spin forever and takes the whole
 * Convex function down with it rather than returning an error.
 */
const MAX_WALK = 64;

export class CategoryTreeError extends Error {}

/**
 * Index a flat list for repeated lookups.
 *
 * Every helper below takes the map rather than the array, because a mutation
 * validating one category otherwise re-scans the whole list once per ancestor.
 */
export function indexById<T extends CategoryNode>(
  categories: readonly T[],
): Map<string, T> {
  return new Map(categories.map((c) => [c._id, c]));
}

/**
 * The ancestor chain from root to `id`, inclusive.
 *
 * Returns `null` when the chain is broken (a parent id that resolves to
 * nothing) or cyclic — both are corrupt states, and returning a partial path
 * would let a caller compute a plausible-looking depth from it.
 */
export function pathOf<T extends CategoryNode>(
  byId: Map<string, T>,
  id: string,
): T[] | null {
  const reversed: T[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined = id;

  while (currentId) {
    if (seen.has(currentId)) return null; // cycle
    seen.add(currentId);

    const node = byId.get(currentId);
    if (!node) return null; // broken link
    reversed.push(node);

    if (reversed.length > MAX_WALK) return null;
    currentId = node.parent_category_id;
  }

  return reversed.reverse();
}

/**
 * 1-based depth of `id`, or `null` if its ancestor chain is broken or cyclic.
 */
export function depthOf<T extends CategoryNode>(
  byId: Map<string, T>,
  id: string,
): number | null {
  const path = pathOf(byId, id);
  return path ? path.length : null;
}

/** "Supermarkets › Groceries › Bread & Bakery", or null on a broken chain. */
export function breadcrumbOf<T extends CategoryNode>(
  byId: Map<string, T>,
  id: string,
  separator = " › ",
): string | null {
  const path = pathOf(byId, id);
  return path ? path.map((c) => c.name).join(separator) : null;
}

/** Is `candidateId` `id` itself, or anywhere beneath it? */
export function isSelfOrDescendant<T extends CategoryNode>(
  byId: Map<string, T>,
  id: string,
  candidateId: string,
): boolean {
  if (id === candidateId) return true;

  // Walk UP from the candidate: if we meet `id`, the candidate sits beneath it.
  let currentId: string | undefined = candidateId;
  const seen = new Set<string>();
  let steps = 0;

  while (currentId) {
    if (seen.has(currentId) || steps++ > MAX_WALK) return false;
    seen.add(currentId);
    if (currentId === id) return true;
    currentId = byId.get(currentId)?.parent_category_id;
  }
  return false;
}

/**
 * Validate a proposed parent for a category, and return the depth the category
 * would end up at.
 *
 * `movingId` is the category being edited, omitted when creating. It is what
 * makes the two update-only failures checkable: re-parenting a category under
 * itself, and re-parenting it under one of its own descendants — the second
 * being the one that silently detaches a whole subtree from the root and is
 * impossible to notice from the form.
 */
export function resolveDepthForParent<T extends CategoryNode>(
  byId: Map<string, T>,
  parentId: string | undefined,
  movingId?: string,
): number {
  if (!parentId) return 1;

  const parent = byId.get(parentId);
  if (!parent) {
    throw new CategoryTreeError("The selected parent category does not exist.");
  }

  if (movingId) {
    if (parentId === movingId) {
      throw new CategoryTreeError(
        "A category cannot be its own parent.",
      );
    }
    if (isSelfOrDescendant(byId, movingId, parentId)) {
      throw new CategoryTreeError(
        `"${parent.name}" sits beneath this category, so making it the parent ` +
          "would detach this category and everything under it from the tree.",
      );
    }
  }

  const parentDepth = depthOf(byId, parentId);
  if (parentDepth === null) {
    throw new CategoryTreeError(
      `"${parent.name}" has a broken or circular parent chain. Fix that ` +
        "category before nesting anything under it.",
    );
  }

  const depth = parentDepth + 1;
  if (depth > CATEGORY_MAX_DEPTH) {
    throw new CategoryTreeError(
      `The category tree is limited to ${CATEGORY_MAX_DEPTH} levels ` +
        `(${LEVEL_LABELS.join(" › ")}). "${parent.name}" is already at level ` +
        `${parentDepth}, so it cannot have subcategories.`,
    );
  }

  return depth;
}

/**
 * When moving an EXISTING category, its own subtree moves with it — so the
 * limit applies to the deepest leaf beneath it, not just to the category.
 *
 * Re-parenting a depth-1 category that has children under another depth-1
 * category is the case this catches: the category itself lands at depth 2,
 * which is legal, while its children land at 3 and its grandchildren at 4.
 * Checking only the category's own new depth would let that through and leave
 * the tree over-deep with no error anywhere.
 */
export function subtreeHeight<T extends CategoryNode>(
  categories: readonly T[],
  rootId: string,
): number {
  const childrenOf = new Map<string, T[]>();
  for (const c of categories) {
    if (!c.parent_category_id) continue;
    const list = childrenOf.get(c.parent_category_id);
    if (list) list.push(c);
    else childrenOf.set(c.parent_category_id, [c]);
  }

  let height = 1;
  let frontier = [rootId];
  const seen = new Set<string>([rootId]);

  while (frontier.length > 0 && height <= MAX_WALK) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of childrenOf.get(id) ?? []) {
        if (seen.has(child._id)) continue; // cycle guard
        seen.add(child._id);
        next.push(child._id);
      }
    }
    if (next.length === 0) break;
    frontier = next;
    height++;
  }

  return height;
}

/**
 * The full check a create/update must pass. Throws `CategoryTreeError` with a
 * message written for the admin, not the log.
 */
export function assertCategoryPlacement<T extends CategoryNode>(
  categories: readonly T[],
  parentId: string | undefined,
  movingId?: string,
): number {
  const byId = indexById(categories);
  const depth = resolveDepthForParent(byId, parentId, movingId);

  if (movingId) {
    const height = subtreeHeight(categories, movingId);
    if (depth + height - 1 > CATEGORY_MAX_DEPTH) {
      throw new CategoryTreeError(
        `This category has ${height} level${height === 1 ? "" : "s"} beneath ` +
          `it, so moving it to level ${depth} would push its deepest ` +
          `subcategory to level ${depth + height - 1}. The limit is ` +
          `${CATEGORY_MAX_DEPTH}.`,
      );
    }
  }

  return depth;
}

/**
 * Categories a product may be attached to: depth 3 and nothing else.
 *
 * Returned with the full breadcrumb as the label because a third-level name is
 * only unique within its parent — "Festive Bread" could sit under both
 * Supermarkets › Groceries › Bread & Bakery and Pharmacy › Seasonal › Gifting,
 * and a bare name in the picker would be genuinely ambiguous rather than merely
 * terse.
 */
export function productCategoryOptions<T extends CategoryNode>(
  categories: readonly T[],
): { value: string; label: string; name: string }[] {
  const byId = indexById(categories);

  return categories
    .filter((c) => depthOf(byId, c._id) === CATEGORY_MAX_DEPTH)
    .map((c) => ({
      value: c._id,
      label: breadcrumbOf(byId, c._id) ?? c.name,
      name: c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Whether a product may attach here, and why not if not.
 *
 * Returns a reason string rather than throwing, so a query can report on many
 * categories at once (the audit) and a mutation can throw with the same text.
 */
export function productPlacementError<T extends CategoryNode>(
  categories: readonly T[],
  categoryId: string,
): string | null {
  const byId = indexById(categories);
  const category = byId.get(categoryId);
  if (!category) return "The selected category does not exist.";

  const depth = depthOf(byId, categoryId);
  if (depth === null) {
    return `"${category.name}" has a broken or circular parent chain.`;
  }
  if (depth !== CATEGORY_MAX_DEPTH) {
    const label = LEVEL_LABELS[depth - 1] ?? `level ${depth}`;
    return (
      `"${category.name}" is a ${label.toLowerCase()} (level ${depth}). ` +
      `Products must be attached to a level-${CATEGORY_MAX_DEPTH} category ` +
      `(${LEVEL_LABELS[CATEGORY_MAX_DEPTH - 1]}), for example ` +
      `${LEVEL_LABELS.join(" › ")}.`
    );
  }
  return null;
}
