import { describe, expect, it } from "vitest";
import {
  computeScheduleStats,
  formatMinutes,
  parseTimeOfDay,
  shiftMinutes,
  summariseSchedule,
} from "../components/schedules/schedule-metrics";
import type { ScheduleWithDetails, WeeklySchedule } from "../components/schedules/types";

/**
 * The schedule arithmetic, and the three ways the old inline version was wrong.
 *
 * Each produced a plausible number rather than an error, which is why none of
 * them was noticed: a hub running night shifts reported negative hours, a
 * schedule with one malformed time reported fewer hours than it had, and the
 * "average" excluded anyone with no shifts from its denominator.
 */

function week(days: Partial<WeeklySchedule>): { weeklySchedule: WeeklySchedule } {
  return { weeklySchedule: days as WeeklySchedule };
}

/** Enough of a ScheduleWithDetails for the stats functions. */
function schedule(
  days: Partial<WeeklySchedule>,
  overrides: Partial<ScheduleWithDetails> = {},
): ScheduleWithDetails {
  return {
    weeklySchedule: days as WeeklySchedule,
    userId: overrides.userId ?? "user1",
    vendorId: overrides.vendorId,
    ...overrides,
  } as ScheduleWithDetails;
}

describe("parseTimeOfDay", () => {
  it("reads HH:MM", () => {
    expect(parseTimeOfDay("00:00")).toBe(0);
    expect(parseTimeOfDay("09:30")).toBe(570);
    expect(parseTimeOfDay("23:59")).toBe(1439);
  });

  it("accepts a single-digit hour", () => {
    expect(parseTimeOfDay("9:05")).toBe(545);
  });

  it("returns null for anything unreadable rather than guessing", () => {
    for (const bad of ["", "  ", "abc", "9", "09:60", "24:00", "9:5", "09:30:00"]) {
      expect(parseTimeOfDay(bad), bad).toBeNull();
    }
    expect(parseTimeOfDay(undefined)).toBeNull();
  });
});

describe("shiftMinutes", () => {
  it("measures an ordinary shift", () => {
    expect(shiftMinutes({ enabled: true, startTime: "09:00", endTime: "17:00" })).toBe(
      480,
    );
  });

  it("wraps an overnight shift instead of going negative", () => {
    // The bug: 22:00 to 06:00 evaluated to -16 hours, and that negative number
    // was ADDED to the weekly total. Riders work nights, so this was not
    // hypothetical.
    expect(shiftMinutes({ enabled: true, startTime: "22:00", endTime: "06:00" })).toBe(
      8 * 60,
    );
  });

  it("treats equal times as zero, not a full day", () => {
    // Ambiguous by nature; zero is the safer reading, and the alternative
    // (24 hours) would badly distort an average from one mis-entered row.
    expect(shiftMinutes({ enabled: true, startTime: "09:00", endTime: "09:00" })).toBe(
      0,
    );
  });

  it("is null for a disabled day", () => {
    expect(
      shiftMinutes({ enabled: false, startTime: "09:00", endTime: "17:00" }),
    ).toBeNull();
  });

  it("is null — not zero — when a time is malformed", () => {
    // The distinction matters: zero would silently shorten the week, null lets
    // the caller report the row as broken.
    expect(shiftMinutes({ enabled: true, startTime: "oops", endTime: "17:00" })).toBeNull();
    expect(shiftMinutes(undefined)).toBeNull();
  });
});

describe("summariseSchedule", () => {
  it("totals enabled days only", () => {
    const result = summariseSchedule(
      week({
        Monday: { enabled: true, startTime: "09:00", endTime: "17:00" },
        Tuesday: { enabled: false, startTime: "09:00", endTime: "17:00" },
        Wednesday: { enabled: true, startTime: "10:00", endTime: "14:00" },
      }),
    );
    expect(result.workingDays).toBe(2);
    expect(result.minutes).toBe(480 + 240);
  });

  it("reports malformed days instead of dropping them", () => {
    const result = summariseSchedule(
      week({
        Monday: { enabled: true, startTime: "09:00", endTime: "17:00" },
        Tuesday: { enabled: true, startTime: "", endTime: "17:00" },
      }),
    );
    expect(result.malformedDays).toEqual(["Tuesday"]);
    // Monday still counts — one bad row must not invalidate the rest.
    expect(result.minutes).toBe(480);
    expect(result.workingDays).toBe(1);
  });

  it("flags overnight days", () => {
    const result = summariseSchedule(
      week({ Friday: { enabled: true, startTime: "21:00", endTime: "05:00" } }),
    );
    expect(result.overnightDays).toEqual(["Friday"]);
    expect(result.minutes).toBe(8 * 60);
  });

  it("does not flag an equal-time day as overnight", () => {
    const result = summariseSchedule(
      week({ Friday: { enabled: true, startTime: "09:00", endTime: "09:00" } }),
    );
    expect(result.overnightDays).toEqual([]);
  });

  it("handles an entirely empty week", () => {
    expect(summariseSchedule(week({}))).toEqual({
      workingDays: 0,
      minutes: 0,
      malformedDays: [],
      overnightDays: [],
    });
  });
});

describe("computeScheduleStats", () => {
  it("counts distinct staff and vendors", () => {
    const stats = computeScheduleStats([
      schedule({ Monday: { enabled: true, startTime: "09:00", endTime: "17:00" } }, {
        userId: "a" as ScheduleWithDetails["userId"],
        vendorId: "v1" as ScheduleWithDetails["vendorId"],
      }),
      schedule({ Monday: { enabled: true, startTime: "09:00", endTime: "17:00" } }, {
        userId: "a" as ScheduleWithDetails["userId"],
        vendorId: "v1" as ScheduleWithDetails["vendorId"],
      }),
      schedule({ Monday: { enabled: true, startTime: "09:00", endTime: "17:00" } }, {
        userId: "b" as ScheduleWithDetails["userId"],
        vendorId: "v2" as ScheduleWithDetails["vendorId"],
      }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.staff).toBe(2);
    expect(stats.vendors).toBe(2);
  });

  it("averages over EVERY schedule, including the empty ones", () => {
    // The old figure divided by "schedules with hours > 0", so a staff member
    // with nothing rostered could not move it. 8 hours across two schedules is
    // 4, not 8.
    const stats = computeScheduleStats([
      schedule({ Monday: { enabled: true, startTime: "09:00", endTime: "17:00" } }),
      schedule({}),
    ]);
    expect(stats.averageWeeklyHours).toBe(4);
    expect(stats.emptySchedules).toBe(1);
    expect(stats.scheduledStaff).toBe(1);
  });

  it("never returns a negative average for night shifts", () => {
    // The headline symptom of the old bug.
    const stats = computeScheduleStats([
      schedule({ Monday: { enabled: true, startTime: "22:00", endTime: "06:00" } }),
    ]);
    expect(stats.averageWeeklyHours).toBe(8);
  });

  it("counts schedules containing a malformed day", () => {
    const stats = computeScheduleStats([
      schedule({ Monday: { enabled: true, startTime: "nope", endTime: "06:00" } }),
      schedule({ Monday: { enabled: true, startTime: "09:00", endTime: "17:00" } }),
    ]);
    expect(stats.malformedSchedules).toBe(1);
  });

  it("reports per-day coverage and the gaps", () => {
    const stats = computeScheduleStats([
      schedule({
        Monday: { enabled: true, startTime: "09:00", endTime: "17:00" },
        Tuesday: { enabled: true, startTime: "09:00", endTime: "17:00" },
      }),
      schedule({ Monday: { enabled: true, startTime: "09:00", endTime: "17:00" } }),
    ]);
    expect(stats.perDay.Monday).toBe(2);
    expect(stats.perDay.Tuesday).toBe(1);
    expect(stats.perDay.Wednesday).toBe(0);
    // The actionable output: which days nobody is rostered for at all.
    expect(stats.uncoveredDays).toEqual([
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });

  it("is safe on an empty list", () => {
    const stats = computeScheduleStats([]);
    expect(stats.total).toBe(0);
    expect(stats.averageWeeklyHours).toBe(0);
    expect(stats.uncoveredDays).toHaveLength(7);
  });
});

describe("formatMinutes", () => {
  it("formats hours and minutes", () => {
    expect(formatMinutes(510)).toBe("8h 30m");
    expect(formatMinutes(480)).toBe("8h");
    expect(formatMinutes(45)).toBe("45m");
  });

  it("shows an em dash for nothing, rather than 0h", () => {
    expect(formatMinutes(0)).toBe("—");
    expect(formatMinutes(-5)).toBe("—");
    expect(formatMinutes(Number.NaN)).toBe("—");
  });
});
