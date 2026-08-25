/**
 * Chart buckets, derived on the client.
 *
 * No backend query returns a time series. `getIncentiveDashboard` returns three
 * scalar counts (daily/weekly/monthly), `getRiderWeeklyStats` returns a weekly
 * total, and `getActiveHoursBreakdown` returns today/week/total hours — none of
 * them bucketed. The design's Daily/Weekly/Monthly chart needs per-bucket
 * values, so they are computed here from the delivery list the queue already
 * loads.
 *
 * This is a deliberate stopgap, not the destination: it can only bucket the
 * shipments the client has fetched, so a monthly chart is only as complete as
 * that list. The real fix is an aggregate table written by a cron, per the
 * backend plan's `insights_snapshots` design. Until then this is honest about
 * what it counts — completed deliveries the app has actually seen.
 *
 * Every function takes `now` as a parameter. Nothing here reads the clock.
 */
import type { Bucket, IncentivePeriod } from "../incentives";

export interface CompletedDelivery {
  /** Epoch ms the delivery reached its final state. */
  completedAt: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Two-hour slices across a working day, matching the design's 8am–6pm axis. */
const DAY_SLICE_HOURS = [8, 10, 12, 14, 16, 18] as const;

const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function hourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/**
 * Today, in two-hour slices.
 *
 * Anything before the first slice or after the last is folded into the nearest
 * end slice rather than dropped — a rider who starts at 6am should still see
 * those deliveries counted somewhere.
 */
function dailyBuckets(
  deliveries: CompletedDelivery[],
  now: number,
): Bucket[] {
  const dayStart = startOfDay(now);
  const dayEnd = dayStart + DAY_MS;
  const counts = new Array<number>(DAY_SLICE_HOURS.length).fill(0);

  for (const d of deliveries) {
    if (d.completedAt < dayStart || d.completedAt >= dayEnd) continue;
    const hour = new Date(d.completedAt).getHours();
    let index = 0;
    for (let i = 0; i < DAY_SLICE_HOURS.length; i++) {
      if (hour >= DAY_SLICE_HOURS[i]!) index = i;
    }
    counts[index] = (counts[index] ?? 0) + 1;
  }

  return DAY_SLICE_HOURS.map((h, i) => ({
    label: hourLabel(h),
    value: counts[i] ?? 0,
  }));
}

/** The last seven days, oldest first, labelled by weekday. */
function weeklyBuckets(
  deliveries: CompletedDelivery[],
  now: number,
): Bucket[] {
  const todayStart = startOfDay(now);
  const buckets: Bucket[] = [];

  for (let back = 6; back >= 0; back--) {
    const start = todayStart - back * DAY_MS;
    const end = start + DAY_MS;
    const value = deliveries.filter(
      (d) => d.completedAt >= start && d.completedAt < end,
    ).length;
    buckets.push({
      label: WEEKDAY_LABELS[new Date(start).getDay()] ?? "—",
      value,
    });
  }

  return buckets;
}

/** Four trailing seven-day windows, oldest first. */
function monthlyBuckets(
  deliveries: CompletedDelivery[],
  now: number,
): Bucket[] {
  const todayEnd = startOfDay(now) + DAY_MS;
  const buckets: Bucket[] = [];

  for (let back = 3; back >= 0; back--) {
    const end = todayEnd - back * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const value = deliveries.filter(
      (d) => d.completedAt >= start && d.completedAt < end,
    ).length;
    buckets.push({ label: `Wk ${4 - back}`, value });
  }

  return buckets;
}

export function bucketsFor(
  period: IncentivePeriod,
  deliveries: CompletedDelivery[],
  now: number,
): Bucket[] {
  if (period === "daily") return dailyBuckets(deliveries, now);
  if (period === "weekly") return weeklyBuckets(deliveries, now);
  return monthlyBuckets(deliveries, now);
}

/**
 * Completed deliveries out of the rider queue.
 *
 * `updated_at` is the only timestamp a shipment carries, so it stands in for the
 * completion time — accurate for a delivered shipment, since reaching Delivered
 * is the last thing that touches it.
 */
export function completedFromShipments(
  docs: { status: string; updated_at: number }[],
): CompletedDelivery[] {
  return docs
    .filter((d) => d.status === "Delivered")
    .map((d) => ({ completedAt: d.updated_at }));
}
