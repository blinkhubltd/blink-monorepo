import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  AgentZonesValidator,
  agentZoneEarningTypes,
} from "../validators";

export const getZones = query({
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
          .query("agent_zones")
          .withSearchIndex("search_text", (q) =>
            q.search("searchText", search),
          );
      }
      return ctx.db.query("agent_zones");
    };

    const pageResult = await buildQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const total = (await buildQuery().collect()).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Enrich each zone with agent count
    const enriched = await Promise.all(
      pageResult.page.map(async (zone) => {
        const agentCount = (
          await ctx.db
            .query("agents")
            .withIndex("by_zone", (q) => q.eq("zone_id", zone._id))
            .collect()
        ).length;
        return { ...zone, agentCount };
      }),
    );

    return {
      data: enriched,
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

export const getAllZones = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agent_zones").collect();
  },
});

export const getZone = query({
  args: { id: v.id("agent_zones") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createZone = mutation({
  args: AgentZonesValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agent_zones")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      throw new ConvexError(`Zone with name "${args.name}" already exists`);
    }

    const searchText = args.name.toLowerCase();

    return await ctx.db.insert("agent_zones", {
      ...args,
      searchText,
    });
  },
});

export const updateZone = mutation({
  args: {
    id: v.id("agent_zones"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    earning_type: v.optional(
      v.union(...agentZoneEarningTypes.map((e) => v.literal(e))),
    ),
    fixed_amount: v.optional(v.number()),
    min_installs: v.optional(v.number()),
    min_registrations: v.optional(v.number()),
    install_commission_enabled: v.optional(v.boolean()),
    install_commission_rate: v.optional(v.number()),
    registration_commission_enabled: v.optional(v.boolean()),
    registration_commission_rate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;

    if (fields.name) {
      const existing = await ctx.db
        .query("agent_zones")
        .withIndex("by_name", (q) => q.eq("name", fields.name!))
        .first();
      if (existing && existing._id !== id) {
        throw new ConvexError(`Zone with name "${fields.name}" already exists`);
      }
    }

    const updatePayload: Record<string, unknown> = { ...fields };
    if (fields.name) {
      updatePayload.searchText = fields.name.toLowerCase();
    }

    await ctx.db.patch(id, updatePayload);
  },
});

export const deleteZone = mutation({
  args: { id: v.id("agent_zones") },
  handler: async (ctx, args) => {
    const assignedAgents = await ctx.db
      .query("agents")
      .withIndex("by_zone", (q) => q.eq("zone_id", args.id))
      .collect();

    if (assignedAgents.length > 0) {
      throw new ConvexError(
        `Cannot delete zone: ${assignedAgents.length} agent(s) are assigned to it. Reassign them first.`,
      );
    }

    await ctx.db.delete(args.id);
  },
});

export const countAgentsInZone = query({
  args: { id: v.id("agent_zones") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_zone", (q) => q.eq("zone_id", args.id))
      .collect();
    return agents.length;
  },
});
