import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

import { agentTransactionTypes } from "../validators";
import { getAuthUser } from "../auth.helpers";
import { readLegalVersions } from "./platform_settings";

/**
 * Record that the caller accepted the current legal documents.
 *
 * ── The versions are the server's, not the client's ──────────────────────
 *
 * This mutation used to take `terms_version`, `privacy_version` and
 * `eula_version` as arguments and store them verbatim. Both call sites in the
 * customer app passed the literal string v1.0, so every acceptance row on the
 * platform claims v1.0 whatever the setting says — and once a version is bumped
 * to force re-acceptance, `checkNeedsReacceptance` compares the new required
 * version against a fabricated one and either nags forever or, if a client sends
 * the new string without showing the new document, silently records agreement to
 * something nobody read.
 *
 * An acceptance record is evidence. Evidence the client authors is not evidence,
 * so the versions are read here, in the same transaction as the insert.
 *
 * The arguments are removed rather than accepted-and-ignored: an ignored
 * argument reads as a bug and invites someone to "fix" it by honouring it again.
 */
export const recordAcceptance = mutation({
  args: {
    transaction_type: v.optional(
      v.union(...agentTransactionTypes.map((e) => v.literal(e))),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const versions = await readLegalVersions(ctx);

    await ctx.db.insert("legal_acceptances", {
      user_id: user._id,
      accepted_at: Date.now(),
      terms_version: versions.terms_version,
      privacy_version: versions.privacy_version,
      eula_version: versions.eula_version,
      transaction_type: args.transaction_type,
    });

    return versions;
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

    // Read through the shared helper, so this check and the acceptance it gates
    // cannot disagree about what the current versions are.
    const required = await readLegalVersions(ctx);

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

    const requiredVersions = {
      terms_version: required.terms_version,
      privacy_version: required.privacy_version,
    };

    if (!latest) return { needsReacceptance: true, requiredVersions };

    return {
      needsReacceptance:
        latest.terms_version !== required.terms_version ||
        latest.privacy_version !== required.privacy_version,
      requiredVersions,
    };
  },
});
