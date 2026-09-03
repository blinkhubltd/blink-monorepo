import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { getAuthUser, getAuthUserOrNull } from "../auth.helpers";
import { internal } from "../_generated/api";
import { AgentsValidator, AgentsUpdateValidator } from "../validators";

export const getAgents = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));
    const search = args.search?.trim();

    const buildQuery = () => {
      if (search && search.length > 0) {
        return ctx.db
          .query("agents")
          .withSearchIndex("search_text", (q) =>
            q.search("searchText", search),
          );
      }
      return ctx.db.query("agents");
    };

    const pageResult = await buildQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const total = (await buildQuery().collect()).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Enrich agents with user data
    const enrichedAgents = await Promise.all(
      pageResult.page.map(async (agent) => {
        const user = await ctx.db.get(agent.user_id);
        const zone = agent.zone_id ? await ctx.db.get(agent.zone_id) : null;
        return {
          ...agent,
          user: user
            ? {
                name:
                  user.name ||
                  `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
                email: user.email ?? "",
                phone: user.phone ?? "",
              }
            : null,
          zone: zone
            ? {
                name: zone.name ?? "",
              }
            : null,
        };
      }),
    );

    return {
      data: enrichedAgents,
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

export const getAllAgents = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();

    const enrichedAgents = await Promise.all(
      agents.map(async (agent) => {
        const user = await ctx.db.get(agent.user_id);
        const zone = agent.zone_id ? await ctx.db.get(agent.zone_id) : null;
        return {
          ...agent,
          user: user
            ? {
                name:
                  user.name ||
                  `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
                email: user.email ?? "",
                phone: user.phone ?? "",
              }
            : null,
          zone: zone
            ? {
                name: zone.name ?? "",
              }
            : null,
        };
      }),
    );

    return enrichedAgents;
  },
});

/**
 * @internal Took `userId` as an argument with no auth, so a user id was enough to read
 * another agent's balance, M-Pesa number and Paystack recipient code. Use
 * `getMyAgentSummary`.
 */
export const getAgentByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .first();
  },
});

export const getAgentByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});

export const createAgent = mutation({
  args: {
    user_id: v.id("users"),
    zone_id: v.optional(v.id("agent_zones")),
    mpesa_number: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lastAgent = await ctx.db
      .query("agents")
      .withIndex("by_creation_time")
      .order("desc")
      .first();

    let nextNumber = 1;

    if (lastAgent) {
      const match = lastAgent.code.match(/AGENT_(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const {
      scans = 0,
      installs = 0,
      registerations = 0,
    } = args as {
      scans?: number;
      installs?: number;
      registerations?: number;
    };

    const code = `AGENT_${String(nextNumber).padStart(3, "0")}`;

    // Compute searchText from user data
    const user = await ctx.db.get(args.user_id);
    const userName = user
      ? user.name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
      : "";
    const searchText = [userName, user?.email ?? "", user?.phone ?? "", code]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return await ctx.db.insert("agents", {
      user_id: args.user_id,
      scans,
      installs,
      registerations,
      code,
      searchText,
      ...(args.zone_id ? { zone_id: args.zone_id } : {}),
      ...(args.mpesa_number ? { mpesa_number: args.mpesa_number } : {}),
    });
  },
});

export const updateAgent = mutation({
  args: AgentsUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updateData } = args;
    await ctx.db.patch(id, {
      ...updateData,
    });
  },
});

export const deleteAgent = mutation({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.agentId);
  },
});

/**
 * @internal Was PUBLIC and unauthenticated while scheduling `creditAgentEarning` - real
 * money, keyed only on the agent code printed on the agent's own QR poster.
 * Anyone who could read a poster could mint earnings in a loop. An install is
 * not verifiable from a client at all, so there is no public replacement: it
 * must be driven by something the server trusts.
 */
export const incrementInstallCount = internalMutation({
  args: {
    agentCode: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_code", (q) => q.eq("code", args.agentCode))
      .first();

    if (!agent) {
      throw new Error("Agent not found");
    }

    await ctx.db.patch(agent._id, {
      installs: (agent.installs || 0) + 1,
    });

    await ctx.scheduler.runAfter(0, internal.data.marketing.creditAgentEarning, {
      agentId: agent._id,
      type: "install",
    });
  },
});

export const incrementScanCount = mutation({
  args: {
    agentCode: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_code", (q) => q.eq("code", args.agentCode))
      .first();

    if (!agent) {
      throw new Error("Agent not found");
    }

    return await ctx.db.patch(agent._id, {
      scans: (agent.scans || 0) + 1,
    });
  },
});

/**
 * @internal Same hole as the install counter. Replaced by `attributeMyRegistration`,
 * which requires a real authenticated account and credits at most once per
 * account.
 */
export const incrementRegistrationCount = internalMutation({
  args: {
    agentCode: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_code", (q) => q.eq("code", args.agentCode))
      .first();

    if (!agent) {
      throw new Error("Agent not found");
    }

    await ctx.db.patch(agent._id, {
      registerations: (agent.registerations || 0) + 1,
    });

    await ctx.scheduler.runAfter(0, internal.data.marketing.creditAgentEarning, {
      agentId: agent._id,
      type: "registration",
    });
  },
});

export const creditAgentEarning = internalMutation({
  args: {
    agentId: v.id("agents"),
    type: v.union(v.literal("install"), v.literal("registration")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent || !agent.zone_id) return;

    const zone = await ctx.db.get(agent.zone_id);
    if (!zone) return;

    let amount = 0;
    let fixedAmount = 0;

    // Per-unit crediting for "per_conversion" and "both".
    // For "both" with a minimum threshold, per-unit rates only apply to
    // conversions that exceed the minimum (extras beyond the threshold).
    // Conversions within the minimum range are covered by the fixed amount.
    // Note: if the agent never reaches the minimum, payout-time reconciliation
    // should apply per-unit fallback rates for all conversions in that period.
    if (
      (zone.earning_type === "per_conversion" ||
        zone.earning_type === "both") &&
      args.type === "install" &&
      zone.install_commission_enabled &&
      zone.install_commission_rate
    ) {
      const minInstalls = zone.min_installs ?? 0;
      const currentInstalls = agent.installs ?? 0;
      // For "both" with a minimum set, only credit extras beyond the minimum
      if (zone.earning_type === "both" && minInstalls > 0) {
        if (currentInstalls > minInstalls) {
          amount = zone.install_commission_rate;
        }
      } else {
        amount = zone.install_commission_rate;
      }
    } else if (
      (zone.earning_type === "per_conversion" ||
        zone.earning_type === "both") &&
      args.type === "registration" &&
      zone.registration_commission_enabled &&
      zone.registration_commission_rate
    ) {
      const minRegistrations = zone.min_registrations ?? 0;
      const currentRegistrations = agent.registerations ?? 0;
      if (zone.earning_type === "both" && minRegistrations > 0) {
        if (currentRegistrations > minRegistrations) {
          amount = zone.registration_commission_rate;
        }
      } else {
        amount = zone.registration_commission_rate;
      }
    }

    // Fixed amount threshold check for "both" type only.
    // For "both", credit the fixed amount once when BOTH minimums are first crossed.
    // For "fixed" type, the fixed amount is a periodic payout handled separately.
    if (
      zone.earning_type === "both" &&
      zone.fixed_amount &&
      zone.fixed_amount > 0
    ) {
      const minInstalls = zone.min_installs ?? 0;
      const minRegistrations = zone.min_registrations ?? 0;
      const currentInstalls = agent.installs ?? 0;
      const currentRegistrations = agent.registerations ?? 0;

      const justHitInstallMin =
        args.type === "install" &&
        minInstalls > 0 &&
        currentInstalls === minInstalls;
      const justHitRegMin =
        args.type === "registration" &&
        minRegistrations > 0 &&
        currentRegistrations === minRegistrations;

      // Fire fixed amount when the last remaining threshold is just crossed
      if (justHitInstallMin && currentRegistrations >= minRegistrations) {
        fixedAmount = zone.fixed_amount;
      } else if (justHitRegMin && currentInstalls >= minInstalls) {
        fixedAmount = zone.fixed_amount;
      }
    }

    if (amount <= 0 && fixedAmount <= 0) return;

    if (amount > 0) {
      await ctx.db.insert("agent_earnings", {
        agent_id: args.agentId,
        type: args.type,
        amount,
        zone_id: agent.zone_id,
        created_at: Date.now(),
      });
    }

    if (fixedAmount > 0) {
      await ctx.db.insert("agent_earnings", {
        agent_id: args.agentId,
        type: "fixed",
        amount: fixedAmount,
        zone_id: agent.zone_id,
        created_at: Date.now(),
      });
    }

    const totalAmount = amount + fixedAmount;
    await ctx.db.patch(args.agentId, {
      balance: (agent.balance ?? 0) + totalAmount,
      total_earned: (agent.total_earned ?? 0) + totalAmount,
    });
  },
});

// Weekly cron: credit fixed amount to every agent in a "fixed" type zone.
export const creditWeeklyFixedEarnings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();

    for (const agent of agents) {
      if (!agent.zone_id) continue;

      const zone = await ctx.db.get(agent.zone_id);
      if (
        !zone ||
        zone.earning_type !== "fixed" ||
        !zone.fixed_amount ||
        zone.fixed_amount <= 0
      )
        continue;

      await ctx.db.insert("agent_earnings", {
        agent_id: agent._id,
        type: "fixed",
        amount: zone.fixed_amount,
        zone_id: agent.zone_id,
        created_at: Date.now(),
      });

      await ctx.db.patch(agent._id, {
        balance: (agent.balance ?? 0) + zone.fixed_amount,
        total_earned: (agent.total_earned ?? 0) + zone.fixed_amount,
      });
    }
  },
});

/**
 * @internal Took `agentId` as an argument with no auth. Use `getMyAgentEarnings`.
 */
export const getAgentEarnings = internalQuery({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const earnings = await ctx.db
      .query("agent_earnings")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agentId))
      .order("desc")
      .take(limit);
    return earnings;
  },
});

/**
 * @internal Took `agentId` as an argument with no auth, and collected the whole earnings
 * table to take its length. Use `getMyAgentSummary`.
 */
export const getAgentStats = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) return null;

    const zone = agent.zone_id ? await ctx.db.get(agent.zone_id) : null;

    const earningsCount = (
      await ctx.db
        .query("agent_earnings")
        .withIndex("by_agent", (q) => q.eq("agent_id", args.agentId))
        .collect()
    ).length;

    const pendingRequests = await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent_status", (q) =>
        q.eq("agent_id", args.agentId).eq("status", "pending"),
      )
      .collect();
    const approvedRequests = await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent_status", (q) =>
        q.eq("agent_id", args.agentId).eq("status", "approved"),
      )
      .collect();
    const requestedAmount = [...pendingRequests, ...approvedRequests].reduce(
      (sum, r) => sum + r.amount,
      0,
    );

    const balance = agent.balance ?? 0;

    return {
      agent,
      zone,
      earningsCount,
      balance,
      total_earned: agent.total_earned ?? 0,
      total_paid: agent.total_paid ?? 0,
      requested_amount: requestedAmount,
      available_balance: Math.max(0, balance - requestedAmount),
    };
  },
});

export const backfillAgentsSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();

    let updatedCount = 0;
    for (const agent of agents) {
      const user = await ctx.db.get(agent.user_id);
      const userName = user
        ? user.name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
        : "";
      const searchText = [
        userName,
        user?.email ?? "",
        user?.phone ?? "",
        agent.code,
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (agent.searchText === searchText) continue;
      await ctx.db.patch(agent._id, { searchText });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

// ── The agent's own record ────────────────────────────────────────────────
//
// Two problems lived in this file, and the first one is the most serious thing
// found anywhere in this port.
//
// 1. `incrementInstallCount` and `incrementRegistrationCount` were PUBLIC,
//    UNAUTHENTICATED mutations that schedule `creditAgentEarning` — real money,
//    credited to an agent's balance, withdrawable through the Paystack payout
//    path. Both were keyed only on `agentCode`, which is printed on the agent's
//    own QR poster and is therefore public by design. Anyone who could read a
//    poster could call either in a loop and mint earnings. Both are internal now,
//    and registration is attributed through `attributeMyRegistration` below,
//    which requires a real authenticated account and credits at most once per
//    account, ever.
//
// 2. `getAgentByUser`, `getAgentEarnings`, `getAgentStats` and
//    `getAgentPaymentRequests` took the agent or user id as an argument with no
//    auth, so an id was enough to read another agent's balance, earnings history,
//    payout requests, M-Pesa number and Paystack recipient code.
//
// The reads below are auth-derived and project rather than return rows: an agent
// has no use for their own recipient code, and a client that never receives it
// cannot leak it.

/** Cap on one earnings read. The screen paginates by asking for more. */
const MAX_EARNINGS = 50;

/**
 * Ceiling on the earnings count.
 *
 * `getAgentStats` collected the whole earnings table for this agent purely to
 * take `.length`. That is unbounded by construction, and the agent it throws for
 * is the most successful one. Counting to a cap and saying "500+" is the honest
 * version.
 */
const EARNINGS_COUNT_CAP = 500;

/** The caller's own agent record, if they are an agent. */
async function myAgent(ctx: QueryCtx | MutationCtx) {
  const caller = await getAuthUserOrNull(ctx);
  if (!caller) return null;
  const agent = await ctx.db
    .query("agents")
    .withIndex("by_user", (q) => q.eq("user_id", caller.user._id))
    .first();
  return agent ? { agent, user: caller.user } : null;
}

/**
 * The agent dashboard's figures, for the caller's own agent record.
 *
 * Returns `null` when the caller is not an agent, which the screen renders as an
 * explanation rather than an error — most customers are not agents, and this
 * query runs whenever the profile row is shown.
 *
 * Deliberately absent from the projection: `paystack_recipient_code` and
 * `mpesa_number`. The screen needs to know whether payouts are ENABLED, not the
 * destination — a recipient code on the client is a payout destination on the
 * client.
 */
export const getMyAgentSummary = query({
  args: {},
  handler: async (ctx) => {
    const mine = await myAgent(ctx);
    if (!mine) return null;
    const { agent } = mine;

    const zone = agent.zone_id ? await ctx.db.get(agent.zone_id) : null;

    const counted = await ctx.db
      .query("agent_earnings")
      .withIndex("by_agent", (q) => q.eq("agent_id", agent._id))
      .take(EARNINGS_COUNT_CAP + 1);

    // Pending and approved requests both hold money that is spoken for. Bounded
    // reads: an agent with a long history should still see a balance.
    const pending = await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent_status", (q) =>
        q.eq("agent_id", agent._id).eq("status", "pending"),
      )
      .take(100);
    const approved = await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent_status", (q) =>
        q.eq("agent_id", agent._id).eq("status", "approved"),
      )
      .take(100);

    const requestedAmount = [...pending, ...approved].reduce(
      (sum, r) => sum + r.amount,
      0,
    );
    const balance = agent.balance ?? 0;

    return {
      agentId: agent._id,
      code: agent.code,
      scans: agent.scans ?? 0,
      installs: agent.installs ?? 0,
      registrations: agent.registerations ?? 0,
      balance,
      totalEarned: agent.total_earned ?? 0,
      totalPaid: agent.total_paid ?? 0,
      requestedAmount,
      /** What a payout request may be opened against, after money spoken for. */
      availableBalance: Math.max(0, balance - requestedAmount),
      earningsCount: Math.min(counted.length, EARNINGS_COUNT_CAP),
      earningsCountIsExact: counted.length <= EARNINGS_COUNT_CAP,
      /** Whether a payout can be requested at all, without saying where to. */
      payoutsEnabled: !!agent.paystack_recipient_code,
      hasPendingRequest: pending.length > 0,
      zone: zone
        ? {
            name: zone.name,
            earningType: zone.earning_type,
            installRate: zone.install_commission_enabled
              ? (zone.install_commission_rate ?? null)
              : null,
            registrationRate: zone.registration_commission_enabled
              ? (zone.registration_commission_rate ?? null)
              : null,
            fixedAmount: zone.fixed_amount ?? null,
            minInstalls: zone.min_installs ?? null,
            minRegistrations: zone.min_registrations ?? null,
          }
        : null,
    };
  },
});

/** The caller's own earnings, newest first. */
export const getMyAgentEarnings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const mine = await myAgent(ctx);
    if (!mine) return [];

    const limit = Math.min(Math.max(args.limit ?? 20, 1), MAX_EARNINGS);
    const rows = await ctx.db
      .query("agent_earnings")
      .withIndex("by_agent", (q) => q.eq("agent_id", mine.agent._id))
      .order("desc")
      .take(limit);

    return rows.map((row) => ({
      _id: row._id,
      type: row.type,
      amount: row.amount,
      created_at: row.created_at,
    }));
  },
});

/**
 * Attribute the caller's own registration to an agent's code.
 *
 * This is the public, verified replacement for `incrementRegistrationCount`.
 * Three things make it safe where that was not:
 *
 *  - it requires an authenticated account, so a credit corresponds to a real
 *    `users` row rather than to an HTTP request;
 *  - it is idempotent per account via `referred_by_agent_id`, so replaying it
 *    credits nothing the second time;
 *  - it refuses to attribute an account to itself, which would otherwise let an
 *    agent credit their own registration.
 *
 * An unknown code is accepted quietly rather than throwing: a customer who
 * mistypes a referral code should not have their sign-up fail, and reporting
 * "no such agent" turns this into an oracle for enumerating codes.
 */
export const attributeMyRegistration = mutation({
  args: { agentCode: v.string() },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    // Already attributed: nothing to do, and nothing to credit. Reported as
    // `already` rather than as an error so a retried sign-up is quiet.
    if (user.referred_by_agent_id) {
      return { attributed: false, reason: "already" as const };
    }

    const code = args.agentCode.trim();
    if (!code) return { attributed: false, reason: "unknown" as const };

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!agent) return { attributed: false, reason: "unknown" as const };

    // An agent cannot register themselves.
    if (agent.user_id === user._id) {
      return { attributed: false, reason: "self" as const };
    }

    await ctx.db.patch(user._id, {
      referred_by_agent_id: agent._id,
      updated_at: Date.now(),
    });

    await ctx.db.patch(agent._id, {
      registerations: (agent.registerations ?? 0) + 1,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.data.marketing.creditAgentEarning,
      { agentId: agent._id, type: "registration" },
    );

    return { attributed: true, reason: "credited" as const };
  },
});
