import { v, ConvexError } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { lowercaseRecordStatus } from "../validators";
import { assertPermission } from "../auth.helpers";

/**
 * Brand CRUD — the manufacturer/marque a product carries.
 *
 * ── Why this table exists ─────────────────────────────────────────────────
 *
 * `products.brand` and `banners.brand` were free-text strings. That was
 * survivable while a brand was only ever printed on a card, and stopped being
 * survivable the moment a brand banner had to LINK somewhere: a string has no
 * page, no logo, and no identity, so "Coca Cola" and "Coca-Cola" were two
 * brands that no query could reconcile and neither could be tapped.
 *
 * ── Permissions are `categories:*`, deliberately, not `brands:*` ──────────
 *
 * `permissionResources` is a closed union that live roles are graded against,
 * and the production audit recorded in auth.helpers.ts found roles already
 * missing grants they were assumed to hold. Introducing a `brands` resource
 * would mean every non-wildcard role (GENERAL MANAGER, Hub Manager,
 * Supervisor…) silently loses access to this module until someone remembers
 * to re-grant it — the exact failure that audit describes.
 *
 * Brands are catalogue taxonomy, the same kind of master data as categories,
 * and the roles that curate one curate the other. So they are gated on
 * `categories:*`: no new resource, no role migration, nobody locked out.
 * Promoting brands to their own resource later is a find-and-replace here plus
 * a grant on each live role — do it in that order, not this one.
 */

const MAX_PAGE_LIMIT = 200;

const computeBrandSearchText = (brand: {
  name?: string;
  slug?: string;
  description?: string;
}) =>
  [brand.name ?? "", brand.slug ?? "", brand.description ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** "Coca-Cola & Co." -> "coca-cola-co". Matches the category slug shape. */
export function slugifyBrandName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Writes ────────────────────────────────────────────────────────────────

export const createBrand = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    logo: v.optional(v.id("_storage")),
    status: v.union(...lowercaseRecordStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "categories:CREATE");
    const now = Date.now();

    const name = args.name.trim();
    if (name.length < 2) {
      throw new ConvexError("Brand name must be at least 2 characters long");
    }

    const slug = (args.slug?.trim() || slugifyBrandName(name)) as string;
    if (!slug) {
      throw new ConvexError("Brand name must contain at least one letter or number");
    }

    const existing = await ctx.db
      .query("brands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) {
      throw new ConvexError("A brand with this name already exists");
    }

    return await ctx.db.insert("brands", {
      name,
      slug,
      description: args.description?.trim() || undefined,
      logo: args.logo,
      status: args.status,
      searchText: computeBrandSearchText({
        name,
        slug,
        description: args.description,
      }),
      created_at: now,
      updated_at: now,
    });
  },
});

export const updateBrand = mutation({
  args: {
    id: v.id("brands"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    logo: v.optional(v.id("_storage")),
    status: v.optional(
      v.union(...lowercaseRecordStatus.map((e) => v.literal(e))),
    ),
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "categories:UPDATE");
    const { id, ...updates } = args;
    const now = Date.now();

    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Brand not found");

    const name = updates.name?.trim() ?? existing.name;
    if (name.length < 2) {
      throw new ConvexError("Brand name must be at least 2 characters long");
    }

    const slug = updates.slug?.trim() || (updates.name ? slugifyBrandName(name) : existing.slug);
    if (slug !== existing.slug) {
      const clash = await ctx.db
        .query("brands")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (clash && clash._id !== id) {
        throw new ConvexError("A brand with this name already exists");
      }
    }

    const description =
      updates.description === undefined
        ? existing.description
        : updates.description.trim() || undefined;

    return await ctx.db.patch(id, {
      name,
      slug,
      description,
      logo: updates.logo ?? existing.logo,
      status: updates.status ?? existing.status,
      searchText: computeBrandSearchText({ name, slug, description }),
      updated_at: now,
    });
  },
});

/**
 * Deleting a brand that products or banners still point at would leave those
 * rows holding an id that resolves to nothing — a product card with a brand
 * that 404s, a banner whose tap goes nowhere. Refused, with the count, so the
 * admin knows how much work reassigning is before they start.
 */
export const deleteBrand = mutation({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "categories:DELETE");

    const products = await ctx.db
      .query("products")
      .withIndex("by_brand_id", (q) => q.eq("brand_id", args.id))
      .take(1);
    if (products.length > 0) {
      throw new ConvexError(
        "Cannot delete a brand that products are assigned to. Reassign those products first.",
      );
    }

    const banners = await ctx.db
      .query("banners")
      .withIndex("by_brand_id", (q) => q.eq("brand_id", args.id))
      .take(1);
    if (banners.length > 0) {
      throw new ConvexError(
        "Cannot delete a brand that banners promote. Remove or repoint those banners first.",
      );
    }

    return await ctx.db.delete(args.id);
  },
});

export const toggleBrandStatus = mutation({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "categories:UPDATE");
    const brand = await ctx.db.get(args.id);
    if (!brand) throw new Error("Brand not found");

    const status = brand.status === "active" ? "inactive" : "active";
    await ctx.db.patch(args.id, { status, updated_at: Date.now() });
    return { id: args.id, status };
  },
});

// ── Reads ─────────────────────────────────────────────────────────────────

export const getBrands = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(
      v.union(...lowercaseRecordStatus.map((e) => v.literal(e))),
    ),
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "categories:READ");
    const PageLimit = Math.max(1, Math.min(MAX_PAGE_LIMIT, args.limit));
    const search = args.search?.trim();

    const rows = search
      ? await ctx.db
          .query("brands")
          .withSearchIndex("search_text", (q) => {
            const base = q.search("searchText", search);
            return args.status ? base.eq("status", args.status) : base;
          })
          .take(MAX_PAGE_LIMIT)
      : null;

    if (rows) {
      // The search index is not cursor-paginated here, matching how the other
      // admin tables treat a search: it is a filter over a bounded result set,
      // not an endless scroll.
      return {
        data: rows.slice(0, PageLimit),
        pagination: {
          PageLimit,
          total: rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / PageLimit)),
          hasNext: false,
          cursor: null as string | null,
        },
      };
    }

    const base = args.status
      ? ctx.db.query("brands").withIndex("by_status", (q) => q.eq("status", args.status!))
      : ctx.db.query("brands").withIndex("by_name");

    const pageResult = await base.paginate({
      cursor: args.cursor ?? null,
      numItems: PageLimit,
    });

    const all = args.status
      ? await ctx.db
          .query("brands")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("brands").collect();

    return {
      data: pageResult.page,
      pagination: {
        PageLimit,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / PageLimit)),
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

/** Every active brand. Feeds the admin dropdowns and the shop's brand rail. */
export const getAllBrands = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("brands")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect(),
});

export const getBrandById = query({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    const brand = await ctx.db.get(args.id);
    if (!brand) return null;
    return {
      ...brand,
      logoUrl: brand.logo ? await ctx.storage.getUrl(brand.logo) : null,
    };
  },
});

export const getBrandBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!brand) return null;
    return {
      ...brand,
      logoUrl: brand.logo ? await ctx.storage.getUrl(brand.logo) : null,
    };
  },
});

// ── Migration ─────────────────────────────────────────────────────────────

/**
 * One-shot: turn the free-text `brand` strings on products and banners into
 * real brand rows, then clear the strings.
 *
 * Runs in three passes so it is idempotent — re-running after a partial
 * failure resumes rather than duplicating, because a brand is only created
 * when no row already holds its slug, and a document is only patched when its
 * `brand_id` is still unset.
 *
 * Deliberately `internalMutation`: this rewrites catalogue rows and must not
 * be reachable from either app. Run it with
 * `npx convex run data/brands:migrateBrandStringsToBrands '{}'`.
 *
 * Delete this function, the `brand` fields on the two validators, and the
 * `by_brand` indexes once it has run on every deployment.
 */
export const migrateBrandStringsToBrands = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const created: string[] = [];
    const byslug = new Map<string, Id<"brands">>();

    for (const brand of await ctx.db.query("brands").collect()) {
      byslug.set(brand.slug, brand._id);
    }

    async function resolve(rawName: string): Promise<Id<"brands"> | null> {
      const name = rawName.trim();
      if (!name) return null;
      const slug = slugifyBrandName(name);
      if (!slug) return null;

      const known = byslug.get(slug);
      if (known) return known;

      const id = await ctx.db.insert("brands", {
        name,
        slug,
        status: "active",
        searchText: computeBrandSearchText({ name, slug }),
        created_at: now,
        updated_at: now,
      });
      byslug.set(slug, id);
      created.push(name);
      return id;
    }

    let productsLinked = 0;
    for (const product of await ctx.db.query("products").collect()) {
      if (!product.brand) continue;
      const brandId = product.brand_id ?? (await resolve(product.brand));
      await ctx.db.patch(product._id, {
        brand_id: brandId ?? undefined,
        brand: undefined,
      });
      if (brandId) productsLinked++;
    }

    let bannersLinked = 0;
    for (const banner of await ctx.db.query("banners").collect()) {
      if (!banner.brand) continue;
      const brandId = banner.brand_id ?? (await resolve(banner.brand));
      await ctx.db.patch(banner._id, {
        brand_id: brandId ?? undefined,
        brand: undefined,
      });
      if (brandId) bannersLinked++;
    }

    return { brandsCreated: created, productsLinked, bannersLinked };
  },
});
