import { describe, expect, it } from "vitest";
import {
  buildChart,
  bucketTarget,
  clampTarget,
  DEFAULT_INCENTIVE_RATES,
  periodPlan,
  progressPct,
  projectEarnings,
  summariseWeek,
  TARGET_MAX,
  TARGET_MIN,
  trendVsPlan,
} from "../lib/incentives";

const rates = DEFAULT_INCENTIVE_RATES;

describe("progressPct", () => {
  it("is a percentage of the target", () => {
    expect(progressPct(8, 12)).toBe(67);
    expect(progressPct(12, 12)).toBe(100);
  });

  it("clamps above the target rather than overflowing the bar", () => {
    expect(progressPct(20, 12)).toBe(100);
  });

  it("returns 0 for a non-positive target instead of dividing by it", () => {
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
    // Number("") is 0, Number("abc") is NaN — both reach here from the UI.
    expect(clampTarget(Number(""))).toBe(TARGET_MIN);
    expect(clampTarget(Number("abc"))).toBe(TARGET_MIN);
  });
});

describe("bucketTarget", () => {
  it("splits a daily target across the day's buckets", () => {
    expect(bucketTarget("daily", 12, 6, rates)).toBe(2);
  });

  it("uses the daily target directly on a weekly chart, where a bar is a day", () => {
    expect(bucketTarget("weekly", 12, 7, rates)).toBe(12);
  });

  it("uses a working week on a monthly chart, where a bar is a week", () => {
    expect(bucketTarget("monthly", 12, 4, rates)).toBe(
      12 * rates.workingDaysPerWeek,
    );
  });

  it("does not divide by an empty bucket list", () => {
    expect(bucketTarget("daily", 12, 0, rates)).toBe(12);
    expect(Number.isFinite(bucketTarget("daily", 12, 0, rates))).toBe(true);
  });
});

describe("periodPlan", () => {
  it("scales the daily target to the period", () => {
    expect(periodPlan("daily", 12)).toBe(12);
    expect(periodPlan("weekly", 12)).toBe(84);
    expect(periodPlan("monthly", 12)).toBe(336);
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

describe("projectEarnings", () => {
  it("is base pay plus the per-delivery bonus", () => {
    const { perDay, perWeek } = projectEarnings(12, rates);
    expect(perDay).toBe(rates.baseDailyPay + 12 * rates.bonusPerDelivery);
    expect(perWeek).toBe(perDay * rates.workingDaysPerWeek);
  });

  it("still pays base at a target of zero", () => {
    expect(projectEarnings(0, rates).perDay).toBe(rates.baseDailyPay);
  });
});

describe("summariseWeek", () => {
  const input = {
    deliveries: 86,
    daysWorked: 6,
    peakHourBonus: 320,
    referralBonus: 0,
    rates,
  };

  it("totals exactly the sum of its lines — no cent created or lost", () => {
    const { lines, total } = summariseWeek(input);
    expect(total).toBe(lines.reduce((s, l) => s + l.amount, 0));
  });

  it("computes the expected total", () => {
    // 500*6 + 86*45 + 320 = 3000 + 3870 + 320
    expect(summariseWeek(input).total).toBe(7190);
  });

  it("returns null rather than NaN on a crew member's first day", () => {
    const first = summariseWeek({ ...input, deliveries: 0, daysWorked: 0 });
    expect(first.averagePerDelivery).toBeNull();
    // The bug this guards: total/0 rendered as "Ksh NaN".
    expect(Number.isNaN(first.averagePerDelivery as unknown as number)).toBe(
      false,
    );
  });

  it("names the bonus rate in the line label so the figure is checkable", () => {
    const { lines } = summariseWeek(input);
    expect(lines[1]!.label).toContain(String(rates.bonusPerDelivery));
    expect(lines[1]!.label).toContain("86");
  });
});
