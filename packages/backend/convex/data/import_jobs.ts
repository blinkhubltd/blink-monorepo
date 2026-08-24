import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ── Public: create a pending job and return its id ─────────────
export const createImportJob = mutation({
  args: { file_storage_id: v.id("_storage"), vendor_id: v.id("vendors") },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("import_jobs", {
      type: "products",
      status: "pending",
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      errors: [],
      file_storage_id: args.file_storage_id,
      vendor_id: args.vendor_id,
      created_at: now,
      updated_at: now,
    });
  },
});

// ── Public: reactive query for job progress ────────────────────
export const getImportJob = query({
  args: { id: v.id("import_jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ── Public: recent jobs (last 10) ─────────────────────────────
export const getRecentImportJobs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("import_jobs")
      .withIndex("by_created_at")
      .order("desc")
      .take(10);
  },
});

// ── Internal: update progress after each batch ─────────────────
export const updateJobProgress = internalMutation({
  args: {
    id: v.id("import_jobs"),
    processed: v.number(),
    success: v.number(),
    failed: v.number(),
    errors: v.array(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("done"),
        v.literal("failed"),
      ),
    ),
    total: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = {
      processed: args.processed,
      success: args.success,
      failed: args.failed,
      errors: args.errors,
      updated_at: Date.now(),
    };
    if (args.status) patch.status = args.status;
    if (args.total !== undefined) patch.total = args.total;
    await ctx.db.patch(args.id, patch);
  },
});

// ── Internal queries used by the action ───────────────────────
export const getJobForAction = internalQuery({
  args: { id: v.id("import_jobs") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const getAllCategoriesForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("categories").collect();
  },
});

// The processProductImportJob action lives in importJobsAction.ts
