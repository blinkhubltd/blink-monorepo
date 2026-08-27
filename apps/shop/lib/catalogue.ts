import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { indexById } from "@repo/backend/lib/category_tree";

/**
 * The category tree, and slug resolution against it.
 *
 * ── One subscription for the entire browse flow ───────────────────────────
 *
 * `catalog.categoryTreeForShop` returns every active category with its depth,
 * breadcrumb, parent and image in a single query. That one subscription backs
 * the level-1 grid, the level-2 list, both pill rows, breadcrumbs, and
 * slug -> id resolution.
 *
 * This is what lets the routes carry human-readable slugs (`/c/beverages/
 * soft-drinks`) without a lookup query per screen: the mapping is a `find` over
 * data already in the cache. blink-ecommerce did the same client-side filtering
 * but off `getCategoriesWithImages`, which returns no depth and does not filter
 * by status — so its level-1 grid could include inactive categories and its
 * notion of "level 2" was inferred rather than known.
 *
 * ── `undefined` means in flight, and callers must not conflate it with empty ─
 *
 * A Convex `useQuery` returns `undefined` while loading. Treating that as "not
 * found" and redirecting is exactly how the refresh-to-home bug comes back, so
 * `loading` is surfaced explicitly and every consumer renders skeletons on it.
 */

export type CategoryNodeForShop = {
  _id: Id<"categories">;
  name: string;
  slug: string;
  parent_category_id?: Id<"categories">;
  sort_order: number;
  depth: number | null;
  breadcrumb: string | null;
  imageUrl: string | null;
};

export type CategoryTree = {
  /** True while the subscription is in flight. Never conflate with "empty". */
  loading: boolean;
  all: CategoryNodeForShop[];
  byId: Map<string, CategoryNodeForShop>;
  /** Top-level categories, in display order. The first screen. */
  level1: CategoryNodeForShop[];
  bySlug: (slug: string) => CategoryNodeForShop | null;
  childrenOf: (id: Id<"categories">) => CategoryNodeForShop[];
  /** Level-3 children of a level-2 category — the second pill row. */
  pillsFor: (level2Id: Id<"categories">) => CategoryNodeForShop[];
};

export function useCategoryTree(): CategoryTree {
  const data = useQuery(api.data.catalog.categoryTreeForShop, {});

  return useMemo(() => {
    const all = (data ?? []) as CategoryNodeForShop[];
    const byId = indexById(all);

    // Slugs should be unique, but nothing in the schema enforces it, so this
    // takes the first match rather than pretending the ambiguity cannot exist.
    const bySlug = (slug: string) => all.find((c) => c.slug === slug) ?? null;

    const childrenOf = (id: Id<"categories">) =>
      all
        .filter((c) => c.parent_category_id === id)
        .sort(
          (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
        );

    return {
      loading: data === undefined,
      all,
      byId,
      level1: all
        .filter((c) => c.depth === 1)
        .sort(
          (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
        ),
      bySlug,
      childrenOf,
      // Depth comes from the server, computed by the same lib/category_tree
      // helpers the listing query uses to pick its leaves. So a pill is never
      // offered that the query would not read from — the guarantee holds
      // because both sides trust one computation, not because two
      // implementations happen to agree.
      pillsFor: (level2Id: Id<"categories">) =>
        childrenOf(level2Id).filter((c) => c.depth === 3),
    };
  }, [data]);
}

/**
 * Resolve one or two slugs from the URL into categories.
 *
 * Returns `loading` separately from `notFound` for the reason above: on a cold
 * reload of a deep link the tree is briefly `undefined`, and a screen that
 * cannot tell that apart from a bad slug will bounce the customer to the home
 * screen every single refresh.
 */
export function useCategoryFromSlugs(
  l1Slug?: string,
  l2Slug?: string,
): {
  loading: boolean;
  notFound: boolean;
  tree: CategoryTree;
  level1: CategoryNodeForShop | null;
  level2: CategoryNodeForShop | null;
} {
  const tree = useCategoryTree();

  const level1 = l1Slug ? tree.bySlug(l1Slug) : null;
  const level2 = l2Slug ? tree.bySlug(l2Slug) : null;

  // Only meaningful once the tree has actually resolved.
  const notFound =
    !tree.loading &&
    ((l1Slug !== undefined && !level1) ||
      (l2Slug !== undefined && !level2) ||
      // A level-2 slug that is not under the level-1 slug is a malformed URL,
      // not a missing category — someone hand-edited it or a link went stale.
      (!!level1 && !!level2 && level2.parent_category_id !== level1._id));

  return { loading: tree.loading, notFound, tree, level1, level2 };
}
