import { api } from "../_generated/api";
import { mutation, query, action } from "../_generated/server";
import { v } from "convex/values";

export const registerPushToken = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, token, platform, deviceId } = args;

    const existing = await ctx.db
      .query("push_tokens")
      .withIndex("by_user_enabled", (q) =>
        q.eq("user_id", userId).eq("enabled", true),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        token,
        platform,
        device_id: deviceId,
        last_seen: Date.now(),
        enabled: true,
        updated_at: Date.now(),
      });
    } else {
      await ctx.db.insert("push_tokens", {
        user_id: userId,
        token,
        platform,
        device_id: deviceId,
        enabled: true,
        last_seen: Date.now(),
        updated_at: Date.now(),
      });
    }

    return {
      success: true,
      message: "Push token registered successfully",
    };
  },
});

export const deregisterPushToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const pushToken = await ctx.db
      .query("push_tokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!pushToken) {
      throw new Error("Push token not found");
    }

    await ctx.db.patch(pushToken._id, {
      enabled: false,
      updated_at: Date.now(),
    });

    return {
      success: true,
      message: "Push token deregistered successfully",
    };
  },
});

export const listUserPushTokens = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const pushTokens = await ctx.db
      .query("push_tokens")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .collect();
    return pushTokens;
  },
});

export const migratePushTokens = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.user.users.getUserById, {
      user_id: args.userId,
    });

    if (!user) {
      throw new Error("User not found");
    }

    const pushToken = user.push_token;
    if (!pushToken) {
      throw new Error("User has no push token to migrate");
    }

    const existing = await ctx.runQuery(api.data.push_tokens.listUserPushTokens, {
      userId: args.userId,
    });

    if (existing.length > 0) {
      console.log(
        `User ${args.userId} already has ${existing.length} push tokens, skipping migration`,
      );
      return { success: true, message: "No migration needed" };
    }

    await ctx.runMutation(api.data.push_tokens.registerPushToken, {
      userId: args.userId,
      token: pushToken,
      platform: "web",
      deviceId: undefined,
    });
  },
});

export const listAllEnabledTokens = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("push_tokens")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});
