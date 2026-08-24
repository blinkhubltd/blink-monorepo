import { Id } from "../_generated/dataModel";
import { mutation, query, internalMutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import {
  ProductsUpdateValidator,
  ProductsValidator,
  productStatus,
  productTags,
} from "../validators";
import { haversineMeters } from "../lib/geo";
import { checkVendorSchedule } from "../lib/schedule";

const computeProductSearchText = (product: {
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

/**
 * @deprecated Use `productsFromNearestVendor` instead. This multi-vendor aggregation
 * mixes products from all covering vendors and will be phased out in favor of a
 * single-nearest-vendor model for clearer UX and performance.
 */
export const productsInCoverage = query({
  args: {
    lat: v.float64(),
    lng: v.float64(),
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, args.limit));
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .collect();

    // Compute covering vendors with distance, sorted nearest first
    const covering = vendors
      .map((v) => ({
        v,
        d: haversineMeters(
          args.lat,
          args.lng,
          v.coordinates.lat,
          v.coordinates.lng,
        ),
      }))
      .filter((r) => r.d <= r.v.service_radius)
      .sort((a, b) => a.d - b.d)
      .map((r) => r.v);

    if (covering.length === 0) {
      return {
        data: [],
        pagination: {
          limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          cursor: null,
        },
      };
    }

    // Cursor format: vendorIndex|offsetInsideVendor
    let vendorIndex = 0;
    let offset = 0;
    if (args.cursor) {
      const [vi, off] = (args.cursor as string).split("|");
      vendorIndex = parseInt(vi, 10) || 0;
      offset = parseInt(off, 10) || 0;
    }

    const collected: any[] = [];
    let currentVendorIndex = vendorIndex;
    let currentOffset = offset;

    while (currentVendorIndex < covering.length && collected.length < limit) {
      const vendor = covering[currentVendorIndex];
      const productsForVendor = await ctx.db
        .query("products")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", vendor._id))
        .collect();

      while (
        currentOffset < productsForVendor.length &&
        collected.length < limit
      ) {
        collected.push(productsForVendor[currentOffset]);
        currentOffset++;
      }
      if (currentOffset >= productsForVendor.length) {
        currentVendorIndex++;
        currentOffset = 0;
      }
    }

    // Compute total (could cache later). For large sets, avoid this full scan; acceptable for current scale.
    let totalCount = 0;
    for (const vdr of covering) {
      const prods = await ctx.db
        .query("products")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", vdr._id))
        .collect();
      totalCount += prods.length;
    }

    const hasNext = currentVendorIndex < covering.length;
    const nextCursor = hasNext
      ? `${currentVendorIndex}|${currentOffset}`
      : null;

    const withImages = await Promise.all(
      collected.map(async (product) => {
        const imageUrls = product.images
          ? await Promise.all(
              product.images.map(async (imageId: Id<"_storage">) =>
                ctx.storage.getUrl(imageId),
              ),
            )
          : [];
        return {
          ...product,
          image_storage_ids: product.images ?? [],
          images: imageUrls,
        };
      }),
    );

    return {
      data: withImages,
      pagination: {
        limit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
        hasNext,
        cursor: nextCursor,
      },
    };
  },
});

export const productsFromAllCoveringVendors = query({
  args: {
    lat: v.float64(),
    lng: v.float64(),
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    includeImages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, args.limit));
    const includeImages = args.includeImages ?? true;

    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .collect();

    console.log(`[DEBUG] Location: ${args.lat}, ${args.lng}`);
    console.log(`[DEBUG] Found ${vendors.length} active vendors`);

    // Get all vendors that cover this location
    const covering = vendors
      .map((v) => {
        const distance = haversineMeters(
          args.lat,
          args.lng,
          v.service_center?.lat ?? v.coordinates.lat,
          v.service_center?.lng ?? v.coordinates.lng,
        );

        // Intelligently handle service radius units
        const radiusInMeters =
          v.service_radius < 10
            ? v.service_radius * 1000 // Convert km to meters
            : v.service_radius; // Already in meters

        const withinRadius = distance <= radiusInMeters;

        // Get current day schedule information
        const now = new Date();
        const dayNames = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const currentDay = dayNames[now.getDay()];
        const scheduleCheck = checkVendorSchedule(v.schedule);
        const daySchedule =
          v.schedule?.weeklySchedule?.[
            currentDay as keyof typeof v.schedule.weeklySchedule
          ];

        console.log(`[DEBUG] Vendor: ${v.name}`);
        console.log(`[DEBUG]   Distance: ${Math.round(distance)}m`);
        console.log(`[DEBUG]   Raw Service Radius: ${v.service_radius}`);
        console.log(`[DEBUG]   Adjusted Service Radius: ${radiusInMeters}m`);
        console.log(`[DEBUG]   Covers Location: ${withinRadius}`);
        console.log(`[DEBUG]   Current Day: ${currentDay}`);
        console.log(
          `[DEBUG]   Schedule End Time: ${daySchedule?.endTime ?? "N/A"}`,
        );
        console.log(
          `[DEBUG]   Closing Time: ${scheduleCheck.closingTime ?? "N/A (Always Open or No Schedule)"}`,
        );
        console.log(`[DEBUG]   Is Operational: ${scheduleCheck.isOperational}`);
        console.log(
          `[DEBUG]   Is Too Close to Closing: ${scheduleCheck.isTooClose}`,
        );

        return withinRadius ? { v, distance } : null;
      })
      .filter((x): x is { v: (typeof vendors)[0]; distance: number } => !!x)
      .sort((a, b) => a.distance - b.distance);

    console.log(`[DEBUG] ${covering.length} vendors cover this location`);

    if (covering.length === 0) {
      return {
        vendors: [],
        data: [],
        pagination: {
          limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          cursor: null,
        },
      };
    }

    // Cursor format: vendorIndex|offsetInsideVendor
    let vendorIndex = 0;
    let offset = 0;
    if (args.cursor) {
      const [vi, off] = (args.cursor as string).split("|");
      vendorIndex = parseInt(vi, 10) || 0;
      offset = parseInt(off, 10) || 0;
    }

    const collected: any[] = [];
    let currentVendorIndex = vendorIndex;
    let currentOffset = offset;

    // Collect products from all covering vendors
    while (currentVendorIndex < covering.length && collected.length < limit) {
      const vendor = covering[currentVendorIndex].v;
      const productsForVendor = await ctx.db
        .query("products")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", vendor._id))
        .collect();

      while (
        currentOffset < productsForVendor.length &&
        collected.length < limit
      ) {
        collected.push(productsForVendor[currentOffset]);
        currentOffset++;
      }
      if (currentOffset >= productsForVendor.length) {
        currentVendorIndex++;
        currentOffset = 0;
      }
    }

    // Compute total count across all covering vendors
    let totalCount = 0;
    for (const { v } of covering) {
      const prods = await ctx.db
        .query("products")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", v._id))
        .collect();
      totalCount += prods.length;
    }

    const hasNext = currentVendorIndex < covering.length;
    const nextCursor = hasNext
      ? `${currentVendorIndex}|${currentOffset}`
      : null;

    let productsData: any[];
    if (includeImages) {
      productsData = await Promise.all(
        collected.map(async (product) => {
          const imageUrls = product.images
            ? await Promise.all(
                product.images.map((id: Id<"_storage">) =>
                  ctx.storage.getUrl(id),
                ),
              )
            : [];
          return { ...product, images: imageUrls };
        }),
      );
    } else {
      productsData = collected;
    }

    // Return vendor metadata for all covering vendors
    const vendorsMeta = covering.map(({ v, distance }) => ({
      _id: v._id,
      name: v.name,
      distanceMeters: Math.round(distance),
      service_radius: v.service_radius,
      coordinates: v.coordinates,
    }));

    return {
      vendors: vendorsMeta,
      data: productsData,
      pagination: {
        limit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
        hasNext,
        cursor: nextCursor,
      },
    };
  },
});

export const productsFromNearestVendor = query({
  args: {
    lat: v.float64(),
    lng: v.float64(),
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    includeImages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, args.limit));
    const includeImages = args.includeImages ?? false;

    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .collect();

    console.log(`[DEBUG] Location: ${args.lat}, ${args.lng}`);
    console.log(`[DEBUG] Found ${vendors.length} active vendors`);

    const covering = vendors
      .map((v) => {
        const distance = haversineMeters(
          args.lat,
          args.lng,
          v.service_center?.lat ?? v.coordinates.lat,
          v.service_center?.lng ?? v.coordinates.lng,
        );

        // Intelligently handle service radius units
        // If service_radius is very small (< 10), assume it's in kilometers
        const radiusInMeters =
          v.service_radius < 10
            ? v.service_radius * 1000 // Convert km to meters
            : v.service_radius; // Already in meters

        const withinRadius = distance <= radiusInMeters;

        console.log(`[DEBUG] Vendor: ${v.name}`);
        console.log(`[DEBUG]   Distance: ${Math.round(distance)}m`);
        console.log(`[DEBUG]   Raw Service Radius: ${v.service_radius}`);
        console.log(`[DEBUG]   Adjusted Service Radius: ${radiusInMeters}m`);
        console.log(`[DEBUG]   Covers Location: ${withinRadius}`);

        return withinRadius ? { v, distance } : null;
      })
      .filter((x): x is { v: (typeof vendors)[0]; distance: number } => !!x)
      .sort((a, b) => a.distance - b.distance);

    console.log(`[DEBUG] ${covering.length} vendors cover this location`);
    if (covering.length > 0) {
      console.log(
        `[DEBUG] Nearest vendor: ${covering[0].v.name} at ${Math.round(covering[0].distance)}m`,
      );
    }

    if (covering.length === 0) {
      return {
        vendor: null,
        data: [],
        pagination: {
          limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          cursor: null,
        },
      };
    }

    const nearestVendor = covering[0].v;

    const pageResult = await ctx.db
      .query("products")
      .withIndex("by_vendor", (q) => q.eq("vendor_id", nearestVendor._id))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const allForTotal = await ctx.db
      .query("products")
      .withIndex("by_vendor", (q) => q.eq("vendor_id", nearestVendor._id))
      .collect();

    const total = allForTotal.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    let productsData: any[];
    if (includeImages) {
      productsData = await Promise.all(
        pageResult.page.map(async (product) => {
          const imageUrls = product.images
            ? await Promise.all(
                product.images.map((id: Id<"_storage">) =>
                  ctx.storage.getUrl(id),
                ),
              )
            : [];
          return { ...product, images: imageUrls };
        }),
      );
    } else {
      // Return raw product docs (images array remains storage Ids) – client can resolve lazily if needed.
      productsData = pageResult.page;
    }

    return {
      vendor: {
        _id: nearestVendor._id,
        name: nearestVendor.name,
        distanceMeters: Math.round(covering[0].distance),
        service_radius: nearestVendor.service_radius,
        coordinates: nearestVendor.coordinates,
      },
      data: productsData,
      pagination: {
        limit,
        total,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const getProductWithImages = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) return null;

    const imageUrls = product.images
      ? await Promise.all(
          product.images.map(async (imageId) => ctx.storage.getUrl(imageId)),
        )
      : [];

    return { ...product, images: imageUrls };
  },
});

export const getProducts = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(
      v.union(...productStatus.map((e) => v.literal(e))),
    ),
    category_id: v.optional(v.id("categories")),
    vendor_id: v.optional(v.id("vendors")),
    vendor_ids: v.optional(v.array(v.id("vendors"))),
  },
  handler: async (ctx, args) => {
    const PageLimit = Math.max(1, Math.min(200, args.limit));
    const normalizedSearch = (args.search ?? "").trim();
    const isSearching = normalizedSearch.length > 0;

    // If vendor_ids is provided with a single ID and no vendor_id, use it as vendor_id
    const effectiveVendorId =
      args.vendor_id ??
      (args.vendor_ids?.length === 1 ? args.vendor_ids[0] : undefined);
    const vendorIdsFilter =
      !effectiveVendorId && args.vendor_ids && args.vendor_ids.length > 1
        ? args.vendor_ids
        : undefined;

    const baseQuery = ctx.db.query("products");

    let productsQuery;
    if (isSearching) {
      productsQuery = baseQuery.withSearchIndex("search_text", (q) => {
        let sq = q.search("searchText", normalizedSearch);
        if (args.status) {
          sq = sq.eq("status", args.status);
        }
        if (args.category_id) {
          sq = sq.eq("category_id", args.category_id);
        }
        if (effectiveVendorId) {
          sq = sq.eq("vendor_id", effectiveVendorId);
        }
        return sq;
      });
    } else if (args.status && args.category_id) {
      productsQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.eq(q.field("category_id"), args.category_id!))
        .order("desc");
    } else if (args.status && effectiveVendorId) {
      productsQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.eq(q.field("vendor_id"), effectiveVendorId!))
        .order("desc");
    } else if (args.status) {
      productsQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc");
    } else if (args.category_id) {
      productsQuery = baseQuery
        .withIndex("by_category", (q) => q.eq("category_id", args.category_id!))
        .order("desc");
    } else if (effectiveVendorId) {
      productsQuery = baseQuery
        .withIndex("by_vendor", (q) => q.eq("vendor_id", effectiveVendorId!))
        .order("desc");
    } else {
      productsQuery = baseQuery.order("desc");
    }

    // Apply multi-vendor filter when vendor_ids has multiple IDs
    if (vendorIdsFilter) {
      productsQuery = productsQuery.filter((q: any) =>
        q.or(
          ...vendorIdsFilter.map((id: any) => q.eq(q.field("vendor_id"), id)),
        ),
      );
    }

    const pageResult = await productsQuery.paginate({
      cursor: args.cursor ?? null,
      numItems: PageLimit,
    });

    const currentPageDocs = pageResult.page;

    const totalCount = await (async () => {
      let countQuery;
      if (isSearching) {
        countQuery = baseQuery.withSearchIndex("search_text", (q) => {
          let sq = q.search("searchText", normalizedSearch);
          if (args.status) {
            sq = sq.eq("status", args.status);
          }
          if (args.category_id) {
            sq = sq.eq("category_id", args.category_id);
          }
          if (effectiveVendorId) {
            sq = sq.eq("vendor_id", effectiveVendorId);
          }
          return sq;
        });
      } else if (args.status) {
        countQuery = baseQuery.withIndex("by_status", (q) =>
          q.eq("status", args.status!),
        );
      } else if (args.category_id) {
        countQuery = baseQuery.withIndex("by_category", (q) =>
          q.eq("category_id", args.category_id!),
        );
      } else if (effectiveVendorId) {
        countQuery = baseQuery.withIndex("by_vendor", (q) =>
          q.eq("vendor_id", effectiveVendorId!),
        );
      } else {
        countQuery = baseQuery;
      }
      if (vendorIdsFilter) {
        countQuery = countQuery.filter((q: any) =>
          q.or(
            ...vendorIdsFilter.map((id: any) => q.eq(q.field("vendor_id"), id)),
          ),
        );
      }
      return (await countQuery.collect()).length;
    })();

    const productsWithImages = await Promise.all(
      currentPageDocs.map(async (product) => {
        const imageUrls = product.images
          ? await Promise.all(
              product.images.map(async (imageId) =>
                ctx.storage.getUrl(imageId),
              ),
            )
          : [];
        return { ...product, images: imageUrls };
      }),
    );

    const totalPages = Math.max(1, Math.ceil(totalCount / PageLimit));

    return {
      data: productsWithImages,
      pagination: {
        PageLimit,
        total: totalCount,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const backfillProductsSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let updatedCount = 0;

    for (const product of products) {
      const searchText = computeProductSearchText(product);
      if (product.searchText === searchText) continue;
      await ctx.db.patch(product._id, { searchText, updated_at: Date.now() });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

export const getAllProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const productsWithImages = await Promise.all(
      products.map(async (product) => {
        const imageUrls = product.images
          ? await Promise.all(
              product.images.map(async (imageId) =>
                ctx.storage.getUrl(imageId),
              ),
            )
          : [];
        return { ...product, images: imageUrls };
      }),
    );
    return productsWithImages;
  },
});

export const getProductsByCategoryWithImages = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("category_id", args.categoryId))
      .collect();

    const productsWithImages = await Promise.all(
      products.map(async (product) => {
        const imageUrls = product.images
          ? await Promise.all(
              product.images.map(async (imageId) =>
                ctx.storage.getUrl(imageId),
              ),
            )
          : [];

        return { ...product, images: imageUrls };
      }),
    );

    return productsWithImages;
  },
});

export const getProductsByCategoryWithImagesPaginated = query({
  args: {
    categoryId: v.id("categories"),
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    includeImages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(50, args.limit));
    const includeImages = args.includeImages ?? false;

    const pageResult = await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("category_id", args.categoryId))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const currentPageDocs = pageResult.page;
    const total = (
      await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("category_id", args.categoryId))
        .collect()
    ).length;

    let productsData: any[];
    if (includeImages) {
      productsData = await Promise.all(
        currentPageDocs.map(async (product) => {
          const imageUrls = product.images
            ? await Promise.all(
                product.images.map(async (imageId) =>
                  ctx.storage.getUrl(imageId),
                ),
              )
            : [];
          return { ...product, images: imageUrls };
        }),
      );
    } else {
      productsData = currentPageDocs;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: productsData,
      pagination: {
        limit,
        total,
        totalPages,
        cursor: pageResult.continueCursor ?? null,
        hasMore: pageResult.isDone === false,
      },
    };
  },
});

export const getProductsForCategoryTreePaginated = query({
  args: {
    categoryId: v.id("categories"),
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    includeImages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, args.limit));
    const includeImages = args.includeImages ?? false;
    const allCategories = await ctx.db.query("categories").collect();

    // Build descendant list (BFS)
    const descendants: Id<"categories">[] = [] as any;
    const queue: Id<"categories">[] = [args.categoryId];
    const visited = new Set<string>();
    while (queue.length) {
      const current = queue.shift()!;
      if (!visited.has(current)) {
        visited.add(current);
        // Find children
        const children = allCategories.filter(
          (c) => c.parent_category_id === current,
        ) as any[];
        for (const child of children) {
          descendants.push(child._id);
          queue.push(child._id);
        }
      }
    }
    const categoryIds = [args.categoryId, ...descendants];

    console.log(
      "Category tree for:",
      args.categoryId,
      "includes:",
      categoryIds.length,
      "categories",
    );

    // Parse cursor: categoryIndex|offset
    let startCategoryIndex = 0;
    let startOffset = 0;
    if (args.cursor) {
      const [ci, off] = (args.cursor as string).split("|");
      startCategoryIndex = parseInt(ci, 10) || 0;
      startOffset = parseInt(off, 10) || 0;
    }

    const collected: any[] = [];
    let currentCategoryIndex = startCategoryIndex;
    let currentOffset = startOffset;

    while (
      currentCategoryIndex < categoryIds.length &&
      collected.length < limit
    ) {
      const catId = categoryIds[currentCategoryIndex];
      const catProducts = await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("category_id", catId))
        .order("desc")
        .collect();

      console.log(`Category ${catId} has ${catProducts.length} products`);

      while (currentOffset < catProducts.length && collected.length < limit) {
        collected.push(catProducts[currentOffset]);
        currentOffset++;
      }
      if (currentOffset >= catProducts.length) {
        currentCategoryIndex++;
        currentOffset = 0;
      }
    }

    // Compute total count across all categories in tree
    let total = 0;
    for (const cid of categoryIds) {
      const prods = await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("category_id", cid))
        .collect();
      total += prods.length;
    }

    console.log(
      `Total products across category tree: ${total}, collected: ${collected.length}`,
    );

    const hasMore = currentCategoryIndex < categoryIds.length;
    const nextCursor = hasMore
      ? `${currentCategoryIndex}|${currentOffset}`
      : null;

    // Resolve image URLs
    let productsData: any[];
    if (includeImages) {
      productsData = await Promise.all(
        collected.map(async (product) => {
          const imageUrls = product.images
            ? await Promise.all(
                product.images.map(async (imageId: Id<"_storage">) =>
                  ctx.storage.getUrl(imageId),
                ),
              )
            : [];
          return { ...product, images: imageUrls };
        }),
      );
    } else {
      productsData = collected;
    }

    return {
      data: productsData,
      pagination: {
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        cursor: nextCursor,
        hasMore,
      },
    };
  },
});

export const createProduct = mutation({
  args: ProductsValidator,
  handler: async (ctx, args) => {
    const now = Date.now();

    const category = await ctx.db.get(args.category_id);
    if (!category) {
      throw new Error("Category not found");
    }

    const existingProduct = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existingProduct) {
      throw new ConvexError("Product with this slug already exists");
    }

    const existingSKU = await ctx.db
      .query("products")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .first();

    if (existingSKU) {
      throw new ConvexError("Product with this SKU already exists");
    }

    const searchText = computeProductSearchText(args);

    return await ctx.db.insert("products", {
      ...args,
      searchText,
      created_at: now,
      updated_at: now,
    });
  },
});

export const getProductsById = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getProductsByCategory = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("category_id", args.categoryId))
      .collect();
  },
});

export const getProductsBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
  },
});

export const getProductBySKU = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .first();
  },
});

export const getActiveProducts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("products")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .collect();
  },
});

export const getInactiveProducts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("products")
      .withIndex("by_status", (q) => q.eq("status", "Inactive"))
      .collect();
  },
});

export const getArchivedProducts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("products")
      .withIndex("by_status", (q) => q.eq("status", "Archived"))
      .collect();
  },
});

export const getProductsByVendor = query({
  args: {
    vendorId: v.id("vendors"),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, args.limit));

    const pageResult = await ctx.db
      .query("products")
      .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendorId))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const currentPageProducts = pageResult.page;

    const total = (
      await ctx.db
        .query("products")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendorId))
        .collect()
    ).length;

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: currentPageProducts,
      pagination: {
        limit,
        total,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const updateProduct = mutation({
  args: ProductsUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    const existingProduct = await ctx.db.get(id);
    if (!existingProduct) {
      throw new Error("Product not found");
    }

    if (updates.slug) {
      const productWithSlug = await ctx.db
        .query("products")
        .withIndex("by_slug", (q) => q.eq("slug", updates.slug!))
        .first();

      if (productWithSlug && productWithSlug._id !== id) {
        throw new ConvexError("Product with this slug already exists");
      }
    }

    if (updates.sku) {
      const productWithSKU = await ctx.db
        .query("products")
        .withIndex("by_sku", (q) => q.eq("sku", updates.sku!))
        .first();

      if (productWithSKU && productWithSKU._id !== id) {
        throw new ConvexError("Product with this SKU already exists");
      }
    }

    if (updates.category_id) {
      const category = await ctx.db.get(updates.category_id);
      if (!category) {
        throw new Error("Category not found");
      }
    }

    const nextSearchText = computeProductSearchText({
      ...existingProduct,
      ...updates,
    });

    return await ctx.db.patch(id, {
      ...updates,
      searchText: nextSearchText,
      updated_at: now,
    });
  },
});

export const updateProductQuantity = mutation({
  args: {
    id: v.id("products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const product = await ctx.db.get(args.id);
    if (!product) {
      throw new Error("Product not found");
    }

    return await ctx.db.patch(args.id, {
      quantity: args.quantity,
      updated_at: now,
    });
  },
});

export const updateSingleProductStatus = mutation({
  args: {
    productId: v.id("products"),
    status: v.union(...productStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    return await ctx.db.patch(args.productId, {
      status: args.status,
      updated_at: now,
    });
  },
});

export const bulkUpdateProductStatus = mutation({
  args: {
    productIds: v.array(v.id("products")),
    status: v.union(...productStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.productIds) {
      const result = await ctx.db.patch(id, { status: args.status });
      results.push(result);
    }
    return results;
  },
});

// Get product details with multiple images for product details page
export const getProductDetails = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) {
      return null;
    }

    // Process multiple images
    const imageUrls = product.images
      ? await Promise.all(
          product.images.map(async (imageId) => {
            return await ctx.storage.getUrl(imageId);
          }),
        )
      : [];

    // Get category details
    const category = await ctx.db.get(product.category_id);

    // Get vendor details if available
    const vendor = product.vendor_id
      ? await ctx.db.get(product.vendor_id)
      : null;

    return {
      ...product,
      images: imageUrls,
      category: category
        ? {
            _id: category._id,
            name: category.name,
            slug: category.slug,
          }
        : null,
      vendor: vendor
        ? {
            _id: vendor._id,
            name: vendor.name,
            contact: vendor.contact,
          }
        : null,
      // Helper computed fields
      isInStock: product.quantity > 0,
      isLowStock: product.quantity > 0 && product.quantity <= 5,
      stockStatus: product.quantity > 0 ? "In Stock" : "Out of Stock",
      hasDiscount: false, // You can add discount logic here
      originalPrice: product.price, // For future discount calculations
      discountPercentage: 0, // For future discount calculations
    };
  },
});

// Get related/recommended products
export const getRelatedProducts = query({
  args: {
    productId: v.id("products"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 4;
    const product = await ctx.db.get(args.productId);

    if (!product) return [];

    // Get products from the same category, excluding the current product
    const relatedProducts = await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("category_id", product.category_id))
      .filter((q) => q.neq(q.field("_id"), args.productId))
      .filter((q) => q.eq(q.field("status"), "Active"))
      .take(limit);

    // Process images for related products
    const productsWithImages = await Promise.all(
      relatedProducts.map(async (prod) => {
        const imageUrls = prod.images
          ? await Promise.all(
              prod.images.map(async (imageId) => ctx.storage.getUrl(imageId)),
            )
          : [];
        return { ...prod, images: imageUrls };
      }),
    );

    return productsWithImages;
  },
});

// Debug query to check vendor data and coverage
export const debugVendorCoverage = query({
  args: {
    lat: v.float64(),
    lng: v.float64(),
  },
  handler: async (ctx, args) => {
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .collect();

    const results = vendors.map((v) => {
      const distance = haversineMeters(
        args.lat,
        args.lng,
        v.coordinates.lat,
        v.coordinates.lng,
      );

      // Intelligently handle service radius units
      const radiusInMeters =
        v.service_radius < 100
          ? v.service_radius * 1000 // Convert km to meters
          : v.service_radius; // Already in meters

      return {
        name: v.name,
        coordinates: v.coordinates,
        raw_service_radius: v.service_radius,
        adjusted_service_radius: radiusInMeters,
        distance: Math.round(distance),
        covers: distance <= radiusInMeters,
      };
    });

    return {
      location: { lat: args.lat, lng: args.lng },
      vendors: results,
    };
  },
});

// Debug query to check all vendor data
export const debugAllVendors = query({
  args: {},
  handler: async (ctx) => {
    const vendors = await ctx.db.query("vendors").collect();

    const vendorsWithProductCount = await Promise.all(
      vendors.map(async (v) => {
        const products = await ctx.db
          .query("products")
          .withIndex("by_vendor", (q) => q.eq("vendor_id", v._id))
          .collect();

        return {
          id: v._id,
          name: v.name,
          coordinates: v.coordinates,
          service_radius: v.service_radius,
          status: v.status,
          productCount: products.length,
          sampleProducts: products
            .slice(0, 3)
            .map((p) => ({ name: p.name, sku: p.sku })),
        };
      }),
    );

    return vendorsWithProductCount;
  },
});

// ── Bulk Import ──────────────────────────────────────────────────────────────

export const bulkCreateProducts = mutation({
  args: {
    products: v.array(
      v.object({
        name: v.string(),
        slug: v.string(),
        sku: v.string(),
        brand: v.optional(v.string()),
        category_id: v.id("categories"),
        vendor_id: v.optional(v.id("vendors")),
        price: v.float64(),
        quantity: v.number(),
        unit_value: v.optional(v.float64()),
        unit_type: v.optional(v.string()),
        description: v.optional(v.string()),
        status: v.union(...productStatus.map((e) => v.literal(e))),
        tags: v.optional(
          v.array(
            v.union(...productTags.map((e) => v.literal(e))),
          ),
        ),
        upc: v.optional(v.number()),
        barcode: v.optional(v.string()),
        external_id: v.optional(v.string()),
        requires_prescription: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results: { success: number; failed: number; errors: string[] } = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const product of args.products) {
      try {
        // Validate category exists
        const category = await ctx.db.get(product.category_id);
        if (!category) {
          results.failed++;
          results.errors.push(`"${product.name}": Category not found`);
          continue;
        }

        // Check slug uniqueness
        const existingSlug = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", product.slug))
          .first();
        if (existingSlug) {
          results.failed++;
          results.errors.push(
            `"${product.name}": Slug "${product.slug}" already exists`,
          );
          continue;
        }

        // Check SKU uniqueness
        const existingSKU = await ctx.db
          .query("products")
          .withIndex("by_sku", (q) => q.eq("sku", product.sku))
          .first();
        if (existingSKU) {
          results.failed++;
          results.errors.push(
            `"${product.name}": SKU "${product.sku}" already exists`,
          );
          continue;
        }

        const searchText = computeProductSearchText(product);
        await ctx.db.insert("products", {
          ...product,
          searchText,
          created_at: now,
          updated_at: now,
        });
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(
          `"${product.name}": ${error.message || "Unknown error"}`,
        );
      }
    }

    return results;
  },
});

// ── Internal bulk create used by the server-side import action ─
export const internalBulkCreateProducts = internalMutation({
  args: {
    products: v.array(
      v.object({
        name: v.string(),
        slug: v.string(),
        sku: v.string(),
        brand: v.optional(v.string()),
        category_id: v.id("categories"),
        vendor_id: v.optional(v.id("vendors")),
        price: v.float64(),
        quantity: v.number(),
        unit_value: v.optional(v.float64()),
        unit_type: v.optional(v.string()),
        description: v.optional(v.string()),
        status: v.union(...productStatus.map((e) => v.literal(e))),
        tags: v.optional(
          v.array(
            v.union(...productTags.map((e) => v.literal(e))),
          ),
        ),
        upc: v.optional(v.number()),
        barcode: v.optional(v.string()),
        external_id: v.optional(v.string()),
        requires_prescription: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const product of args.products) {
      try {
        const category = await ctx.db.get(product.category_id);
        if (!category) {
          results.failed++;
          results.errors.push(`"${product.name}": Category not found`);
          continue;
        }

        const existingSlug = await ctx.db
          .query("products")
          .withIndex("by_slug", (q) => q.eq("slug", product.slug))
          .first();
        if (existingSlug) {
          results.failed++;
          results.errors.push(
            `"${product.name}": Slug "${product.slug}" already exists`,
          );
          continue;
        }

        const existingSKU = await ctx.db
          .query("products")
          .withIndex("by_sku", (q) => q.eq("sku", product.sku))
          .first();
        if (existingSKU) {
          results.failed++;
          results.errors.push(
            `"${product.name}": SKU "${product.sku}" already exists`,
          );
          continue;
        }

        const searchText = computeProductSearchText(product);
        await ctx.db.insert("products", {
          ...product,
          searchText,
          created_at: now,
          updated_at: now,
        });
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(
          `"${product.name}": ${error.message ?? "Unknown error"}`,
        );
      }
    }

    return results;
  },
});

// ── Attach uploaded image(s) to a product ───────────────────────
// storage_ids is ordered: the first entry becomes the product's primary
// image (moved to the front of the images array); the rest are appended.
export const addProductImages = mutation({
  args: {
    product_id: v.id("products"),
    storage_ids: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    if (args.storage_ids.length === 0) return;
    const product = await ctx.db.get(args.product_id);
    if (!product) throw new Error("Product not found");
    const existing = product.images ?? [];
    const [primary, ...rest] = args.storage_ids;
    await ctx.db.patch(args.product_id, {
      images: [primary, ...existing, ...rest],
      updated_at: Date.now(),
    });
  },
});

/** Lightweight search for autocomplete (returns minimal fields). */
export const searchProductsAutocomplete = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const term = args.search.trim();
    if (!term) return [];

    const limit = Math.min(args.limit ?? 10, 50);

    const results = await ctx.db
      .query("products")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", term).eq("status", "Active"),
      )
      .take(limit);

    // Enrich with first image URL
    const enriched = await Promise.all(
      results.map(async (product) => {
        let imageUrl: string | null = null;
        if (product.images && product.images.length > 0) {
          imageUrl = await ctx.storage.getUrl(product.images[0]);
        }
        return {
          _id: product._id,
          name: product.name,
          price: product.price,
          imageUrl,
          is_clearance: false,
        };
      }),
    );

    return enriched;
  },
});
