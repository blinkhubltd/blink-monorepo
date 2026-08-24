/**
 * Incentives arithmetic, extracted pure so it can be tested without a renderer.
 * Every function takes its inputs explicitly — no clock reads, no config lookups.
 *
 * Rates are inputs, not constants: they are per-hub commercial terms and will
 * eventually come from platform settings rather than being compiled in.
 */

export type IncentivePeriod = "daily" | "weekly" | "monthly";

export const INCENTIVE_PERIODS = ["daily", "weekly", "monthly"] as const;

export interface IncentiveRates {
  /** Bonus paid per completed delivery, in shillings. */
  bonusPerDelivery: number;
  /** Guaranteed base pay for a worked day, in shillings. */
  baseDailyPay: number;
  /** Days in a working week, used for weekly projections. */
  workingDaysPerWeek: number;
}

export const DEFAULT_INCENTIVE_RATES: IncentiveRates = {
  bonusPerDelivery: 45,
  baseDailyPay: 500,
  workingDaysPerWeek: 6,
};

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
  rates: IncentiveRates = DEFAULT_INCENTIVE_RATES,
): number {
  if (period === "daily") {
    // Guard the divisor: an empty bucket list would otherwise yield Infinity
    // and push the plan line off the chart.
    return bucketCount > 0 ? dailyTarget / bucketCount : dailyTarget;
  }
  if (period === "weekly") return dailyTarget;
  return dailyTarget * rates.workingDaysPerWeek;
}

/** The whole-period plan a period's total is compared against. */
export function periodPlan(
  period: IncentivePeriod,
  dailyTarget: number,
): number {
  if (period === "daily") return dailyTarget;
  if (period === "weekly") return dailyTarget * 7;
  return dailyTarget * 28;
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

export interface Projection {
  perDay: number;
  perWeek: number;
}

export function projectEarnings(
  dailyTarget: number,
  rates: IncentiveRates = DEFAULT_INCENTIVE_RATES,
): Projection {
  const perDay = rates.baseDailyPay + dailyTarget * rates.bonusPerDelivery;
  return { perDay, perWeek: perDay * rates.workingDaysPerWeek };
}

export interface EarningsLine {
  label: string;
  amount: number;
}

export interface EarningsSummary {
  lines: EarningsLine[];
  total: number;
  /** Null when no deliveries were made — dividing would produce NaN. */
  averagePerDelivery: number | null;
}

/**
 * Weekly earnings breakdown.
 *
 * The prototype computed `total / deliveries` unguarded, which renders
 * "Ksh NaN" on any rider's first day. Returning null makes the caller decide
 * how to present "no data yet".
 */
export function summariseWeek(input: {
  deliveries: number;
  daysWorked: number;
  peakHourBonus: number;
  referralBonus: number;
  rates?: IncentiveRates;
}): EarningsSummary {
  const rates = input.rates ?? DEFAULT_INCENTIVE_RATES;
  const basePay = rates.baseDailyPay * input.daysWorked;
  const deliveryBonus = input.deliveries * rates.bonusPerDelivery;
  const lines: EarningsLine[] = [
    { label: `Base pay (${input.daysWorked} days)`, amount: basePay },
    {
      label: `Delivery bonus (${input.deliveries} × Ksh ${rates.bonusPerDelivery})`,
      amount: deliveryBonus,
    },
    { label: "Peak-hour bonus", amount: input.peakHourBonus },
    { label: "Referral bonus", amount: input.referralBonus },
  ];
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return {
    lines,
    total,
    averagePerDelivery:
      input.deliveries > 0 ? Math.round(total / input.deliveries) : null,
  };
}

/** Progress towards today's target, as a 0–100 percentage. */
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
