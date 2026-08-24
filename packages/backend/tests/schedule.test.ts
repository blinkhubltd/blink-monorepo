import { describe, expect, it } from "vitest";
import { checkVendorSchedule } from "../convex/lib/schedule";

/**
 * Deliberately limited scope.
 *
 * `checkVendorSchedule` shifts time by a hardcoded +3 hours via
 * `now.setHours(now.getHours() + 3)`. `getHours()` is host-relative, so the
 * result is only correct on a UTC host — Convex is UTC, so production is right,
 * but this suite runs on a developer machine which may not be. (The machine this
 * was written on is UTC+3, where the function lands on UTC+6.)
 *
 * Asserting open/closed boundaries would therefore encode the host's offset into
 * the expectations and pass or fail depending on where it runs. So these tests
 * cover only the branches that return before the timezone shift, plus the shape
 * of the result. The boundary cases become testable once the function derives the
 * EAT wall clock from the epoch instead of mutating a Date — see the hazard note
 * in lib/schedule.ts.
 */

const FULL_WEEK = {
  Monday: { startTime: "08:00", endTime: "17:00" },
  Tuesday: { startTime: "08:00", endTime: "17:00" },
  Wednesday: { startTime: "08:00", endTime: "17:00" },
  Thursday: { startTime: "08:00", endTime: "17:00" },
  Friday: { startTime: "08:00", endTime: "17:00" },
  Saturday: { startTime: "08:00", endTime: "17:00" },
  Sunday: { startTime: "08:00", endTime: "17:00" },
};

describe("always-operational branches", () => {
  it("treats a missing schedule as open", () => {
    // A vendor with no schedule row must not silently become unorderable.
    for (const s of [null, undefined]) {
      const r = checkVendorSchedule(s);
      expect(r.isOperational).toBe(true);
      expect(r.reason).toBe("No schedule defined");
    }
  });

  it("treats is_fulltime as open regardless of weeklySchedule", () => {
    const r = checkVendorSchedule({
      is_fulltime: true,
      weeklySchedule: { Monday: { startTime: "08:00", endTime: "09:00" } },
    });
    expect(r.isOperational).toBe(true);
    expect(r.reason).toBe("24/7 operation");
  });

  it("treats a schedule with no weeklySchedule as open", () => {
    const r = checkVendorSchedule({ is_fulltime: false });
    expect(r.isOperational).toBe(true);
    expect(r.reason).toBe("No weekly schedule defined");
  });
});

describe("closed-day branch", () => {
  it("reports closed when the resolved day has no entry", () => {
    // Every day absent, so whichever day the timezone maths lands on is closed.
    const r = checkVendorSchedule({
      is_fulltime: false,
      weeklySchedule: {},
    });
    expect(r.isOperational).toBe(false);
    expect(r.isTooClose).toBe(false);
    expect(r.reason).toMatch(/^Vendor closed on /);
  });
});

describe("result shape", () => {
  it("never reports isTooClose without also being operational", () => {
    // isTooClose means "closing within 20 minutes", which is only meaningful
    // while open. A closed-and-too-close result would be contradictory.
    const times = [0, Date.now(), Date.UTC(2026, 0, 1, 12, 0, 0)];
    for (const t of times) {
      const r = checkVendorSchedule(
        { is_fulltime: false, weeklySchedule: FULL_WEEK },
        t,
      );
      if (r.isTooClose) expect(r.isOperational).toBe(true);
    }
  });

  it("always returns both booleans", () => {
    const r = checkVendorSchedule(
      { is_fulltime: false, weeklySchedule: FULL_WEEK },
      Date.UTC(2026, 0, 1, 12, 0, 0),
    );
    expect(typeof r.isOperational).toBe("boolean");
    expect(typeof r.isTooClose).toBe("boolean");
  });

  it("is deterministic for a given checkTime", () => {
    // The whole reason checkTime is a parameter. If this ever fails, something
    // started reading the clock internally.
    const t = Date.UTC(2026, 5, 15, 9, 30, 0);
    const a = checkVendorSchedule(
      { is_fulltime: false, weeklySchedule: FULL_WEEK },
      t,
    );
    const b = checkVendorSchedule(
      { is_fulltime: false, weeklySchedule: FULL_WEEK },
      t,
    );
    expect(a).toEqual(b);
  });

  it("does not mutate the caller's schedule object", () => {
    const schedule = { is_fulltime: false, weeklySchedule: FULL_WEEK };
    const before = JSON.stringify(schedule);
    checkVendorSchedule(schedule, Date.UTC(2026, 0, 1, 12, 0, 0));
    expect(JSON.stringify(schedule)).toBe(before);
  });
});
