import { describe, expect, it } from "vitest";
import {
  dayKey,
  dayKeysInPeriod,
  resolvePeriod,
  timeRanges,
} from "../convex/lib/time_range";

/**
 * Wednesday 26 August 2026, 14:30 local.
 *
 * A mid-week, mid-month, mid-year instant, so a boundary bug in any direction
 * shows up rather than coinciding with the value being tested.
 */
const NOW = new Date(2026, 7, 26, 14, 30, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe("resolvePeriod", () => {
  it("covers every key the validator accepts", () => {
    // A missing case would be a runtime undefined rather than a type error,
    // since the switch returns from each branch.
    for (const key of timeRanges) {
      const period = resolvePeriod(key, NOW);
      expect(period.start, key).toBeTypeOf("number");
      expect(period.end, key).toBeTypeOf("number");
      expect(period.end, key).toBeGreaterThan(period.start);
    }
  });

  it("today starts at local midnight and ends at the last millisecond", () => {
    const p = resolvePeriod("today", NOW);
    const start = new Date(p.start);
    const end = new Date(p.end);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMilliseconds()).toBe(999);
    expect(start.getDate()).toBe(26);
  });

  it("yesterday is a closed day, not up to now", () => {
    const p = resolvePeriod("yesterday", NOW);
    expect(new Date(p.start).getDate()).toBe(25);
    expect(new Date(p.end).getDate()).toBe(25);
    expect(new Date(p.end).getHours()).toBe(23);
  });

  it("thisWeek starts on Sunday", () => {
    // Matching the existing implementations in insights.ts, which are
    // Sunday-based. Changing it would silently move every weekly figure.
    const p = resolvePeriod("thisWeek", NOW);
    expect(new Date(p.start).getDay()).toBe(0);
    expect(new Date(p.start).getDate()).toBe(23);
  });

  it("lastWeek ends where thisWeek begins, with no gap and no overlap", () => {
    const last = resolvePeriod("lastWeek", NOW);
    const current = resolvePeriod("thisWeek", NOW);
    expect(last.end).toBe(current.start - 1);
  });

  it("lastMonth is the previous CALENDAR month, not 30 days back", () => {
    // The distinction matters most around February: 30 days back from 1 March
    // lands on 30 January, so a naive offset compares February against a window
    // that includes two days of January.
    const p = resolvePeriod("lastMonth", NOW);
    expect(new Date(p.start).getMonth()).toBe(6); // July
    expect(new Date(p.start).getDate()).toBe(1);
    expect(new Date(p.end).getMonth()).toBe(6);
    expect(new Date(p.end).getDate()).toBe(31);
  });

  it("handles a January this-month, where the previous month crosses the year", () => {
    const january = new Date(2026, 0, 15, 10, 0).getTime();
    const p = resolvePeriod("thisMonth", january);
    expect(p.previous).not.toBeNull();
    const prevStart = new Date(p.previous!.start);
    expect(prevStart.getFullYear()).toBe(2025);
    expect(prevStart.getMonth()).toBe(11); // December
  });

  it("handles a March lastMonth, so February keeps its real length", () => {
    const march = new Date(2026, 2, 10, 10, 0).getTime();
    const p = resolvePeriod("lastMonth", march);
    expect(new Date(p.start).getMonth()).toBe(1); // February
    expect(new Date(p.start).getDate()).toBe(1);
    // 2026 is not a leap year, so February ends on the 28th.
    expect(new Date(p.end).getMonth()).toBe(1);
    expect(new Date(p.end).getDate()).toBe(28);
  });

  it("gives every period except 'all' a previous window", () => {
    for (const key of timeRanges) {
      const p = resolvePeriod(key, NOW);
      if (key === "all") {
        // Nothing precedes everything, and a comparison against zero renders as
        // infinite growth.
        expect(p.previous).toBeNull();
      } else {
        expect(p.previous, key).not.toBeNull();
      }
    }
  });

  it("puts the previous window immediately before the current one", () => {
    for (const key of timeRanges) {
      const p = resolvePeriod(key, NOW);
      if (!p.previous) continue;
      expect(p.previous.end, key).toBe(p.start - 1);
      expect(p.previous.start, key).toBeLessThan(p.previous.end);
    }
  });

  it("all starts at the epoch", () => {
    const p = resolvePeriod("all", NOW);
    expect(p.start).toBe(0);
    expect(p.end).toBeGreaterThan(NOW);
  });
});

describe("dayKey", () => {
  it("formats from LOCAL date parts, not UTC", () => {
    // Matters because toISOString shifts a late-evening order into the next day
    // for any timezone ahead of UTC, and Nairobi is UTC+3. Asserted against the
    // local getters rather than against the ISO string: whether the two actually
    // differ depends on the machine running the test, and a test that only holds
    // in some timezones is worse than none.
    const lateEvening = new Date(2026, 7, 26, 23, 30);
    expect(dayKey(lateEvening.getTime())).toBe("2026-08-26");

    const early = new Date(2026, 7, 26, 0, 15);
    expect(dayKey(early.getTime())).toBe(dayKey(lateEvening.getTime()));
  });

  it("zero-pads", () => {
    expect(dayKey(new Date(2026, 0, 5, 12, 0).getTime())).toBe("2026-01-05");
  });
});

describe("dayKeysInPeriod", () => {
  it("includes every day, so a zero day is a gap in the line not a missing point", () => {
    const p = resolvePeriod("thisWeek", NOW);
    const keys = dayKeysInPeriod(p);
    // Sunday 23rd through Wednesday 26th.
    expect(keys).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
    ]);
  });

  it("is chronological", () => {
    const keys = dayKeysInPeriod(resolvePeriod("thisMonth", NOW));
    expect([...keys].sort()).toEqual(keys);
  });

  it("caps 'all' rather than enumerating from 1970", () => {
    const keys = dayKeysInPeriod(resolvePeriod("all", NOW));
    expect(keys.length).toBeLessThanOrEqual(120);
    expect(keys.length).toBeGreaterThan(0);
    // Ends on today, so the recent window is the one kept.
    expect(keys[keys.length - 1]).toBe("2026-08-26");
  });

  it("respects an explicit cap", () => {
    const keys = dayKeysInPeriod(resolvePeriod("thisYear", NOW), 10);
    expect(keys).toHaveLength(10);
  });

  it("returns a single day for a single-day period", () => {
    expect(dayKeysInPeriod(resolvePeriod("today", NOW))).toEqual([
      "2026-08-26",
    ]);
  });
});
