import { query, mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { assertSuperAdmin } from "../auth.helpers";
import type { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * The key `vendors.ts` reads to cap a vendor's `service_radius`, and the
 * settings page reads/writes to display and change it.
 *
 * Centralised here rather than as a string literal at each call site — the
 * warning-dialog flow depends on the settings page and `vendors.ts` agreeing on
 * exactly the same key, and a typo in one of the three would silently decouple
 * the limit from its enforcement.
 */
export const VENDOR_SERVICE_RADIUS_LIMIT_KEY = "vendor_service_radius_limit_m";

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

/**
 * Write access to every platform setting — the payout-day gate, delivery fees,
 * legal document versions, and now the vendor radius limit. Had NO auth check
 * at all until this pass; the migration plan's own Phase B1 audit named
 * `platformSettings.upsert` specifically as one of the endpoints an
 * unauthenticated caller could hit. There is no `Permission` for it to check —
 * "settings" is deliberately not a module in the permission vocabulary (see
 * `apps/admin/lib/navigation.ts`'s `ADMIN_ONLY_LINKS` comment) — so it is gated
 * on holding the wildcard outright via `assertSuperAdmin`.
 */
export const upsert = mutation({
  args: {
    key: v.string(),
    value: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertSuperAdmin(ctx);

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
      {
        key: VENDOR_SERVICE_RADIUS_LIMIT_KEY,
        value: "15000",
        description:
          "Maximum service radius a vendor may be given, in metres. Enforced when a vendor is created or edited; existing vendors already past the limit are left as they are rather than force-changed.",
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

/**
 * The default a fresh deployment gets before `seed` has run, or if the row is
 * ever deleted by hand. Exported so `vendors.ts` uses the exact same fallback
 * rather than a second hardcoded 15000 that could drift from this one.
 */
export const DEFAULT_VENDOR_SERVICE_RADIUS_LIMIT_M = 15000;

/**
 * The current vendor service-radius limit, in metres.
 *
 * Unguarded like `getDeliveryFees` below it: a number with no PII, read by
 * anyone who can reach the vendor form, not only super admins — a hub manager
 * editing their own vendor needs to know the ceiling their input is validated
 * against just as much as a super admin does.
 */
export const getVendorServiceRadiusLimit = query({
  args: {},
  handler: async (ctx) => readVendorServiceRadiusLimit(ctx),
});

/**
 * The plain (non-Convex-function) version, so `vendors.ts` reads the exact
 * same value inside its own mutations rather than round-tripping through a
 * separate query call — a mutation can read `ctx.db` directly, and doing so
 * keeps the read inside the same transaction as the write it is validating.
 */
export async function readVendorServiceRadiusLimit(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  const setting = await ctx.db
    .query("platform_settings")
    .withIndex("by_key", (q) => q.eq("key", VENDOR_SERVICE_RADIUS_LIMIT_KEY))
    .first();
  const parsed = setting ? Number(setting.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_VENDOR_SERVICE_RADIUS_LIMIT_M;
}

/**
 * Vendors whose CURRENT service radius exceeds a candidate limit.
 *
 * Purpose-built for the settings page's confirmation dialog: before saving a
 * lowered limit, the page calls this with the value being typed and shows
 * whatever comes back. It does not change any vendor — a vendor already past a
 * newly-lowered limit is grandfathered, not force-shrunk, so the admin sees
 * exactly what they are about to leave in a non-compliant state rather than
 * data being rewritten out from under them.
 *
 * Gated on super admin: it exists only to serve the settings page, which is
 * itself super-admin only (see `upsert` above), so there is no caller this
 * should be reachable by that `upsert` is not also reachable by.
 */
export const getVendorsExceedingRadius = query({
  args: { limitMeters: v.number() },
  handler: async (ctx, args) => {
    await assertSuperAdmin(ctx);

    if (!Number.isFinite(args.limitMeters) || args.limitMeters <= 0) {
      throw new Error("limitMeters must be a positive number");
    }

    // `vendor` not `v` — shadowing the module-level `v` validator import inside
    // this closure would still compile, but reads as if the validator is in
    // scope here.
    const vendors = await ctx.db.query("vendors").collect();
    return vendors
      .filter((vendor) => vendor.service_radius > args.limitMeters)
      .map((vendor) => ({
        _id: vendor._id,
        name: vendor.name,
        service_radius: vendor.service_radius,
      }))
      .sort((a, b) => b.service_radius - a.service_radius);
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
