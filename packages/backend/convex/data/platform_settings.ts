import { query, mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return setting ?? null;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("platform_settings").collect();
  },
});

export const upsert = mutation({
  args: {
    key: v.string(),
    value: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        description: args.description ?? existing.description,
        updated_at: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("platform_settings", {
      key: args.key,
      value: args.value,
      description: args.description,
      updated_at: Date.now(),
    });
  },
});

export const getImageUrl = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!setting?.value) return null;
    const url = await ctx.storage.getUrl(setting.value as any);
    return url ?? null;
  },
});

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const defaults = [
      {
        key: "clearance_service_radius",
        value: "5000",
        description:
          "Service radius for clearance products in meters (default 5km)",
      },
      {
        key: "clearance_expiry_buffer_days",
        value: "1",
        description: "Days before expiry to stop displaying clearance products",
      },
      {
        key: "delivery_fee",
        value: "200",
        description: "Delivery fee for normal products in KES",
      },
      {
        key: "clearance_delivery_fee",
        value: "150",
        description: "Delivery fee for clearance products in KES",
      },
      {
        key: "clearance_extra_vendor_fee",
        value: "50",
        description:
          "Extra delivery fee per additional vendor in clearance orders (KES)",
      },
      {
        key: "clearance_batch_wait_minutes",
        value: "20",
        description:
          "Minutes to wait for additional orders before dispatching a single-vendor clearance batch",
      },
      {
        key: "clearance_batch_max_orders",
        value: "5",
        description:
          "Max orders per clearance batch; triggers immediate dispatch when reached",
      },
      {
        key: "terms_version",
        value: "v1.0",
        description:
          "Current Terms & Conditions version. Bump to force re-acceptance for all users.",
      },
      {
        key: "privacy_version",
        value: "v1.0",
        description:
          "Current Privacy Policy version. Bump to force re-acceptance for all users.",
      },
      {
        key: "eula_version",
        value: "v1.0",
        description:
          "Current EULA version. Bump to notify users of updated licence terms.",
      },
      {
        key: "agent_payout_days",
        value: "friday,saturday",
        description:
          "Comma-separated days of the week when agents can create payout requests (e.g. friday,saturday)",
      },
    ];

    for (const setting of defaults) {
      const existing = await ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", setting.key))
        .first();

      if (!existing) {
        await ctx.db.insert("platform_settings", {
          ...setting,
          updated_at: Date.now(),
        });
      }
    }
  },
});

/** Returns version string and last-updated timestamp for each legal document. */
export const getLegalSettings = query({
  args: {},
  handler: async (ctx) => {
    const [terms, privacy, eula] = await Promise.all([
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "terms_version"))
        .first(),
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "privacy_version"))
        .first(),
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "eula_version"))
        .first(),
    ]);
    return {
      terms_version: terms?.value ?? "v1.0",
      terms_updated_at: terms?.updated_at ?? null,
      privacy_version: privacy?.value ?? "v1.0",
      privacy_updated_at: privacy?.updated_at ?? null,
      eula_version: eula?.value ?? "v1.0",
      eula_updated_at: eula?.updated_at ?? null,
    };
  },
});

export const getDeliveryFees = query({
  args: {},
  handler: async (ctx) => {
    const [normalFee, clearanceFee, extraVendorFee] = await Promise.all([
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "delivery_fee"))
        .first(),
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "clearance_delivery_fee"))
        .first(),
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "clearance_extra_vendor_fee"))
        .first(),
    ]);

    return {
      delivery_fee: normalFee ? parseFloat(normalFee.value) : 200,
      clearance_delivery_fee: clearanceFee
        ? parseFloat(clearanceFee.value)
        : 150,
      clearance_extra_vendor_fee: extraVendorFee
        ? parseFloat(extraVendorFee.value)
        : 50,
    };
  },
});
