import { query, mutation, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import {
  ClearanceProductUpdateValidator,
  bannerTags,
  clearanceProductStatus,
} from "../validators";
import { haversineMeters } from "../lib/geo";

const DAY_MS = 86400000;

const computeClearanceSearchText = (product: {
  name?: string;
  sku?: string;
  brand?: string;
  barcode?: string;
  slug?: string;
}) => {
  return [
    product.name ?? "",
    product.sku ?? "",
    product.brand ?? "",
    product.barcode ?? "",
    product.slug ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .concat("-", Date.now().toString(36));
};

/**
 * Ceiling on one clearance scan.
 *
 * The coverage filter is distance-based and cannot be expressed as an index, so
 * the listings are read and filtered in memory. Bounded rather than collected:
 * the document limit throws instead of degrading.
 */
const MAX_CLEARANCE_SCAN = 2000;

export const create = mutation({
  args: {
    name: v.string(),
    sku: v.string(),
    images: v.optional(v.array(v.id("_storage"))),
    barcode: v.optional(v.string()),
    brand: v.optional(v.string()),
    category_id: v.id("categories"),
    industry_id: v.optional(v.id("industry")),
    vendor_id: v.id("vendors"),
    original_price: v.float64(),
    clearance_price: v.float64(),
    quantity: v.number(),
    expiry_date: v.number(),
    unit_value: v.optional(v.float64()),
    unit_type: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(
      v.array(v.union(...bannerTags.map((e) => v.literal(e)))),
    ),
  },
  handler: async (ctx, args) => {
    // Validate prices
    if (args.clearance_price >= args.original_price) {
      throw new ConvexError("Clearance price must be less than original price");
    }
    if (args.quantity < 1) {
      throw new ConvexError("Quantity must be at least 1");
    }

    // Validate vendor exists
    const vendor = await ctx.db.get(args.vendor_id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Fetch buffer days from platform settings
    const bufferSetting = await ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", "clearance_expiry_buffer_days"))
      .first();
    const bufferDays = bufferSetting ? parseInt(bufferSetting.value, 10) : 1;

    // Calculate derived fields
    const discount_percentage =
      ((args.original_price - args.clearance_price) / args.original_price) *
      100;
    const display_end_date = args.expiry_date - bufferDays * DAY_MS;

    if (display_end_date <= Date.now()) {
      throw new ConvexError(
        "Product display period has already passed. The expiry date minus buffer days must be in the future.",
      );
    }

    const slug = generateSlug(args.name);
    const searchText = computeClearanceSearchText({
      name: args.name,
      sku: args.sku,
      brand: args.brand,
      barcode: args.barcode,
      slug,
    });

    const id = await ctx.db.insert("clearance_products", {
      name: args.name,
      slug,
      sku: args.sku,
      searchText,
      images: args.images,
      barcode: args.barcode,
      brand: args.brand,
      category_id: args.category_id,
      industry_id: args.industry_id,
      vendor_id: args.vendor_id,
      original_price: args.original_price,
      clearance_price: args.clearance_price,
      discount_percentage: Math.round(discount_percentage * 100) / 100,
      quantity: args.quantity,
      expiry_date: args.expiry_date,
      display_end_date,
      status: "Active",
      unit_value: args.unit_value,
      unit_type: args.unit_type,
      description: args.description,
      tags: args.tags,
      created_at: Date.now(),
    });

    // Schedule a notification about new clearance deals (debounced: 5 min delay)
    await ctx.scheduler.runAfter(
      5 * 60 * 1000,
      api.data.notifications.notifyClearanceDeals,
      { dealsCount: 1 },
    );

    return { success: true, id };
  },
});

export const update = mutation({
  args: ClearanceProductUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Clearance product not found");
    }

    const original_price = updates.original_price ?? existing.original_price;
    const clearance_price = updates.clearance_price ?? existing.clearance_price;
    const expiry_date = updates.expiry_date ?? existing.expiry_date;

    if (clearance_price >= original_price) {
      throw new ConvexError("Clearance price must be less than original price");
    }

    // Recalculate derived fields if prices or expiry changed
    const patchData: Record<string, any> = { ...updates };

    if (
      updates.original_price !== undefined ||
      updates.clearance_price !== undefined
    ) {
      patchData.discount_percentage =
        Math.round(
          ((original_price - clearance_price) / original_price) * 100 * 100,
        ) / 100;
    }

    if (updates.expiry_date !== undefined) {
      const bufferSetting = await ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "clearance_expiry_buffer_days"))
        .first();
      const bufferDays = bufferSetting ? parseInt(bufferSetting.value, 10) : 1;
      const newDisplayEnd = expiry_date - bufferDays * DAY_MS;
      patchData.display_end_date = newDisplayEnd;
      patchData.status = newDisplayEnd > Date.now() ? "Active" : "Expired";
    }

    // Recalculate searchText if name/sku/brand/barcode changed
    if (
      updates.name ||
      updates.sku ||
      updates.brand ||
      updates.barcode ||
      updates.slug
    ) {
      patchData.searchText = computeClearanceSearchText({
        name: updates.name ?? existing.name,
        sku: updates.sku ?? existing.sku,
        brand: updates.brand ?? existing.brand,
        barcode: updates.barcode ?? existing.barcode,
        slug: updates.slug ?? existing.slug,
      });
    }

    patchData.updated_at = Date.now();
    delete patchData.id;

    await ctx.db.patch(id, patchData);
    return { success: true };
  },
});

export const deactivate = mutation({
  args: { id: v.id("clearance_products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) {
      throw new Error("Clearance product not found");
    }
    await ctx.db.patch(args.id, {
      status: "Inactive",
      updated_at: Date.now(),
    });
    return { success: true };
  },
});

export const getById = query({
  args: { id: v.id("clearance_products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) return null;

    const vendor = await ctx.db.get(product.vendor_id);
    let vendorImageUrl: string | null = null;
    if (vendor?.image) {
      vendorImageUrl = await ctx.storage.getUrl(vendor.image);
    }

    // Get product image URLs
    let imageUrl: string | null = null;
    if (product.images && product.images.length > 0) {
      imageUrl = await ctx.storage.getUrl(product.images[0]);
    }

    return {
      ...product,
      imageUrl,
      vendor: vendor
        ? {
            _id: vendor._id,
            name: vendor.name,
            imageUrl: vendorImageUrl,
            coordinates: vendor.coordinates,
          }
        : null,
    };
  },
});

export const getAll = query({
  args: {
    status: v.optional(
      v.union(...clearanceProductStatus.map((e) => v.literal(e))),
    ),
    vendor_id: v.optional(v.id("vendors")),
    category_id: v.optional(v.id("categories")),
    industry_id: v.optional(v.id("industry")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);

    let q;
    if (args.status) {
      q = ctx.db
        .query("clearance_products")
        .withIndex("by_status", (idx) => idx.eq("status", args.status!));
    } else if (args.vendor_id) {
      q = ctx.db
        .query("clearance_products")
        .withIndex("by_vendor", (idx) => idx.eq("vendor_id", args.vendor_id!));
    } else if (args.category_id) {
      q = ctx.db
        .query("clearance_products")
        .withIndex("by_category", (idx) =>
          idx.eq("category_id", args.category_id!),
        );
    } else if (args.industry_id) {
      q = ctx.db
        .query("clearance_products")
        .withIndex("by_industry", (idx) =>
          idx.eq("industry_id", args.industry_id!),
        );
    } else {
      q = ctx.db.query("clearance_products");
    }

    const result = await q.order("desc").paginate({
      numItems: limit,
      cursor: args.cursor || null,
    });

    // Enrich with vendor info
    const enriched = await Promise.all(
      result.page.map(async (product) => {
        const vendor = await ctx.db.get(product.vendor_id);
        let vendorImageUrl: string | null = null;
        if (vendor?.image) {
          vendorImageUrl = await ctx.storage.getUrl(vendor.image);
        }
        let imageUrl: string | null = null;
        if (product.images && product.images.length > 0) {
          imageUrl = await ctx.storage.getUrl(product.images[0]);
        }
        return {
          ...product,
          imageUrl,
          vendor: vendor
            ? {
                _id: vendor._id,
                name: vendor.name,
                imageUrl: vendorImageUrl,
                coordinates: vendor.coordinates,
              }
            : null,
        };
      }),
    );

    return {
      ...result,
      page: enriched,
    };
  },
});

export const getActiveByCoverage = query({
  args: {
    lat: v.float64(),
    lng: v.float64(),
    industry_id: v.optional(v.id("industry")),
    category_id: v.optional(v.id("categories")),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const offset = Math.max(args.offset ?? 0, 0);

    // Fetch global clearance radius
    const radiusSetting = await ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", "clearance_service_radius"))
      .first();
    const clearanceRadius = radiusSetting
      ? parseFloat(radiusSetting.value)
      : 5000;

    const now = Date.now();

    // Bounded read. `.collect()` here was unbounded by construction: Convex
    // throws past its per-query document limit rather than degrading, so a
    // listing count that grows past it takes the whole clearance screen out.
    // The cap is reported below so the UI can say it is showing the newest
    // rather than implying it has shown everything.
    const scanned = await ctx.db
      .query("clearance_products")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .take(MAX_CLEARANCE_SCAN);
    const truncated = scanned.length >= MAX_CLEARANCE_SCAN;
    let products = scanned;

    // Filter by display_end_date and quantity
    products = products.filter(
      (p) => p.display_end_date > now && p.quantity > 0,
    );

    // Apply optional filters
    if (args.industry_id) {
      products = products.filter((p) => p.industry_id === args.industry_id);
    }
    if (args.category_id) {
      products = products.filter((p) => p.category_id === args.category_id);
    }

    // Filter by vendor distance and enrich with vendor data
    const results = [];
    // Cache vendors to avoid duplicate lookups
    const vendorCache = new Map<string, any>();

    for (const product of products) {
      let vendor = vendorCache.get(product.vendor_id);
      if (!vendor) {
        vendor = await ctx.db.get(product.vendor_id);
        if (vendor) {
          vendorCache.set(product.vendor_id, vendor);
        }
      }

      if (!vendor || vendor.status !== "Active") continue;

      const vendorLat = vendor.service_center?.lat ?? vendor.coordinates.lat;
      const vendorLng = vendor.service_center?.lng ?? vendor.coordinates.lng;
      const distance = haversineMeters(
        args.lat,
        args.lng,
        vendorLat,
        vendorLng,
      );

      if (distance <= clearanceRadius) {
        let vendorImageUrl: string | null = null;
        if (vendor.image) {
          vendorImageUrl = await ctx.storage.getUrl(vendor.image);
        }
        let imageUrl: string | null = null;
        if (product.images && product.images.length > 0) {
          imageUrl = await ctx.storage.getUrl(product.images[0]);
        }

        results.push({
          ...product,
          imageUrl,
          vendor: {
            _id: vendor._id,
            name: vendor.name,
            imageUrl: vendorImageUrl,
            coordinates: vendor.coordinates,
          },
          distance,
        });
      }
    }

    // Sort by newest first
    results.sort((a, b) => b.created_at - a.created_at);

    const total = results.length;
    const paginatedResults = results.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      products: paginatedResults,
      total,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      // True when the scan cap was reached, so `total` is a floor rather than
      // a count.
      truncated,
    };
  },
});

export const expireListings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("clearance_products")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .collect();

    let count = 0;
    for (const product of expired) {
      if (product.display_end_date <= now) {
        await ctx.db.patch(product._id, {
          status: "Expired",
          updated_at: now,
        });
        count++;
      }
    }
    return { expired: count };
  },
});

export const decrementStock = internalMutation({
  args: {
    id: v.id("clearance_products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) {
      throw new Error("Clearance product not found");
    }
    if (product.quantity < args.quantity) {
      throw new ConvexError("Insufficient stock");
    }

    const newQuantity = product.quantity - args.quantity;
    const updates: Record<string, any> = {
      quantity: newQuantity,
      updated_at: Date.now(),
    };

    if (newQuantity === 0) {
      updates.status = "Sold Out";
    }

    await ctx.db.patch(args.id, updates);
    return { success: true, remaining: newQuantity };
  },
});

/** Returns the distinct vendor IDs that have at least one clearance product. */
export const getVendorIdsWithClearanceProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("clearance_products").collect();
    const vendorIds = [...new Set(products.map((p) => p.vendor_id))];
    return vendorIds;
  },
});

/** Search clearance products by text query (used in home search autocomplete). */
export const searchClearanceProducts = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const term = args.search.trim();
    if (!term) return [];

    const limit = Math.min(args.limit ?? 10, 50);

    const results = await ctx.db
      .query("clearance_products")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", term).eq("status", "Active"),
      )
      .take(limit);

    // Enrich with image URLs
    const enriched = await Promise.all(
      results.map(async (product) => {
        let imageUrl: string | null = null;
        if (product.images && product.images.length > 0) {
          imageUrl = await ctx.storage.getUrl(product.images[0]);
        }
        return {
          _id: product._id,
          name: product.name,
          clearance_price: product.clearance_price,
          original_price: product.original_price,
          discount_percentage: product.discount_percentage,
          imageUrl,
          is_clearance: true,
        };
      }),
    );

    return enriched;
  },
});

/** Returns categories that have at least one active clearance product, optionally filtered by industry. */
export const getAvailableClearanceCategories = query({
  args: {
    industry_id: v.optional(v.id("industry")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    let products = await ctx.db
      .query("clearance_products")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .collect();

    // Only include non-expired products with stock
    products = products.filter(
      (p) => p.display_end_date > now && p.quantity > 0,
    );

    // Filter by industry if specified
    if (args.industry_id) {
      products = products.filter((p) => p.industry_id === args.industry_id);
    }

    // Collect distinct category IDs
    const categoryIds = [...new Set(products.map((p) => p.category_id))];

    // Fetch category documents
    const categories = await Promise.all(
      categoryIds.map((id) => ctx.db.get(id)),
    );

    return categories
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => ({ _id: c._id, name: c.name }));
  },
});
