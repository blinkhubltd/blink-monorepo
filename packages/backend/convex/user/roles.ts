import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// ── Helpers ────────────────────────────────────────────────────
function buildSearchText(name: string, description?: string): string {
  return [name, description ?? ""].join(" ").replace(/\s+/g, " ").trim();
}

// ── Queries ────────────────────────────────────────────────────

/** Paginated + searchable list of roles. */
export const getRoles = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;

    if (args.search && args.search.trim()) {
      const results = await ctx.db
        .query("roles")
        .withSearchIndex("search_roles", (q) =>
          q.search("search_text", args.search!.trim()),
        )
        .take(limit);

      // Enrich each role with user count
      const enriched = await Promise.all(
        results.map(async (role) => {
          const usersWithRole = await ctx.db
            .query("users")
            .withIndex("by_role_id", (q) => q.eq("role_id", role._id))
            .collect();
          return { ...role, user_count: usersWithRole.length };
        }),
      );

      return { roles: enriched, nextCursor: null, hasMore: false };
    }

    const results = await ctx.db.query("roles").order("asc").collect();

    const enriched = await Promise.all(
      results.map(async (role) => {
        const usersWithRole = await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) => q.eq("role_id", role._id))
          .collect();
        return { ...role, user_count: usersWithRole.length };
      }),
    );

    return { roles: enriched, nextCursor: null, hasMore: false };
  },
});

/** Unpaginated list — useful for selects / dropdowns. */
export const getAllRoles = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("roles").order("asc").collect();
  },
});

/** Single role by ID. */
export const getRole = query({
  args: { id: v.id("roles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Fetch the default role. */
export const getDefaultRole = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_is_default", (q) => q.eq("is_default", true))
      .first();
  },
});

/** Count users currently assigned to a role. */
export const countUsersWithRole = query({
  args: { id: v.id("roles") },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_role_id", (q) => q.eq("role_id", args.id))
      .collect();
    return users.length;
  },
});

// ── Mutations ──────────────────────────────────────────────────

/** Create a new role. */
export const createRole = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    is_default: v.boolean(),
    manages_vendor: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Enforce unique name (case-insensitive)
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      throw new Error(`A role with the name "${args.name}" already exists.`);
    }

    // If this is the new default, clear the old one
    if (args.is_default) {
      const oldDefault = await ctx.db
        .query("roles")
        .withIndex("by_is_default", (q) => q.eq("is_default", true))
        .first();
      if (oldDefault) {
        await ctx.db.patch(oldDefault._id, { is_default: false });
      }
    }

    const id = await ctx.db.insert("roles", {
      name: args.name,
      description: args.description,
      permissions: args.permissions,
      is_default: args.is_default,
      manages_vendor: args.manages_vendor,
      search_text: buildSearchText(args.name, args.description),
    });

    return id;
  },
});

/** Update an existing role. */
export const updateRole = mutation({
  args: {
    id: v.id("roles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
    is_default: v.optional(v.boolean()),
    manages_vendor: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const role = await ctx.db.get(args.id);
    if (!role) throw new Error("Role not found.");

    // Enforce unique name if changing
    if (args.name && args.name !== role.name) {
      const dup = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", args.name!))
        .first();
      if (dup) {
        throw new Error(`A role with the name "${args.name}" already exists.`);
      }
    }

    // Manage default flag
    if (args.is_default === true && !role.is_default) {
      const oldDefault = await ctx.db
        .query("roles")
        .withIndex("by_is_default", (q) => q.eq("is_default", true))
        .first();
      if (oldDefault) {
        await ctx.db.patch(oldDefault._id, { is_default: false });
      }
    }

    const newName = args.name ?? role.name;
    const newDesc = args.description ?? role.description;

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.permissions !== undefined && { permissions: args.permissions }),
      ...(args.is_default !== undefined && { is_default: args.is_default }),
      ...(args.manages_vendor !== undefined && {
        manages_vendor: args.manages_vendor,
      }),
      search_text: buildSearchText(newName, newDesc),
    });

    return args.id;
  },
});

/** Delete a role. Reassigns orphaned users to the default role. */
export const deleteRole = mutation({
  args: { id: v.id("roles") },
  handler: async (ctx, args) => {
    const role = await ctx.db.get(args.id);
    if (!role) throw new Error("Role not found.");

    if (role.is_default) {
      throw new Error(
        "Cannot delete the default role. Assign a different role as default first.",
      );
    }

    // Reassign users with this role to the default role
    const usersWithRole = await ctx.db
      .query("users")
      .withIndex("by_role_id", (q) => q.eq("role_id", args.id))
      .collect();

    if (usersWithRole.length > 0) {
      const defaultRole = await ctx.db
        .query("roles")
        .withIndex("by_is_default", (q) => q.eq("is_default", true))
        .first();
      if (!defaultRole) {
        throw new Error("No default role found to reassign users.");
      }
      for (const user of usersWithRole) {
        await ctx.db.patch(user._id, { role_id: defaultRole._id });
      }
    }

    await ctx.db.delete(args.id);
  },
});
