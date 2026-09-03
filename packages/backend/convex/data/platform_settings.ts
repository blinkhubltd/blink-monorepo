import { query, mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { assertSuperAdmin } from "../auth.helpers";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  DEFAULT_DELIVERY_FEE_KES,
  DEFAULT_EXTRA_VENDOR_FEE_KES,
  DEFAULT_FREE_DELIVERY_THRESHOLD_KES,
  resolveFeeSetting,
  resolveNumericSetting,
  type DeliveryPricingSettings,
} from "../lib/delivery_fee";

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

/**
 * Keys the delivery pricing reads. Same reasoning as the radius key above: the
 * settings page, the seeder and the enforcement must agree on one string, and a
 * typo in any of the three decouples the setting from what it controls.
 *
 * A guard test asserts each literal appears in exactly those three places.
 */
export const DELIVERY_FEE_KEY = "delivery_fee";
export const CLEARANCE_DELIVERY_FEE_KEY = "clearance_delivery_fee";
export const EXTRA_VENDOR_FEE_KEY = "clearance_extra_vendor_fee";
export const FREE_DELIVERY_THRESHOLD_KEY = "free_delivery_threshold";

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
        key: DELIVERY_FEE_KEY,
        value: "200",
        description: "Delivery fee for normal products in KES",
      },
      {
        key: CLEARANCE_DELIVERY_FEE_KEY,
        value: "150",
        description: "Delivery fee for clearance products in KES",
      },
      {
        key: EXTRA_VENDOR_FEE_KEY,
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
        key: FREE_DELIVERY_THRESHOLD_KEY,
        value: String(DEFAULT_FREE_DELIVERY_THRESHOLD_KES),
        description:
          "Basket subtotal at or above which the base delivery fee is waived, in KES. Applies to the BASKET, not per shop, and waives one base fee only — extra-shop pickup fees are still charged. Does not apply to clearance baskets.",
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

export const TERMS_VERSION_KEY = "terms_version";
export const PRIVACY_VERSION_KEY = "privacy_version";
export const EULA_VERSION_KEY = "eula_version";

/** The version every legal document is currently at. */
export interface LegalVersions {
  terms_version: string;
  privacy_version: string;
  eula_version: string;
}

/**
 * Legal versions, read inside the caller's own transaction.
 *
 * Exists so `legal_acceptances.recordAcceptance` can stamp an acceptance with
 * the version the platform is actually on, rather than with a version the client
 * sent. The old customer app passed the literal string `"v1.0"` from two call
 * sites, so every acceptance ever recorded claimed v1.0 regardless of the
 * setting — which makes the re-acceptance check permanently wrong in one
 * direction or the other, and makes the acceptance record worthless as evidence.
 *
 * The `"v1.0"` fallback matches `getLegalSettings` so a missing row does not
 * produce two different answers depending on which function you asked.
 */
export async function readLegalVersions(
  ctx: QueryCtx | MutationCtx,
): Promise<LegalVersions> {
  const [terms, privacy, eula] = await Promise.all([
    ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", TERMS_VERSION_KEY))
      .first(),
    ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", PRIVACY_VERSION_KEY))
      .first(),
    ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", EULA_VERSION_KEY))
      .first(),
  ]);
  return {
    terms_version: terms?.value ?? "v1.0",
    privacy_version: privacy?.value ?? "v1.0",
    eula_version: eula?.value ?? "v1.0",
  };
}

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

/**
 * Delivery pricing, read once for both the quote and the charge.
 *
 * The plain-function half of the pair (same shape as
 * `readVendorServiceRadiusLimit` above), so a mutation reads these inside its
 * own transaction rather than round-tripping through a query — which is what
 * lets the price a customer is quoted and the price an order is written with
 * come from one read.
 *
 * A value that falls back is logged HERE rather than inside `lib/delivery_fee`,
 * which stays ctx-free and silent. Absence is an ops condition worth seeing in
 * the logs: it means the settings row is missing on this deployment.
 */
export async function readDeliveryPricing(
  ctx: QueryCtx | MutationCtx,
): Promise<DeliveryPricingSettings> {
  const [baseRow, extraRow, thresholdRow] = await Promise.all([
    ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", DELIVERY_FEE_KEY))
      .first(),
    ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", EXTRA_VENDOR_FEE_KEY))
      .first(),
    ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", FREE_DELIVERY_THRESHOLD_KEY))
      .first(),
  ]);

  const base = resolveFeeSetting(baseRow?.value, DEFAULT_DELIVERY_FEE_KES);
  const extra = resolveFeeSetting(extraRow?.value, DEFAULT_EXTRA_VENDOR_FEE_KES);
  const threshold = resolveNumericSetting(
    thresholdRow?.value,
    DEFAULT_FREE_DELIVERY_THRESHOLD_KES,
  );

  for (const [key, resolved] of [
    [DELIVERY_FEE_KEY, base],
    [EXTRA_VENDOR_FEE_KEY, extra],
    [FREE_DELIVERY_THRESHOLD_KEY, threshold],
  ] as const) {
    if (resolved.resolution === "fallback") {
      console.error(
        `[delivery_pricing] setting "${key}" missing or unusable; using ${resolved.value}. Run platformSettings.seedDefaults.`,
      );
    }
  }

  return {
    baseFee: base.value,
    extraVendorFee: extra.value,
    freeThreshold: threshold.value,
  };
}

/** Query wrapper, for screens that display the pricing rules. */
export const getDeliveryPricing = query({
  args: {},
  handler: async (ctx) => readDeliveryPricing(ctx),
});

/**
 * Clearance delivery settings. Separate because clearance keeps its own base
 * fee AND is deliberately excluded from the free-delivery threshold.
 */
export async function readClearanceDeliveryPricing(
  ctx: QueryCtx | MutationCtx,
): Promise<{ baseFee: number; extraVendorFee: number }> {
  const [baseRow, extraRow] = await Promise.all([
    ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", CLEARANCE_DELIVERY_FEE_KEY))
      .first(),
    ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", EXTRA_VENDOR_FEE_KEY))
      .first(),
  ]);

  return {
    baseFee: resolveFeeSetting(baseRow?.value, 150).value,
    extraVendorFee: resolveFeeSetting(extraRow?.value, DEFAULT_EXTRA_VENDOR_FEE_KES)
      .value,
  };
}

/**
 * @deprecated Returns the raw fee numbers with no threshold logic, which is how
 * the old checkout charged a flat fee and never honoured free delivery. Use
 * `readDeliveryPricing` / `getDeliveryPricing` and `lib/delivery_fee` instead,
 * so the quote and the charge come from one calculation.
 *
 * Retained only until the remaining callers move over.
 */
export const getDeliveryFees = query({
  args: {},
  handler: async (ctx) => {
    const [normal, clearance] = await Promise.all([
      readDeliveryPricing(ctx),
      readClearanceDeliveryPricing(ctx),
    ]);
    return {
      delivery_fee: normal.baseFee,
      clearance_delivery_fee: clearance.baseFee,
      clearance_extra_vendor_fee: normal.extraVendorFee,
      // Exposed so a caller that has not migrated can at least see the rule
      // exists rather than silently charging a flat fee.
      free_delivery_threshold: normal.freeThreshold,
    };
  },
});
