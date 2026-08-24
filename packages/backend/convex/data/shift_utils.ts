import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  isRider as checkIsRider,
  isPicker as checkIsPicker,
} from "../lib/roles";
import { isAccountComplete } from "../lib/account_completion";

// Helper function to parse time string (e.g., "09:00") to minutes since midnight
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

// Helper function to get current day of week
function getCurrentDay(): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[new Date().getDay()];
}

// Helper function to get current time in minutes since midnight
function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// Types for shift status
export type ShiftStatus =
  | "not_started"
  | "starting_soon"
  | "active"
  | "ending_soon"
  | "ended"
  | "no_shift_today";
export type WorkMode = "regular" | "overtime" | "off_shift";

// Check shift status based on schedule
export function checkShiftStatus(
  schedule: Doc<"schedules"> | null,
  currentDay: string,
  currentTimeMinutes: number,
): { status: ShiftStatus; message: string; timeInfo?: string } {
  if (!schedule || !schedule.weeklySchedule) {
    return {
      status: "no_shift_today",
      message: "No schedule assigned",
    };
  }

  const daySchedule =
    schedule.weeklySchedule[currentDay as keyof typeof schedule.weeklySchedule];

  if (!daySchedule || !daySchedule.enabled) {
    return {
      status: "no_shift_today",
      message: "No shift scheduled for today",
    };
  }

  const shiftStart = timeToMinutes(daySchedule.startTime);
  const shiftEnd = timeToMinutes(daySchedule.endTime);
  const minutesUntilStart = shiftStart - currentTimeMinutes;
  const minutesUntilEnd = shiftEnd - currentTimeMinutes;

  // Shift hasn't started yet
  if (currentTimeMinutes < shiftStart) {
    if (minutesUntilStart <= 30) {
      return {
        status: "starting_soon",
        message: `Your shift begins in ${minutesUntilStart} minutes`,
        timeInfo: `${daySchedule.startTime} - ${daySchedule.endTime}`,
      };
    }
    return {
      status: "not_started",
      message: `Your shift starts at ${daySchedule.startTime}`,
      timeInfo: `${daySchedule.startTime} - ${daySchedule.endTime}`,
    };
  }

  // Shift is active
  if (currentTimeMinutes >= shiftStart && currentTimeMinutes < shiftEnd) {
    if (minutesUntilEnd <= 30) {
      return {
        status: "ending_soon",
        message: `Your shift ends in ${minutesUntilEnd} minutes`,
        timeInfo: `${daySchedule.startTime} - ${daySchedule.endTime}`,
      };
    }
    return {
      status: "active",
      message: "Your shift is active",
      timeInfo: `${daySchedule.startTime} - ${daySchedule.endTime}`,
    };
  }

  // Shift has ended
  return {
    status: "ended",
    message: "Your shift has ended for today",
    timeInfo: `${daySchedule.startTime} - ${daySchedule.endTime}`,
  };
}

export const getUserShiftStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const currentDay = getCurrentDay();
    const currentTimeMinutes = getCurrentTimeInMinutes();
    const shiftInfo = checkShiftStatus(
      schedule,
      currentDay,
      currentTimeMinutes,
    );

    // Check if user is in overtime mode
    const isOvertime =
      user.rider_details?.is_overtime ||
      user.picker_details?.is_overtime ||
      false;
    const userStatus =
      user.rider_details?.status || user.picker_details?.status || "Inactive";

    return {
      ...shiftInfo,
      schedule,
      isOvertime,
      userStatus,
      canWorkOvertime: shiftInfo.status === "ended",
    };
  },
});

// Mutation to automatically update status based on shift
export const autoUpdateStatusByShift = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const currentDay = getCurrentDay();
    const currentTimeMinutes = getCurrentTimeInMinutes();
    const shiftInfo = checkShiftStatus(
      schedule,
      currentDay,
      currentTimeMinutes,
    );

    const isRider = await checkIsRider(ctx, user);
    const isPicker = await checkIsPicker(ctx, user);

    if (!isRider && !isPicker) {
      throw new Error("User is not a rider or picker");
    }

    // Determine new status based on shift
    let newStatus: "Active" | "Inactive" = "Inactive";

    // Only set to active if shift is active or starting soon
    if (shiftInfo.status === "active" || shiftInfo.status === "starting_soon") {
      // Block activation if account setup is incomplete
      const accountComplete = await isAccountComplete(ctx, user);
      if (accountComplete) {
        newStatus = "Active";
      }
    }

    // Update user status
    if (isRider) {
      const currentDetails = user.rider_details || {
        vehicle_type: "Bicycle" as const,
        status: "Inactive" as const,
      };

      await ctx.db.patch(args.userId, {
        rider_details: {
          ...currentDetails,
          status: newStatus,
          is_overtime: false, // Reset overtime when shift-based status is applied
        },
        updated_at: Date.now(),
      });
    } else if (isPicker) {
      if (!user.picker_details?.vendor_id) {
        throw new Error("Picker must have a vendor_id assigned");
      }

      const currentDetails = user.picker_details;

      await ctx.db.patch(args.userId, {
        picker_details: {
          ...currentDetails,
          status: newStatus,
          is_overtime: false, // Reset overtime when shift-based status is applied
        },
        updated_at: Date.now(),
      });
    }

    return {
      success: true,
      newStatus,
      shiftInfo,
    };
  },
});

// Mutation to enable overtime mode
export const enableOvertimeMode = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const isRider = await checkIsRider(ctx, user);
    const isPicker = await checkIsPicker(ctx, user);

    if (!isRider && !isPicker) {
      throw new Error("User is not a rider or picker");
    }

    // Block activation if account setup is incomplete
    const accountComplete = await isAccountComplete(ctx, user);
    if (!accountComplete) {
      throw new Error(
        "Cannot go online: please complete your account setup first",
      );
    }

    // Enable overtime and set status to Active
    if (isRider) {
      const currentDetails = user.rider_details || {
        vehicle_type: "Bicycle" as const,
        status: "Inactive" as const,
      };

      await ctx.db.patch(args.userId, {
        rider_details: {
          ...currentDetails,
          status: "Active",
          is_overtime: true,
        },
        updated_at: Date.now(),
      });
    } else if (isPicker) {
      if (!user.picker_details?.vendor_id) {
        throw new Error("Picker must have a vendor_id assigned");
      }

      const currentDetails = user.picker_details;

      await ctx.db.patch(args.userId, {
        picker_details: {
          ...currentDetails,
          status: "Active",
          is_overtime: true,
        },
        updated_at: Date.now(),
      });
    }

    return {
      success: true,
      message: "Overtime mode enabled",
    };
  },
});

// Mutation to disable overtime mode
export const disableOvertimeMode = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const isRider = await checkIsRider(ctx, user);
    const isPicker = await checkIsPicker(ctx, user);

    if (!isRider && !isPicker) {
      throw new Error("User is not a rider or picker");
    }

    // Disable overtime and set status to Inactive
    if (isRider) {
      const currentDetails = user.rider_details || {
        vehicle_type: "Motorbike" as const,
        status: "Inactive" as const,
      };

      await ctx.db.patch(args.userId, {
        rider_details: {
          ...currentDetails,
          status: "Inactive",
          is_overtime: false,
        },
        updated_at: Date.now(),
      });
    } else if (isPicker) {
      if (!user.picker_details?.vendor_id) {
        throw new Error("Picker must have a vendor_id assigned");
      }

      const currentDetails = user.picker_details;

      await ctx.db.patch(args.userId, {
        picker_details: {
          ...currentDetails,
          status: "Inactive",
          is_overtime: false,
        },
        updated_at: Date.now(),
      });
    }

    return {
      success: true,
      message: "Overtime mode disabled",
    };
  },
});
