import { api } from "../_generated/api";
import { mutation, query, action } from "../_generated/server";
import { v } from "convex/values";
import {
  pushPlatforms,
} from "../validators";
import { getAuthUser } from "../auth.helpers";

/**
 * Legacy registration: takes a user id, no auth check, and overwrites the user's
 * first enabled row regardless of device. Kept for existing callers.
 *
 * New code should use `registerMyPushToken`, which derives the user from the
 * caller and keys rows per device.
 */
export const registerPushToken = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(...pushPlatforms.map((e) => v.literal(e))),
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

/**
 * Registers a push token for the CALLING user, per device.
 *
 * Two things this fixes over `registerPushToken` above, which is kept because
 * other apps call it:
 *
 * 1. It takes no user id. `registerPushToken` accepts one with no auth check, so
 *    anyone who can reach the deployment can point another user's notifications
 *    at their own device — an assignment push tells you an address and a
 *    customer name.
 *
 * 2. It keys on the device. `registerPushToken` looks up the user's first
 *    enabled row and overwrites it, so a rider with a phone and a hub tablet
 *    ends up with one row: whichever registered last wins and the other device
 *    goes silent. Rows here are per `deviceId`, so every device keeps its own.
 *
 * Re-registering the same device is a patch, not an insert — Expo rotates tokens
 * and this is called on every launch.
 */
export const registerMyPushToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(...pushPlatforms.map((e) => v.literal(e))),
    /** Stable per install. Required here, unlike the legacy mutation. */
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("push_tokens")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .collect();

    // Match on device first, then on the token itself — a reinstall produces a
    // new device id with a token Expo may already have issued to this user, and
    // leaving the old row enabled would send every notification twice.
    const forDevice =
      existing.find((row) => row.device_id === args.deviceId) ??
      existing.find((row) => row.token === args.token);

    if (forDevice) {
      await ctx.db.patch(forDevice._id, {
        token: args.token,
        platform: args.platform,
        device_id: args.deviceId,
        enabled: true,
        last_seen: now,
        updated_at: now,
      });
      return { success: true, created: false };
    }

    // Any other row holding this token belongs to a different user — a shared
    // handset, or a device that changed hands. Disable it rather than leaving two
    // users pointed at one device.
    const elsewhere = await ctx.db
      .query("push_tokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .collect();
    for (const row of elsewhere) {
      if (row.user_id !== user._id && row.enabled) {
        await ctx.db.patch(row._id, { enabled: false, updated_at: now });
      }
    }

    await ctx.db.insert("push_tokens", {
      user_id: user._id,
      token: args.token,
      platform: args.platform,
      device_id: args.deviceId,
      enabled: true,
      last_seen: now,
      updated_at: now,
    });

    return { success: true, created: true };
  },
});

/**
 * Disables the calling user's token for one device, on sign-out.
 *
 * Scoped to the caller, unlike `deregisterPushToken`, which disables any token
 * given only the token string — enough to silence another rider's assignments.
 */
export const deregisterMyDevice = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const rows = await ctx.db
      .query("push_tokens")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .collect();

    let disabled = 0;
    for (const row of rows) {
      if (row.device_id === args.deviceId && row.enabled) {
        await ctx.db.patch(row._id, { enabled: false, updated_at: Date.now() });
        disabled++;
      }
    }

    return { success: true, disabled };
  },
});
