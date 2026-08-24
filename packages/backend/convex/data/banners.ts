import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  BannersUpdateValidator,
  BannersValidator,
  lowercaseRecordStatus,
} from "../validators";

const TYPE_LIMITS: Record<string, number> = {
  product: 8,
  brand: 8,
  general: 8,
  blink: 3,
};

function classifyBanner(banner: {
  promo_type?: string | null;
}): keyof typeof TYPE_LIMITS {
  if (banner.promo_type === "product") return "product";
  if (banner.promo_type === "brand") return "brand";
  if (banner.promo_type === "blink") return "blink";
  return "general"; // undefined promo_type
}

function isLive(banner: any, now: number) {
  return (
    banner.status === "active" &&
    banner.start_date <= now &&
    banner.end_date >= now
  );
}

async function getLiveCounts(ctx: any, now: number) {
  const active = await ctx.db
    .query("banners")
    .withIndex("by_status", (q: any) => q.eq("status", "active"))
    .collect();
  const live = active.filter((b: any) => isLive(b, now));
  const counts: Record<string, number> = {
    product: 0,
    brand: 0,
    general: 0,
    blink: 0,
  };
  for (const b of live) {
    const t = classifyBanner(b);
    counts[t]++;
  }
  return counts;
}

export const createBanner = mutation({
  args: BannersValidator,
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.end_date <= args.start_date) {
      throw new ConvexError("End date must be after start date");
    }

    if (args.start_date < now - 60000) {
      throw new ConvexError("Start date cannot be in the past");
    }

    if (args.promo_type === "product" && !args.product_id) {
      throw new ConvexError(
        "Product ID is required when promo type is product",
      );
    }
    if (args.promo_type === "brand" && !args.brand) {
      throw new ConvexError("Brand name is required when promo type is brand");
    }
    if (args.promo_type === "product" && args.brand) {
      throw new ConvexError(
        "Only product ID should be set when promo type is product",
      );
    }
    if (args.promo_type === "brand" && args.product_id) {
      throw new ConvexError(
        "Only brand should be set when promo type is brand",
      );
    }

    if (args.categoryId) {
      const category = await ctx.db.get(args.categoryId);
      if (!category) {
        throw new ConvexError("Selected category does not exist");
      }
      if (category.parent_category_id) {
        throw new ConvexError(
          "Only first-level categories are allowed for banners",
        );
      }
    }

    // Enforce live banner type limits if this banner will be live immediately
    const prospectiveType = classifyBanner(args);
    const willBeLive =
      args.status === "active" &&
      args.start_date <= now &&
      args.end_date >= now;
    if (willBeLive) {
      const counts = await getLiveCounts(ctx, now);
      const limit = TYPE_LIMITS[prospectiveType];
      if (counts[prospectiveType] >= limit) {
        throw new ConvexError(
          `Maximum live ${prospectiveType} banners (${limit}) reached`,
        );
      }
    }

    return await ctx.db.insert("banners", {
      ...args,
      created_at: now,
      updated_at: now,
    });
  },
});

export const updateBanner = mutation({
  args: BannersUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    // Get the existing banner
    const existingBanner = await ctx.db.get(id);
    if (!existingBanner) {
      throw new Error("Banner not found");
    }

    // Validate dates if they are being updated
    const startDate = updates.start_date ?? existingBanner.start_date;
    const endDate = updates.end_date ?? existingBanner.end_date;

    if (endDate <= startDate) {
      throw new ConvexError("End date must be after start date");
    }

    // Validate that category is first-level only (no parent) if being updated
    if (updates.categoryId) {
      const category = await ctx.db.get(updates.categoryId);
      if (!category) {
        throw new ConvexError("Selected category does not exist");
      }
      if (category.parent_category_id) {
        throw new ConvexError(
          "Only first-level categories are allowed for banners",
        );
      }
    }

    // Determine prospective state for limit checking
    const prospective = { ...existingBanner, ...updates } as any;
    const prospectiveType = classifyBanner(prospective);
    const willBeLive = isLive(prospective, now);
    const wasLive = isLive(existingBanner, now);
    // Enforce only if it transitions into live OR changes type while live
    if (
      willBeLive &&
      (!wasLive || classifyBanner(existingBanner) !== prospectiveType)
    ) {
      const counts = await getLiveCounts(ctx, now);
      // If we were live before under a different type, decrement its old type for the check
      if (wasLive) {
        const oldType = classifyBanner(existingBanner);
        counts[oldType] = Math.max(0, counts[oldType] - 1);
      }
      const limit = TYPE_LIMITS[prospectiveType];
      if (counts[prospectiveType] >= limit) {
        throw new ConvexError(
          `Maximum live ${prospectiveType} banners (${limit}) reached`,
        );
      }
    }

    await ctx.db.patch(id, {
      ...updates,
      updated_at: now,
    });

    return id;
  },
});

// Delete a banner
export const deleteBanner = mutation({
  args: {
    id: v.id("banners"),
  },
  handler: async (ctx, args) => {
    const banner = await ctx.db.get(args.id);
    if (!banner) {
      throw new Error("Banner not found");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

// Get all banners with optional status filter
export const getBanners = query({
  args: {
    status: v.optional(v.union(...lowercaseRecordStatus.map((e) => v.literal(e)))),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      const banners = await ctx.db
        .query("banners")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "active" | "inactive"),
        )
        .order("desc")
        .collect();
      return banners;
    }

    const banners = await ctx.db.query("banners").order("desc").collect();
    return banners;
  },
});

// Get active banners that are currently in their display window
export const getActiveBanners = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const banners = await ctx.db
      .query("banners")
      .withIndex("by_status_dates", (q) => q.eq("status", "active"))
      .collect();

    // Filter banners that are currently within their display window
    const activeBanners = banners.filter(
      (banner) => banner.start_date <= now && banner.end_date >= now,
    );

    return activeBanners.sort((a, b) => b.created_at! - a.created_at!);
  },
});

export const getActiveBannersByCategory = query({
  args: {
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let banners;

    if (args.categoryId) {
      banners = await ctx.db
        .query("banners")
        .withIndex("by_category_status", (q) =>
          q.eq("categoryId", args.categoryId).eq("status", "active"),
        )
        .collect();
    } else {
      banners = await ctx.db
        .query("banners")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();

      banners = banners.filter((banner) => !banner.categoryId);
    }

    const timeLimitedBanners = banners.filter(
      (banner) => banner.start_date <= now && banner.end_date >= now,
    );

    return timeLimitedBanners.sort((a, b) => b.created_at! - a.created_at!);
  },
});

export const getBannerById = query({
  args: {
    id: v.id("banners"),
  },
  handler: async (ctx, args) => {
    const banner = await ctx.db.get(args.id);
    return banner;
  },
});

export const getBannersFiltered = query({
  args: {
    status: v.optional(v.union(...lowercaseRecordStatus.map((e) => v.literal(e)))),
    includeExpired: v.optional(v.boolean()),
    includeFuture: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let banners;

    if (args.status) {
      banners = await ctx.db
        .query("banners")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "active" | "inactive"),
        )
        .order("desc")
        .collect();
    } else {
      banners = await ctx.db.query("banners").order("desc").collect();
    }

    let filteredBanners = banners;

    if (!args.includeExpired) {
      filteredBanners = filteredBanners.filter(
        (banner) => banner.end_date >= now,
      );
    }

    if (!args.includeFuture) {
      filteredBanners = filteredBanners.filter(
        (banner) => banner.start_date <= now,
      );
    }

    return filteredBanners;
  },
});

export const getBannersByCategory = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    status: v.optional(v.union(...lowercaseRecordStatus.map((e) => v.literal(e)))),
  },
  handler: async (ctx, args) => {
    let banners;

    if (args.categoryId) {
      if (args.status) {
        banners = await ctx.db
          .query("banners")
          .withIndex("by_category_status", (q) =>
            q
              .eq("categoryId", args.categoryId)
              .eq("status", args.status as "active" | "inactive"),
          )
          .order("desc")
          .collect();
      } else {
        banners = await ctx.db
          .query("banners")
          .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
          .order("desc")
          .collect();
      }
    } else {
      const allBanners = await ctx.db.query("banners").order("desc").collect();
      banners = allBanners.filter((banner) => !banner.categoryId);

      if (args.status) {
        banners = banners.filter((banner) => banner.status === args.status);
      }
    }

    return banners;
  },
});

export const getActiveBannersForCategory = query({
  args: {
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    let banners;
    if (args.categoryId) {
      banners = await ctx.db
        .query("banners")
        .withIndex("by_category_status", (q) =>
          q.eq("categoryId", args.categoryId).eq("status", "active"),
        )
        .collect();
    } else {
      const allBanners = await ctx.db
        .query("banners")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();
      banners = allBanners.filter((banner) => !banner.categoryId);
    }

    const activeBanners = banners.filter(
      (banner) => banner.start_date <= now && banner.end_date >= now,
    );

    return activeBanners.sort((a, b) => b.created_at! - a.created_at!);
  },
});

export const getCategoryDisplayBanners = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const categoryActive = await ctx.db
      .query("banners")
      .withIndex("by_category_status", (q) =>
        q.eq("categoryId", args.categoryId).eq("status", "active"),
      )
      .collect();

    const liveCategory = categoryActive.filter((b) => isLive(b, now));
    const nonBlinkCategory = liveCategory.filter(
      (b) => classifyBanner(b) !== "blink",
    );

    let result = nonBlinkCategory
      .sort((a, b) => b.created_at! - a.created_at!)
      .slice(0, 8);
    if (result.length < 8) {
      const remainingSlots = 8 - result.length;
      // Fetch all active blink banners (status index)
      const activeBlink = await ctx.db
        .query("banners")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();
      const liveBlink = activeBlink.filter(
        (b) => isLive(b, now) && classifyBanner(b) === "blink",
      );
      // Prefer category-specific blink first
      const categoryBlink = liveBlink.filter(
        (b) => b.categoryId === args.categoryId,
      );
      const globalBlink = liveBlink.filter((b) => !b.categoryId);
      const orderedBlink = [...categoryBlink, ...globalBlink].filter(
        (b) => !result.find((r) => r._id === b._id),
      );
      result = [...result, ...orderedBlink.slice(0, remainingSlots)];
    }
    return result;
  },
});

export const getBannersByProduct = query({
  args: {
    productId: v.id("products"),
    status: v.optional(v.union(...lowercaseRecordStatus.map((e) => v.literal(e)))),
  },
  handler: async (ctx, args) => {
    let banners;

    if (args.status) {
      banners = await ctx.db
        .query("banners")
        .withIndex("by_product", (q) => q.eq("product_id", args.productId))
        .filter((q) => q.eq(q.field("status"), args.status))
        .order("desc")
        .collect();
    } else {
      banners = await ctx.db
        .query("banners")
        .withIndex("by_product", (q) => q.eq("product_id", args.productId))
        .order("desc")
        .collect();
    }

    return banners;
  },
});

export const toggleBannerStatus = mutation({
  args: {
    id: v.id("banners"),
  },
  handler: async (ctx, args) => {
    const banner = await ctx.db.get(args.id);
    if (!banner) {
      throw new Error("Banner not found");
    }

    const newStatus = banner.status === "active" ? "inactive" : "active";
    const now = Date.now();

    await ctx.db.patch(args.id, {
      status: newStatus,
      updated_at: now,
    });

    return { id: args.id, status: newStatus };
  },
});

export const getBannersByBrand = query({
  args: {
    brand: v.string(),
    status: v.optional(v.union(...lowercaseRecordStatus.map((e) => v.literal(e)))),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("banners")
      .withIndex("by_brand", (q) => q.eq("brand", args.brand));

    if (args.status) {
      const banners = await query.collect();
      return banners.filter((banner) => banner.status === args.status);
    }

    return await query.collect();
  },
});
