import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { SchedulesValidator, ScheduleUpdateValidator } from "../validators";
import { Doc } from "../_generated/dataModel";
import { assertPermission, assertSelfOrPermission } from "../auth.helpers";

/**
 * Staff and rider schedules. `getUserSchedule` and `createOrUpdateSchedule`
 * have callers in both `apps/admin` (assigning a schedule to someone) and
 * `apps/rider` (a rider reading or setting their OWN) — gated with
 * `assertSelfOrPermission` so either can act, but a rider cannot read or
 * write another rider's shift. Everything else here is admin-only.
 */

export const getAllSchedules = query({
  args: {},
  handler: async (ctx) => {
    await assertPermission(ctx, "schedules:READ");
    const schedules = await ctx.db.query("schedules").collect();

    // Fetch user and vendor details for each schedule
    const schedulesWithDetails = await Promise.all(
      schedules.map(async (schedule) => {
        const user = await ctx.db.get(schedule.userId);
        const vendor = schedule.vendorId
          ? await ctx.db.get(schedule.vendorId)
          : null;

        return {
          ...schedule,
          user,
          vendor,
        };
      }),
    );

    return schedulesWithDetails;
  },
});

export const getUserSchedule = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await assertSelfOrPermission(ctx, args.userId, "schedules:READ");
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    return schedule;
  },
});

/** @deprecated No caller anywhere in this monorepo. */
export const getVendorSchedules = internalQuery({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();

    // Fetch user details for each schedule
    const schedulesWithUsers = await Promise.all(
      schedules.map(async (schedule) => {
        const user = await ctx.db.get(schedule.userId);
        return {
          ...schedule,
          user,
        };
      }),
    );

    return schedulesWithUsers;
  },
});

// Mutation to create or update a schedule
export const createOrUpdateSchedule = mutation({
  args: SchedulesValidator,
  handler: async (ctx, args) => {
    await assertSelfOrPermission(ctx, args.userId, "schedules:UPDATE");
    // Check if a schedule already exists for this user
    const existingSchedule = await ctx.db
      .query("schedules")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existingSchedule) {
      // Update existing schedule
      await ctx.db.patch(existingSchedule._id, {
        weeklySchedule: args.weeklySchedule,
        vendorId: args.vendorId,
        updated_at: Date.now(),
      });
      return existingSchedule._id;
    } else {
      // Create new schedule
      const scheduleId = await ctx.db.insert("schedules", {
        ...args,
        updated_at: Date.now(),
      });
      return scheduleId;
    }
  },
});

// Mutation to create schedules for multiple users
export const createBulkSchedules = mutation({
  args: {
    userIds: v.array(v.id("users")),
    vendorId: v.optional(v.id("vendors")),
    weeklySchedule: v.object({
      Monday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Tuesday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Wednesday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Thursday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Friday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Saturday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Sunday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "schedules:UPDATE");
    const createdSchedules = [];
    const updatedSchedules = [];
    const errors = [];

    for (const userId of args.userIds) {
      try {
        // Check if a schedule already exists for this user
        const existingSchedule = await ctx.db
          .query("schedules")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();

        if (existingSchedule) {
          await ctx.db.patch(existingSchedule._id, {
            weeklySchedule: args.weeklySchedule,
            vendorId: args.vendorId,
            updated_at: Date.now(),
          });
          updatedSchedules.push(existingSchedule._id);
        } else {
          const scheduleId = await ctx.db.insert("schedules", {
            userId,
            vendorId: args.vendorId,
            weeklySchedule: args.weeklySchedule,
            updated_at: Date.now(),
          });
          createdSchedules.push(scheduleId);
        }
      } catch (error) {
        errors.push(
          `Failed to create/update schedule for user ${userId}: ${error}`,
        );
      }
    }

    return {
      created: createdSchedules.length,
      updated: updatedSchedules.length,
      errors,
    };
  },
});

/** @deprecated No caller anywhere in this monorepo. */
export const updateSchedule = internalMutation({
  args: ScheduleUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    // Check if schedule exists
    const existingSchedule = await ctx.db.get(id);
    if (!existingSchedule) {
      throw new Error("Schedule not found");
    }

    await ctx.db.patch(id, {
      ...updates,
      updated_at: Date.now(),
    });

    return id;
  },
});

// Mutation to delete a schedule
export const deleteSchedule = mutation({
  args: { id: v.id("schedules") },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "schedules:DELETE");
    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

// Query to get staff with their schedules for a specific vendor
export const getVendorStaffWithSchedules = query({
  args: {
    vendorId: v.optional(v.id("vendors")),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "schedules:READ");
    let staffMembers: Doc<"users">[] = [];

    if (args.role) {
      const selectedRole = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", args.role!))
        .unique();

      if (selectedRole) {
        staffMembers = await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) => q.eq("role_id", selectedRole._id))
          .collect();
      }
    } else {
      const roles = await ctx.db.query("roles").collect();
      const nonCustomerRoles = roles.filter(
        (role) => role.name.trim().toUpperCase() !== "CUSTOMER",
      );

      const usersByRole = await Promise.all(
        nonCustomerRoles.map((role) =>
          ctx.db
            .query("users")
            .withIndex("by_role_id", (q) => q.eq("role_id", role._id))
            .collect(),
        ),
      );

      staffMembers = usersByRole.flat();
    }

    if (args.vendorId) {
      const vendorId = args.vendorId;
      staffMembers = staffMembers.filter(
        (user) =>
          user.rider_details?.vendor_id === vendorId ||
          user.picker_details?.vendor_id === vendorId ||
          user.manager_details?.vendor_id?.includes(vendorId),
      );
    }

    // Get schedules for each staff member
    const staffWithSchedules = await Promise.all(
      staffMembers.map(async (staff) => {
        const schedule = await ctx.db
          .query("schedules")
          .withIndex("by_user", (q) => q.eq("userId", staff._id))
          .first();

        return {
          ...staff,
          schedule,
        };
      }),
    );

    return staffWithSchedules;
  },
});
