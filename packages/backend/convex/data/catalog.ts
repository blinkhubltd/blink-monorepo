import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { haversineMetres } from "../lib/geo";
import { breadcrumbOf, depthOf, indexById } from "../lib/category_tree";
import { resolveLeafCategoryIds } from "../lib/catalog_scope";
import { VENDOR_SERVICE_RADIUS_LIMIT_KEY } from "./platform_settings";

/**
 * The customer catalogue — category tree and product listings for `apps/shop`.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Browsing a category as a customer needs three filters at once: the category
 * subtree, the vendors that can actually deliver to where the customer is, and
 * `status === "Active"`. Before this file, no query combined all three:
 *
 *   - `products.getProductsForCategoryTreePaginated` walks the subtree but has
 *     no status filter and no coverage filter, so it returns Archived products
 *     from vendors on the other side of the country. It also recomputes `total`
 *     by `.collect()`-ing every category in the tree on *every page*, with a
 *     `console.log` per category.
 *   - `products.productsFromNearestVendor` / `productsFromAllCoveringVendors`
 *     filter by coverage but accept no `categoryId` and no status.
 *   - `products.getProducts` accepts `vendor_ids` and `status` but only a single
 *     `category_id`, not a subtree.
 *
 * So the old app fetched by geolocation alone and filtered by category in
 * memory on the client. That is why its product grid could show inactive stock,
 * and why its category counts were never trustworthy.
 *
 * `clearance_products.getActiveByCoverage` is the closest thing to a correct
 * listing query in this codebase and is the model followed here: offset paging,
 * radius read from `platform_settings`, vendor joined onto each row.
 *
 * ── The 16k ceiling is a throw, not a slowdown ────────────────────────────
 *
 * Convex caps documents scanned per query and *throws* when a query crosses it.
 * A listing that works against seeded data and dies against a real catalogue is
 * the failure mode to design out, so every product read below is a `.take(n)`
 * with a bounded `n` and there is a global scan budget. There is deliberately no
 * `.collect()` over `products` anywhere in this file.
 *
 * ── service_radius is METRES ──────────────────────────────────────────────
 *
 * Four call sites in the old code disagreed: raw in one, `< 10 ? x1000` in
 * another, `< 100 ? x1000` in a third. Those heuristics are themselves the bug —
 * they silently turn a legitimate 80 m radius into 80 km. The admin app's
 * platform-wide limit is authoritative and is in metres, so metres it is, with
 * no conditional multiplication. Vendors whose stored radius looks like
 * kilometres are a data-migration problem, not a runtime guess.
 */

/** Vendors considered per request. Nearest-first, so this is a "closest N". */
const MAX_VENDORS = 25;

/** Products this query may read before it stops counting and reports truncation. */
const MAX_SCANNED = 4000;

/** Per-leaf read cap, so one enormous leaf cannot consume the whole budget. */
const MAX_PER_LEAF = 500;

/** Cap on `productsByIds`, so a crafted request cannot become a table scan. */
const MAX_BY_IDS = 100;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Coordinates a vendor delivers from — service centre if set, else its address. */
function vendorOrigin(vendor: Doc<"vendors">) {
  return {
    lat: vendor.service_center?.lat ?? vendor.coordinates.lat,
    lng: vendor.service_center?.lng ?? vendor.coordinates.lng,
  };
}

/**
 * The platform-wide ceiling on how far a vendor may claim to deliver, in metres.
 *
 * `null` when unset or malformed, meaning "no ceiling" — the same fail-open the
 * admin settings page assumes. A malformed value must not become `NaN` and
 * silently exclude every vendor.
 */
async function readRadiusLimit(ctx: QueryCtx): Promise<number | null> {
  const row = await ctx.db
    .query("platform_settings")
    .withIndex("by_key", (q) =>
      q.eq("key", VENDOR_SERVICE_RADIUS_LIMIT_KEY),
    )
    .first();
  if (!row) return null;
  const parsed = Number.parseFloat(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Every active category, with depth and breadcrumb.
 *
 * One subscription backs the whole browse flow: the level-1 grid, the level-2
 * list, both pill rows, breadcrumbs, and slug -> id resolution. That is what
 * lets the routes carry slugs without a per-screen lookup.
 *
 * Mirrors `categories.getCategoryTree` rather than calling it, keeping two
 * behaviours that are easy to lose: depth is computed over *all* categories
 * before the status filter is applied, so an inactive parent does not make its
 * active child look like a root; and every walk is cycle-guarded, returning
 * `null` rather than hanging.
 *
 * Adds the one thing `getCategoryTree` lacks and the category cards need:
 * `imageUrl`. That is one `storage.getUrl` per category, resolved once per
 * subscription rather than once per page.
 */
export const categoryTreeForShop = query({
  args: { includeImages: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const includeImages = args.includeImages ?? true;

    // Bounded at hundreds of rows, and the tree helpers are pure, so this is
    // the one full read the browse flow makes — reused for depth, breadcrumbs,
    // slug resolution and both pill rows.
    const all = await ctx.db.query("categories").collect();
    const byId = indexById(all);

    const active = all.filter((c) => c.status === "active");

    const nodes = await Promise.all(
      active.map(async (c) => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        parent_category_id: c.parent_category_id,
        sort_order: c.sort_order,
        depth: depthOf(byId, c._id),
        breadcrumb: breadcrumbOf(byId, c._id),
        // `null` is a real outcome, not merely an absence: a category can hold
        // a storage id whose blob has since been deleted. The UI needs to tell
        // that apart from "no image set" so it can render a fallback rather
        // than a broken image box.
        imageUrl:
          includeImages && c.image ? await ctx.storage.getUrl(c.image) : null,
      })),
    );

    nodes.sort((a, b) => {
      const byDepth = (a.depth ?? 99) - (b.depth ?? 99);
      if (byDepth !== 0) return byDepth;
      const bySort = a.sort_order - b.sort_order;
      if (bySort !== 0) return bySort;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  },
});

/**
 * Products under a category subtree, restricted to vendors that deliver to the
 * given point and to `status === "Active"`.
 *
 * `categoryId` may sit at any depth; the subtree is walked down to its depth-3
 * leaves. `l3CategoryId` narrows to a single leaf and is what the second pill
 * row sets.
 *
 * Reports `coverageEmpty` separately from an empty `products` array. The two
 * mean different things to a customer — "no shop delivers to your address yet"
 * is a location problem, "nothing in this aisle nearby" is a stock problem — and
 * the old UI could not tell them apart, so it showed one unhelpful message for
 * both.
 */
export const productsInCategoryTreeByCoverage = query({
  args: {
    categoryId: v.id("categories"),
    lat: v.float64(),
    lng: v.float64(),
    l3CategoryId: v.optional(v.id("categories")),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    includeImages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(args.offset ?? 0, 0);
    // Defaults to TRUE, unlike the three older listing queries this replaces.
    // They default to false, which ships a blank grid to anyone who forgets the
    // flag — a trap worth not reproducing.
    const includeImages = args.includeImages ?? true;

    // ── 1. Leaves. One category read, then pure tree logic. ──
    const allCategories = await ctx.db.query("categories").collect();
    const byId = indexById(allCategories);
    const leafIds = resolveLeafCategoryIds(
      allCategories,
      byId,
      args.categoryId,
      args.l3CategoryId,
    );

    // ── 2. Coverage. If no vendor covers the point, read zero products. ──
    const radiusLimit = await readRadiusLimit(ctx);
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .collect();

    const covering = vendors
      .map((vendor) => {
        const origin = vendorOrigin(vendor);
        const distanceMeters = haversineMetres(
          args.lat,
          args.lng,
          origin.lat,
          origin.lng,
        );
        // The platform limit caps what a vendor can claim. A vendor row saved
        // before the limit existed is grandfathered in the admin UI, but must
        // not out-reach the ceiling here or the limit is decorative.
        const effectiveRadius =
          radiusLimit === null
            ? vendor.service_radius
            : Math.min(vendor.service_radius, radiusLimit);
        return distanceMeters <= effectiveRadius
          ? { vendor, distanceMeters: Math.round(distanceMeters) }
          : null;
      })
      .filter(
        (c): c is { vendor: Doc<"vendors">; distanceMeters: number } => !!c,
      )
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, MAX_VENDORS);

    if (covering.length === 0) {
      return {
        products: [],
        hasMore: false,
        nextOffset: null,
        total: 0,
        totalIsExact: true,
        leafCategoryIds: leafIds,
        vendorCount: 0,
        coverageEmpty: true,
      };
    }

    const distanceByVendor = new Map<string, number>(
      covering.map((c) => [c.vendor._id, c.distanceMeters]),
    );
    const vendorById = new Map<string, Doc<"vendors">>(
      covering.map((c) => [c.vendor._id, c.vendor]),
    );

    // ── 3. Products: indexed per leaf, capped, never collected. ──
    const perLeafCap = Math.min(offset + limit + 1, MAX_PER_LEAF);
    const matched: Array<Doc<"products">> = [];
    let scanned = 0;
    let truncated = false;

    for (const leafId of leafIds) {
      if (scanned >= MAX_SCANNED) {
        truncated = true;
        break;
      }

      const rows = await ctx.db
        .query("products")
        .withIndex("by_category_status", (q) =>
          q.eq("category_id", leafId).eq("status", "Active"),
        )
        .take(perLeafCap);

      scanned += rows.length;
      // Hitting the cap means this leaf may hold more than was read, so the
      // total below cannot be claimed exact.
      if (rows.length === perLeafCap) truncated = true;

      for (const row of rows) {
        // `vendor_id` is optional in the schema, so a product can exist with no
        // vendor at all. Such rows are unreachable for every customer by
        // construction — skipped here rather than silently attributed to
        // someone. Surfaced as a data question rather than papered over.
        if (!row.vendor_id) continue;
        if (!distanceByVendor.has(row.vendor_id)) continue;
        matched.push(row);
      }
    }

    // ── 4. Deterministic order. ──
    // Nearest vendor first, matching the coverage intent. The two tie-breakers
    // are not cosmetic: under offset paging, anything short of a total order
    // lets rows swap between pages, which shows some products twice and hides
    // others entirely.
    matched.sort((a, b) => {
      const da = distanceByVendor.get(a.vendor_id!) ?? Number.MAX_SAFE_INTEGER;
      const dbb = distanceByVendor.get(b.vendor_id!) ?? Number.MAX_SAFE_INTEGER;
      if (da !== dbb) return da - dbb;
      if (a._creationTime !== b._creationTime)
        return a._creationTime - b._creationTime;
      return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
    });

    const page = matched.slice(offset, offset + limit);
    const hasMore = matched.length > offset + limit || truncated;

    // ── 5. Images for the returned page only. ──
    const products = await Promise.all(
      page.map(async (product) => {
        const vendor = vendorById.get(product.vendor_id!)!;
        const category = byId.get(product.category_id);
        const images = includeImages
          ? await Promise.all(
              (product.images ?? []).map((id) => ctx.storage.getUrl(id)),
            )
          : [];
        return {
          ...product,
          // Follows the convention used across this backend: the `images` key
          // is overwritten with resolved URLs rather than sitting alongside the
          // storage ids.
          images,
          // Pre-resolved so every card does not have to re-implement the
          // "first non-null" guard. Deleted blobs yield null entries.
          imageUrl: images.find((u): u is string => !!u) ?? null,
          category: category
            ? { _id: category._id, name: category.name, slug: category.slug }
            : null,
          vendor: {
            _id: vendor._id,
            name: vendor.name,
            distanceMeters: distanceByVendor.get(vendor._id) ?? null,
          },
        };
      }),
    );

    return {
      products,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      // Only reported on the first page, and only claimed exact when nothing
      // was truncated. The query this replaces recomputed a precise-looking
      // total on every page by scanning the whole subtree; a number that costs
      // a full scan and can still be wrong is worse than showing "20+".
      total: offset === 0 ? matched.length : null,
      totalIsExact: !truncated,
      leafCategoryIds: leafIds,
      vendorCount: covering.length,
      coverageEmpty: false,
    };
  },
});

/**
 * Price and describe a known set of products.
 *
 * Exists for the guest cart, which persists ids and quantities on the device
 * and nothing else. Prices and stock are deliberately never read from device
 * storage — a cart that remembers last week's price is a pricing dispute — so
 * the client re-reads them through here.
 *
 * Bounded by cart length rather than paginated, with an explicit cap so a
 * crafted request cannot turn this into a full table read.
 */
export const productsByIds = query({
  args: { ids: v.array(v.id("products")) },
  handler: async (ctx, args) => {
    const ids = args.ids.slice(0, MAX_BY_IDS);
    const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));

    return Promise.all(
      rows
        .filter((r): r is Doc<"products"> => !!r)
        .map(async (product) => {
          const images = await Promise.all(
            (product.images ?? []).map((id) => ctx.storage.getUrl(id)),
          );
          return {
            _id: product._id,
            name: product.name,
            slug: product.slug,
            price: product.price,
            quantity: product.quantity,
            status: product.status,
            unit_value: product.unit_value,
            unit_type: product.unit_type,
            requires_prescription: product.requires_prescription ?? false,
            category_id: product.category_id,
            vendor_id: product.vendor_id,
            imageUrl: images.find((u): u is string => !!u) ?? null,
            // Purchasability is decided here rather than in the client, so the
            // cart screen and the checkout gate cannot disagree about whether a
            // line is orderable.
            isPurchasable: product.status === "Active" && product.quantity > 0,
          };
        }),
    );
  },
});
