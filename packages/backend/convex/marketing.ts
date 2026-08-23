import { v } from "convex/values";
import { mutation, query, internalMutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { AgentsValidator, AgentsUpdateValidator } from "./validators";

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

export const getAgentByUser = query({
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

export const incrementInstallCount = mutation({
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

    await ctx.scheduler.runAfter(0, internal.marketing.creditAgentEarning, {
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

export const incrementRegistrationCount = mutation({
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

    await ctx.scheduler.runAfter(0, internal.marketing.creditAgentEarning, {
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

export const getAgentEarnings = query({
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

export const getAgentStats = query({
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
