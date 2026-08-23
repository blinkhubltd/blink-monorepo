import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordAcceptance = mutation({
  args: {
    terms_version: v.string(),
    privacy_version: v.string(),
    eula_version: v.optional(v.string()),
    transaction_type: v.optional(
      v.union(v.literal("signup"), v.literal("purchase")),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User record not found");

    await ctx.db.insert("legal_acceptances", {
      user_id: user._id,
      accepted_at: Date.now(),
      terms_version: args.terms_version,
      privacy_version: args.privacy_version,
      eula_version: args.eula_version,
      transaction_type: args.transaction_type,
    });
  },
});

export const getLatestAcceptance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return null;

    return await ctx.db
      .query("legal_acceptances")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .order("desc")
      .first();
  },
});

export const checkNeedsReacceptance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { needsReacceptance: false, requiredVersions: null };

    // Fetch required versions from platform settings
    const [termsSettingRaw, privacySettingRaw] = await Promise.all([
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "terms_version"))
        .first(),
      ctx.db
        .query("platform_settings")
        .withIndex("by_key", (q) => q.eq("key", "privacy_version"))
        .first(),
    ]);

    const requiredTerms = termsSettingRaw?.value ?? "v1.0";
    const requiredPrivacy = privacySettingRaw?.value ?? "v1.0";

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return { needsReacceptance: false, requiredVersions: null };

    const latest = await ctx.db
      .query("legal_acceptances")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .order("desc")
      .first();

    if (!latest) {
      return {
        needsReacceptance: true,
        requiredVersions: {
          terms_version: requiredTerms,
          privacy_version: requiredPrivacy,
        },
      };
    }

    const needsReacceptance =
      latest.terms_version !== requiredTerms ||
      latest.privacy_version !== requiredPrivacy;

    return {
      needsReacceptance,
      requiredVersions: {
        terms_version: requiredTerms,
        privacy_version: requiredPrivacy,
      },
    };
  },
});
