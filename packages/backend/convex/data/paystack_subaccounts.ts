import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  paystackSubaccountKeys,
} from "../validators";

export const getByKey = query({
  args: { key: v.union(...paystackSubaccountKeys.map((e) => v.literal(e))) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("paystackSubaccounts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    key: v.union(...paystackSubaccountKeys.map((e) => v.literal(e))),
    business_name: v.string(),
    bank_code: v.string(),
    account_number: v.string(),
    subaccount_code: v.string(),
    raw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("paystackSubaccounts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        business_name: args.business_name,
        bank_code: args.bank_code,
        account_number: args.account_number,
        subaccount_code: args.subaccount_code,
        raw: args.raw,
        updated_at: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("paystackSubaccounts", {
      ...args,
      created_at: now,
      updated_at: now,
    });
  },
});
