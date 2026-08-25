import { describe, expect, it } from "vitest";
import {
  BACKEND_WORKING_DAYS_PER_MONTH,
  BACKEND_WORKING_DAYS_PER_WEEK,
  buildChart,
  bucketTarget,
  clampTarget,
  periodPlan,
  progressPct,
  TARGET_MAX,
  TARGET_MIN,
  trendVsPlan,
} from "../lib/incentives";

describe("progressPct", () => {
  it("is a percentage of the target", () => {
    expect(progressPct(8, 12)).toBe(67);
    expect(progressPct(12, 12)).toBe(100);
  });

  it("clamps above the target rather than overflowing the bar", () => {
    expect(progressPct(20, 12)).toBe(100);
  });

  it("returns 0 for a non-positive target instead of dividing by it", () => {
    // getIncentiveDashboard returns a target of 0 when the crew member has
    // neither a saved target nor a hub config, so this is a real input.
    expect(progressPct(5, 0)).toBe(0);
    expect(progressPct(5, -3)).toBe(0);
  });
});

describe("clampTarget", () => {
  it("holds the bounds", () => {
    expect(clampTarget(0)).toBe(TARGET_MIN);
    expect(clampTarget(999)).toBe(TARGET_MAX);
    expect(clampTarget(12)).toBe(12);
  });

  it("survives the empty input a number field produces", () => {
    // Number("") is 0 and Number("abc") is NaN — both reach here from the UI.
    expect(clampTarget(Number(""))).toBe(TARGET_MIN);
    expect(clampTarget(Number("abc"))).toBe(TARGET_MIN);
  });
});

describe("periodPlan", () => {
  it("expands a daily target the same way the backend does", () => {
    // data/incentives.ts derives its fallback as daily*6 and daily*24. If these
    // drift, a target written by the app disagrees with one implied by a hub
    // config, and the two produce different plan lines for the same crew member.
    expect(periodPlan("daily", 12)).toBe(12);
    expect(periodPlan("weekly", 12)).toBe(12 * BACKEND_WORKING_DAYS_PER_WEEK);
    expect(periodPlan("monthly", 12)).toBe(12 * BACKEND_WORKING_DAYS_PER_MONTH);
  });

  it("uses working days, not calendar days", () => {
    expect(BACKEND_WORKING_DAYS_PER_WEEK).toBe(6);
    expect(BACKEND_WORKING_DAYS_PER_MONTH).toBe(24);
  });
});

describe("bucketTarget", () => {
  it("splits a daily target across the day's buckets", () => {
    expect(bucketTarget("daily", 12, 6)).toBe(2);
  });

  it("uses the daily target directly on a weekly chart, where a bar is a day", () => {
    expect(bucketTarget("weekly", 12, 7)).toBe(12);
  });

  it("uses a working week on a monthly chart, where a bar is a week", () => {
    expect(bucketTarget("monthly", 12, 4)).toBe(
      12 * BACKEND_WORKING_DAYS_PER_WEEK,
    );
  });

  it("does not divide by an empty bucket list", () => {
    expect(bucketTarget("daily", 12, 0)).toBe(12);
    expect(Number.isFinite(bucketTarget("daily", 12, 0))).toBe(true);
  });
});

describe("buildChart", () => {
  it("leaves headroom, so the tallest bar never reaches the top", () => {
    const { bars } = buildChart([{ label: "a", value: 10 }], 0);
    expect(bars[0]!.heightPct).toBeLessThan(100);
    expect(bars[0]!.heightPct).toBeGreaterThan(80);
  });

  it("keeps the plan line on the chart when the target exceeds every bar", () => {
    const { targetLinePct } = buildChart([{ label: "a", value: 1 }], 100);
    expect(targetLinePct).toBeGreaterThan(0);
    expect(targetLinePct).toBeLessThanOrEqual(100);
  });

  it("flat-lines an all-zero period instead of producing NaN", () => {
    // A crew member's first day: no deliveries and no target yet.
    const { bars, targetLinePct } = buildChart(
      [
        { label: "a", value: 0 },
        { label: "b", value: 0 },
      ],
      0,
    );
    expect(bars.map((b) => b.heightPct)).toEqual([0, 0]);
    expect(targetLinePct).toBe(0);
  });

  it("handles an empty bucket list", () => {
    expect(buildChart([], 0)).toEqual({ bars: [], targetLinePct: 0 });
  });
});

describe("trendVsPlan", () => {
  it("reads as above plan when ahead, including exactly on plan", () => {
    expect(trendVsPlan(90, 84)).toMatchObject({
      diff: 6,
      label: "6 above plan",
      tone: "success",
    });
    expect(trendVsPlan(84, 84).tone).toBe("success");
  });

  it("states the shortfall as a positive number", () => {
    expect(trendVsPlan(80, 84)).toMatchObject({
      diff: -4,
      label: "4 below plan",
      tone: "warning",
    });
  });
});
