/**
 * Incentives arithmetic, extracted pure so it can be tested without a renderer.
 * Every function takes its inputs explicitly — no clock reads, no config lookups.
 *
 * Rates are inputs, not constants: they are per-hub commercial terms and will
 * eventually come from platform settings rather than being compiled in.
 */

export type IncentivePeriod = "daily" | "weekly" | "monthly";

export const INCENTIVE_PERIODS = ["daily", "weekly", "monthly"] as const;

/**
 * Working days the backend assumes when it derives its own fallback targets
 * (`data/incentives.ts`: weekly = daily * 6, monthly = daily * 24).
 *
 * Used rather than 7 and 28 so a target written from this app expands the same
 * way the backend would have expanded it — otherwise the weekly and monthly
 * targets stored by the app disagree with the ones a hub config implies.
 */
export const BACKEND_WORKING_DAYS_PER_WEEK = 6;
export const BACKEND_WORKING_DAYS_PER_MONTH = 24;

export interface Bucket {
  label: string;
  value: number;
}

export interface ChartBar extends Bucket {
  /** 0–100, height of the bar within the plot area. */
  heightPct: number;
}

/** Headroom above the tallest bar so it never touches the top of the plot. */
const CHART_HEADROOM = 1.15;

/**
 * The per-bucket target the dashed plan line sits at.
 *
 * Each period charts a different bucket unit, so the plan has to be restated
 * per bucket: a daily chart's buckets are time-of-day slices of one day, a
 * weekly chart's buckets are single days, and a monthly chart's buckets are
 * working weeks.
 */
export function bucketTarget(
  period: IncentivePeriod,
  dailyTarget: number,
  bucketCount: number,
): number {
  if (period === "daily") {
    // Guard the divisor: an empty bucket list would otherwise yield Infinity
    // and push the plan line off the chart.
    return bucketCount > 0 ? dailyTarget / bucketCount : dailyTarget;
  }
  if (period === "weekly") return dailyTarget;
  return dailyTarget * BACKEND_WORKING_DAYS_PER_WEEK;
}

/** The whole-period plan a period's total is compared against. */
export function periodPlan(
  period: IncentivePeriod,
  dailyTarget: number,
): number {
  if (period === "daily") return dailyTarget;
  if (period === "weekly") return dailyTarget * BACKEND_WORKING_DAYS_PER_WEEK;
  return dailyTarget * BACKEND_WORKING_DAYS_PER_MONTH;
}

export interface ChartModel {
  bars: ChartBar[];
  /** 0–100, vertical position of the dashed plan line. */
  targetLinePct: number;
}

export function buildChart(
  buckets: Bucket[],
  target: number,
): ChartModel {
  const peak = Math.max(0, ...buckets.map((b) => b.value), target);
  // A period with no activity and no target would divide by zero; flat-line it.
  const ceiling = peak > 0 ? peak * CHART_HEADROOM : 1;
  return {
    bars: buckets.map((b) => ({
      ...b,
      heightPct: clampPct(Math.round((b.value / ceiling) * 100)),
    })),
    targetLinePct: clampPct(Math.round((target / ceiling) * 100)),
  };
}

export interface TrendVsPlan {
  /** Actual minus plan. Positive is ahead. */
  diff: number;
  label: string;
  tone: "success" | "warning";
}

export function trendVsPlan(total: number, plan: number): TrendVsPlan {
  const diff = total - plan;
  return {
    diff,
    label:
      diff >= 0 ? `${diff} above plan` : `${Math.abs(diff)} below plan`,
    tone: diff >= 0 ? "success" : "warning",
  };
}

export function progressPct(done: number, target: number): number {
  if (target <= 0) return 0;
  return clampPct(Math.round((done / target) * 100));
}

/** Target is a rider-editable number; keep it inside sane bounds. */
export const TARGET_MIN = 1;
export const TARGET_MAX = 60;

export function clampTarget(value: number): number {
  if (!Number.isFinite(value)) return TARGET_MIN;
  return Math.max(TARGET_MIN, Math.min(TARGET_MAX, Math.round(value)));
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
