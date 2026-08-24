import { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { IndustryUpdateValidator, IndustryValidator } from "../validators";

export const createIndustry = mutation({
  args: IndustryValidator,
  handler: async (ctx, args) => {
    const searchText = [args.name, args.description ?? ""].join(" ").trim();
    return await ctx.db.insert("industry", {
      ...args,
      searchText,
    });
  },
});

/** Unpaginated list — for dropdowns & filters. */
export const getAllIndustries = query({
  args: {},
  handler: async (ctx) => {
    const industries = await ctx.db.query("industry").order("asc").collect();
    return await Promise.all(
      industries.map(async (industry) => ({
        ...industry,
        imageUrl: industry.image
          ? await ctx.storage.getUrl(industry.image)
          : null,
      })),
    );
  },
});

export const getIndustries = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));

    const search = args.search?.trim();
    const status = args.status;

    const buildListQuery = () => {
      if (search && search.length > 0) {
        return ctx.db.query("industry").withSearchIndex("search_text", (q) => {
          const sq = q.search("searchText", search);
          return status ? sq.eq("status", status) : sq;
        });
      }

      if (status) {
        return ctx.db
          .query("industry")
          .withIndex("by_status", (q) => q.eq("status", status));
      }

      return ctx.db.query("industry");
    };

    const pageResult = await buildListQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const currentPageIndustries = pageResult.page;

    const total = (await buildListQuery().collect()).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const data = await Promise.all(
      currentPageIndustries.map(async (industry) => ({
        ...industry,
        imageUrl: industry.image
          ? await ctx.storage.getUrl(industry.image)
          : null,
      })),
    );

    return {
      data,
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

export const backfillIndustrySearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const industries = await ctx.db.query("industry").collect();

    let updatedCount = 0;
    for (const industry of industries) {
      const searchText = [industry.name, industry.description ?? ""]
        .join(" ")
        .trim();

      if (industry.searchText === searchText) continue;

      await ctx.db.patch(industry._id, {
        searchText,
        updated_at: new Date().toISOString(),
      });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

export const getActiveIndustries = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));

    const pageResult = await ctx.db
      .query("industry")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const currentPageIndustries = pageResult.page;
    const total = (
      await ctx.db
        .query("industry")
        .withIndex("by_status", (q) => q.eq("status", "Active"))
        .collect()
    ).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const data = await Promise.all(
      currentPageIndustries.map(async (industry) => ({
        ...industry,
        imageUrl: industry.image
          ? await ctx.storage.getUrl(industry.image)
          : null,
      })),
    );

    return {
      data,
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

export const getIndustryById = query({
  args: {
    id: v.id("industry"),
  },
  handler: async (ctx, args) => {
    const industry = await ctx.db.get(args.id);
    if (!industry) return null;
    return {
      ...industry,
      imageUrl: industry.image
        ? await ctx.storage.getUrl(industry.image)
        : null,
    };
  },
});

export const updateIndustry = mutation({
  args: {
    id: v.id("industry"),
    updates: IndustryUpdateValidator,
  },
  handler: async (ctx, args) => {
    const existingIndustry = await ctx.db.get(args.id);
    if (!existingIndustry) {
      throw new Error("Industry not found");
    }

    const nextName = args.updates.name ?? existingIndustry.name;
    const nextDescription =
      args.updates.description ?? existingIndustry.description ?? "";
    const nextSearchText = [nextName, nextDescription].join(" ").trim();

    return await ctx.db.patch(args.id, {
      ...args.updates,
      searchText: nextSearchText,
      updated_at: new Date().toISOString(),
    });
  },
});

export const deleteIndustry = mutation({
  args: {
    id: v.id("industry"),
  },
  handler: async (ctx, args) => {
    const existingIndustry = await ctx.db.get(args.id);
    if (!existingIndustry) {
      throw new Error("Industry not found");
    }

    return await ctx.db.delete(args.id);
  },
});

export const updateIndustryStatus = mutation({
  args: {
    id: v.id("industry"),
    status: v.union(v.literal("Active"), v.literal("Inactive")),
  },
  handler: async (ctx, args) => {
    const existingIndustry = await ctx.db.get(args.id);
    if (!existingIndustry) {
      throw new Error("Industry not found");
    }

    return await ctx.db.patch(args.id, {
      status: args.status,
      updated_at: new Date().toISOString(),
    });
  },
});
