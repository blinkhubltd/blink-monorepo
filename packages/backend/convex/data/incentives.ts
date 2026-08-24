import { query, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { getUserRoleName } from "../lib/roles";

// Helpers
const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfWeek = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun
  const diff = d.getDate() - day; // start Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfMonth = (date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// CONFIG
export const getIncentiveConfig = query({
  args: { role: v.union(v.literal("RIDER"), v.literal("PICKER")) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("incentive_configs")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .unique();
  },
});

export const setIncentiveConfig = mutation({
  args: {
    role: v.union(v.literal("RIDER"), v.literal("PICKER")),
    threshold_daily: v.number(),
    bonus_per_extra_daily: v.float64(),
    effective_from: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("incentive_configs")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .unique();
    const payload = {
      ...args,
      effective_from: args.effective_from || Date.now(),
      updated_at: Date.now(),
      created_at: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("incentive_configs", payload);
  },
});

// USER TARGETS
export const getUserTargets = query({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const week_start = startOfWeek();
    const month_start = startOfMonth();
    return (
      (await ctx.db
        .query("user_incentive_targets")
        .withIndex("by_user_week", (q) =>
          q.eq("user_id", args.user_id).eq("week_start", week_start),
        )
        .unique()) ||
      (await ctx.db
        .query("user_incentive_targets")
        .withIndex("by_user_month", (q) =>
          q.eq("user_id", args.user_id).eq("month_start", month_start),
        )
        .first())
    );
  },
});

export const setUserTargets = mutation({
  args: {
    user_id: v.id("users"),
    role: v.union(v.literal("RIDER"), v.literal("PICKER")),
    daily_target: v.number(),
    weekly_target: v.number(),
    monthly_target: v.number(),
  },
  handler: async (ctx, args) => {
    const week_start = startOfWeek();
    const month_start = startOfMonth();
    const existing = await ctx.db
      .query("user_incentive_targets")
      .withIndex("by_user_week", (q) =>
        q.eq("user_id", args.user_id).eq("week_start", week_start),
      )
      .unique();
    const payload = {
      ...args,
      week_start,
      month_start,
      updated_at: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("user_incentive_targets", payload);
  },
});

// DASHBOARD
export const getIncentiveDashboard = query({
  args: {
    user_id: v.id("users"),
    role: v.union(v.literal("RIDER"), v.literal("PICKER")),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const config = await ctx.db
      .query("incentive_configs")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .unique();
    const targets = await ctx.db
      .query("user_incentive_targets")
      .withIndex("by_user_week", (q) =>
        q.eq("user_id", args.user_id).eq("week_start", weekStart),
      )
      .unique();
    const baseEarnings = await ctx.db
      .query("base_earnings")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .order("desc")
      .first();

    let daily = 0,
      weekly = 0,
      monthly = 0;
    if (args.role === "RIDER") {
      const shipments = await ctx.db
        .query("shipments")
        .withIndex("by_rider", (q) => q.eq("rider_id", args.user_id))
        .collect();
      for (const s of shipments) {
        if (s.status !== "Delivered") continue;
        const t = s.updated_at || 0;
        if (t >= dayStart) daily++;
        if (t >= weekStart) weekly++;
        if (t >= monthStart) monthly++;
      }
    } else {
      // For pickers, use orders with assigned_picker_id as the primary source
      // This is more reliable than picker_activity records alone
      const pickerOrders = await ctx.db
        .query("orders")
        .withIndex("by_assigned_picker", (q) =>
          q.eq("assigned_picker_id", args.user_id),
        )
        .collect();

      // Filter orders that reached picking completion (Pickup onwards)
      const completedPickerOrders = pickerOrders.filter(
        (order) =>
          order.order_status === "Pickup" ||
          order.order_status === "Delivery" ||
          order.order_status === "Delivered",
      );

      for (const order of completedPickerOrders) {
        const t = order.updated_at || order.order_date;
        if (t >= dayStart) daily++;
        if (t >= weekStart) weekly++;
        if (t >= monthStart) monthly++;
      }
    }

    // Use 24 working days per month instead of calendar days
    const daysInMonth = 24;
    const appliedTargets = targets
      ? {
          daily: targets.daily_target,
          weekly: targets.weekly_target,
          monthly: targets.monthly_target,
        }
      : config
        ? {
            daily: config.threshold_daily,
            weekly: config.threshold_daily * 6,
            monthly: config.threshold_daily * daysInMonth,
          }
        : { daily: 0, weekly: 0, monthly: 0 };

    const pace = (
      current: number,
      target: number,
      periodTotalDays: number,
      periodElapsedDays: number,
    ) => {
      if (!target) return { requiredPerDay: 0, onTrack: true };
      const remaining = Math.max(target - current, 0);
      const remainingDays = Math.max(periodTotalDays - periodElapsedDays, 1);
      return {
        requiredPerDay: remaining / remainingDays,
        onTrack: current >= (target / periodTotalDays) * periodElapsedDays,
      };
    };
    const today = now.getDate();
    const weekDayIndex = now.getDay();
    const dailyPace = pace(daily, appliedTargets.daily, 1, 1);
    const weeklyPace = pace(
      weekly,
      appliedTargets.weekly,
      6,
      Math.min(weekDayIndex + 1, 6),
    );
    const monthlyPace = pace(
      monthly,
      appliedTargets.monthly,
      daysInMonth,
      today,
    );

    const daysElapsedInMonth = today;
    const dailyAverage =
      daysElapsedInMonth > 0 ? monthly / daysElapsedInMonth : 0;
    const projectedMonthly = dailyAverage * daysInMonth;

    const bonuses = () => {
      if (!config) return { extraTasks: 0, bonus: 0 };
      const extraMonthly = Math.max(
        monthly - config.threshold_daily * daysInMonth,
        0,
      );
      const bonus = extraMonthly * config.bonus_per_extra_daily; // treating per-extra-daily as per-task rate
      return { extraTasks: extraMonthly, bonus };
    };

    // Recommendations based on earning uplift percentages
    const recommendationPercents = [0.1, 0.2, 0.5];
    const recommendations = ((): any[] => {
      if (!config || !baseEarnings || config.bonus_per_extra_daily <= 0)
        return [];
      return recommendationPercents.map((pct) => {
        const desiredBonus = baseEarnings.monthly_base_amount * pct;
        const extraTasksNeeded = Math.ceil(
          desiredBonus / config.bonus_per_extra_daily,
        );
        const baselineMonthly = config.threshold_daily * daysInMonth;
        const targetMonthly = baselineMonthly + extraTasksNeeded;
        const targetDaily = Math.ceil(targetMonthly / daysInMonth);
        const targetWeekly = Math.ceil(targetMonthly / 4); // approximate 4-week month
        return {
          label: `+${Math.round(pct * 100)}% earnings`,
          pct,
          bonus: desiredBonus,
          extraTasksNeeded,
          targets: {
            daily: targetDaily,
            weekly: targetWeekly,
            monthly: targetMonthly,
          },
          totalProjected: baseEarnings.monthly_base_amount + desiredBonus,
        };
      });
    })();

    return {
      role: args.role,
      counts: { daily, weekly, monthly },
      targets: appliedTargets,
      pace: { daily: dailyPace, weekly: weeklyPace, monthly: monthlyPace },
      advanced: {
        dailyAverage,
        projectedMonthly,
        daysElapsedInMonth,
        daysInMonth,
      },
      config,
      baseEarnings,
      recommendations,
      bonus: bonuses(),
      generated_at: Date.now(),
    };
  },
});

// Record picker activity (for now internal use; could be called when picker completes picking)
export const logPickerActivity = mutation({
  args: {
    picker_id: v.id("users"),
    order_id: v.id("orders"),
    items_picked: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const day_bucket = startOfDay(new Date(now));
    return await ctx.db.insert("picker_activity", {
      ...args,
      day_bucket,
      created_at: now,
    });
  },
});

// Base Earnings CRUD Operations (Admin only)

// Only allow input of editable fields; timestamps are added internally
export const createBaseEarnings = mutation({
  args: {
    role: v.union(v.literal("RIDER"), v.literal("PICKER")),
    monthly_base_amount: v.float64(),
    currency: v.optional(v.string()),
    effective_from: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (!user || roleName !== "Admin") {
      throw new Error("Insufficient permissions - Admin required");
    }

    // Check if there's already an active base earnings config for this role
    const existingConfig = await ctx.db
      .query("base_earnings")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .order("desc")
      .first();

    if (existingConfig) {
      throw new ConvexError(
        `Base earnings already configured for ${args.role}. Use update instead.`,
      );
    }

    return await ctx.db.insert("base_earnings", {
      ...args,
      updated_at: Date.now(),
      created_at: Date.now(),
    });
  },
});

export const updateBaseEarnings = mutation({
  args: {
    id: v.id("base_earnings"),
    monthly_base_amount: v.float64(),
    currency: v.optional(v.string()),
    effective_from: v.number(),
  },
  handler: async (ctx, { id, ...updateData }) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (!user || roleName !== "Admin") {
      throw new Error("Insufficient permissions - Admin required");
    }

    const existingConfig = await ctx.db.get(id);
    if (!existingConfig) {
      throw new Error("Base earnings configuration not found");
    }

    return await ctx.db.patch(id, {
      ...updateData,
      updated_at: Date.now(),
    });
  },
});

export const getBaseEarnings = query({
  args: { role: v.optional(v.union(v.literal("RIDER"), v.literal("PICKER"))) },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (!user || !roleName || !["Admin", "Staff"].includes(roleName)) {
      throw new Error("Insufficient permissions - Admin or Staff required");
    }

    if (args.role) {
      const role = args.role; // TypeScript assertion
      return await ctx.db
        .query("base_earnings")
        .withIndex("by_role", (q) => q.eq("role", role))
        .order("desc")
        .collect();
    } else {
      return await ctx.db.query("base_earnings").order("desc").collect();
    }
  },
});

export const getCurrentBaseEarnings = query({
  args: { role: v.union(v.literal("RIDER"), v.literal("PICKER")) },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (
      !user ||
      !roleName ||
      !["Admin", "Staff", "Rider", "Picker"].includes(roleName)
    ) {
      throw new Error("Insufficient permissions");
    }

    // Get the most recent active base earnings for the role
    return await ctx.db
      .query("base_earnings")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .order("desc")
      .first();
  },
});

// Enhanced Incentive Configuration CRUD Operations (Admin only)

export const createIncentiveConfigNew = mutation({
  args: {
    role: v.union(v.literal("RIDER"), v.literal("PICKER")),
    threshold_daily: v.number(),
    bonus_per_extra_daily: v.float64(),
    currency: v.optional(v.string()),
    effective_from: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (!user || roleName !== "Admin") {
      throw new Error("Insufficient permissions - Admin required");
    }

    return await ctx.db.insert("incentive_configs", {
      ...args,
      updated_at: Date.now(),
      created_at: Date.now(),
    });
  },
});

export const updateIncentiveConfigNew = mutation({
  args: {
    id: v.id("incentive_configs"),
    threshold_daily: v.number(),
    bonus_per_extra_daily: v.float64(),
    currency: v.optional(v.string()),
    effective_from: v.number(),
  },
  handler: async (ctx, { id, ...updateData }) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (!user || roleName !== "Admin") {
      throw new Error("Insufficient permissions - Admin required");
    }

    const existingConfig = await ctx.db.get(id);
    if (!existingConfig) {
      throw new Error("Incentive configuration not found");
    }

    return await ctx.db.patch(id, {
      ...updateData,
      updated_at: Date.now(),
    });
  },
});

export const getIncentiveConfigsNew = query({
  args: { role: v.optional(v.union(v.literal("RIDER"), v.literal("PICKER"))) },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (!user || !roleName || !["Admin", "Staff"].includes(roleName)) {
      throw new Error("Insufficient permissions - Admin or Staff required");
    }

    if (args.role) {
      const role = args.role; // TypeScript assertion
      return await ctx.db
        .query("incentive_configs")
        .withIndex("by_role", (q) => q.eq("role", role))
        .order("desc")
        .collect();
    } else {
      return await ctx.db.query("incentive_configs").order("desc").collect();
    }
  },
});

export const getCurrentIncentiveConfigNew = query({
  args: { role: v.union(v.literal("RIDER"), v.literal("PICKER")) },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (
      !user ||
      !roleName ||
      !["Admin", "Staff", "Rider", "Picker"].includes(roleName)
    ) {
      throw new Error("Insufficient permissions");
    }

    // Get the most recent incentive config for the role
    return await ctx.db
      .query("incentive_configs")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .order("desc")
      .first();
  },
});

// Delete functions (Admin only, use with caution)

export const deleteBaseEarnings = mutation({
  args: { id: v.id("base_earnings") },
  handler: async (ctx, args) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (!user || roleName !== "Admin") {
      throw new Error("Insufficient permissions - Admin required");
    }

    return await ctx.db.delete(args.id);
  },
});

export const deleteIncentiveConfigNew = mutation({
  args: { id: v.id("incentive_configs") },
  handler: async (ctx, args) => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const roleName = await getUserRoleName(ctx, user);
    if (!user || roleName !== "Admin") {
      throw new Error("Insufficient permissions - Admin required");
    }

    return await ctx.db.delete(args.id);
  },
});
