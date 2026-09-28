/**
 * The numbers on the rider's Home and Incentives screens, derived from the
 * rider's own delivery list.
 *
 * ── Why these are computed here ──────────────────────────────────────────
 *
 * The backend returns no time series — `getRiderDashboard` has today's totals
 * and nothing else. `listRiderDeliveries` returns every shipment the rider has
 * been given, now with the order's delivery fee on each, so a day, a week or a
 * month is a sum over that list. Same stopgap `data/buckets.ts` already takes
 * for delivery counts, and for the same reason: it is only as complete as the
 * list the client has, which for one rider is the whole history.
 *
 * ── What a delivery "earned" ─────────────────────────────────────────────
 *
 * The order's `delivery_fee` — exactly the figure `getRiderDashboard` sums for
 * "today's earnings", so the home screen's headline and its sparkline cannot
 * disagree. There are no tips or distance bonuses in the data model; the
 * design's payout breakdown shows them, and they are not invented here.
 *
 * Every function takes `now`. Nothing reads the clock.
 */

export interface RiderJob {
  id: string;
  reference: string;
  status: string;
  /** Awaiting pickup, picked up or out for delivery. */
  live: boolean;
  addressLine: string;
  coordinates: { latitude: number; longitude: number } | null;
  customerName: string | null;
  /** Epoch ms the shipment was created, which is when it was assigned. */
  assignedAt: number;
  /** Epoch ms of the last status change. */
  updatedAt: number;
  /** Set only once delivered: the moment it reached Delivered. */
  completedAt: number | null;
  /** When the customer placed the order, if the order is still there. */
  orderDate: number | null;
  total: number;
  /** What the rider is paid for the drop. */
  fee: number;
  /** The customer's 1–5 rating of this delivery, once given. */
  rating: number | null;
  paymentMethod: string | null;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The brand promise, in minutes — the number on the delivery badge.
 *
 * The drop-by clock counts down from the moment the customer ordered to this
 * many minutes later. It is the promise the customer was made, so it is the
 * deadline the rider is working to, whether or not dispatch was quick.
 */
export const PROMISE_MINUTES = 10;

export const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Sunday 00:00 of the week containing `ms` — the design's week runs Sun–Sat. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function startOfMonth(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(1);
  return d.getTime();
}

function delivered(jobs: RiderJob[]): (RiderJob & { completedAt: number })[] {
  return jobs.filter(
    (j): j is RiderJob & { completedAt: number } => j.completedAt !== null,
  );
}

/** Fees earned from deliveries completed in [start, end). */
export function earnedBetween(
  jobs: RiderJob[],
  start: number,
  end: number,
): number {
  return delivered(jobs)
    .filter((j) => j.completedAt >= start && j.completedAt < end)
    .reduce((sum, j) => sum + j.fee, 0);
}

export function countBetween(
  jobs: RiderJob[],
  start: number,
  end: number,
): number {
  return delivered(jobs).filter(
    (j) => j.completedAt >= start && j.completedAt < end,
  ).length;
}

/**
 * The last `days` days, oldest first, today last — the home sparklines.
 *
 * `measure` picks earnings or counts, so both cards read the same days.
 */
export function lastDays(
  jobs: RiderJob[],
  now: number,
  days: number,
  measure: "fee" | "count",
): number[] {
  const today = startOfDay(now);
  const out: number[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const start = today - back * DAY_MS;
    const end = start + DAY_MS;
    out.push(
      measure === "fee"
        ? earnedBetween(jobs, start, end)
        : countBetween(jobs, start, end),
    );
  }
  return out;
}

/**
 * Bar heights as percentages of the tallest, for a sparkline.
 *
 * A floor of 8% keeps a zero day visible as a stub rather than a gap — a
 * missing bar reads as missing data, a short one reads as a quiet day.
 */
export function sparkHeights(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max === 0) return values.map(() => 8);
  return values.map((v) => Math.max(8, Math.round((v / max) * 100)));
}

/**
 * The last seven days' earnings against the seven before, as a whole-number
 * percentage. Null when there is no previous week to compare with — "+∞%" is
 * not a number anyone should read.
 */
export function weekOverWeekPct(jobs: RiderJob[], now: number): number | null {
  const end = startOfDay(now) + DAY_MS;
  const thisWeek = earnedBetween(jobs, end - 7 * DAY_MS, end);
  const lastWeek = earnedBetween(jobs, end - 14 * DAY_MS, end - 7 * DAY_MS);
  if (lastWeek <= 0) return null;
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
}

/**
 * Mean time from assignment to delivery over the last seven days.
 *
 * Assignment, not pickup: a shipment records when it was created and when it
 * last changed, and nothing in between, so pickup time does not exist to read.
 * That makes this "how long a job takes you", start to finish, which is the
 * honest reading of the design's "a drop".
 */
export function averageDropMs(jobs: RiderJob[], now: number): number | null {
  const since = startOfDay(now) - 6 * DAY_MS;
  const recent = delivered(jobs).filter(
    (j) => j.completedAt >= since && j.completedAt > j.assignedAt,
  );
  if (recent.length === 0) return null;
  const total = recent.reduce((s, j) => s + (j.completedAt - j.assignedAt), 0);
  return total / recent.length;
}

/** "8 min 40 s", "45 s", "1 h 5 min" — never "0 min". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** This calendar week, Sunday to Saturday, earnings per day. */
export function thisWeekByDay(
  jobs: RiderJob[],
  now: number,
): { label: string; value: number; isToday: boolean; future: boolean }[] {
  const weekStart = startOfWeek(now);
  const today = startOfDay(now);
  return WEEKDAY_SHORT.map((label, i) => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() + i);
    const s = start.getTime();
    const e = new Date(s);
    e.setDate(e.getDate() + 1);
    return {
      label,
      value: earnedBetween(jobs, s, e.getTime()),
      isToday: s === today,
      future: s > today,
    };
  });
}

/**
 * Deliveries in each week of this month, in the design's "Wk 1…" buckets.
 *
 * Calendar days 1–7, 8–14, 15–21 and 22 to the end, so the last bucket runs
 * seven to ten days. Four even buckets would split a 31-day month across a
 * fifth, nearly-empty week and make it look like a collapse.
 */
export function thisMonthByWeek(
  jobs: RiderJob[],
  now: number,
): { label: string; count: number; days: number }[] {
  const monthStart = new Date(startOfMonth(now));
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const bounds = [1, 8, 15, 22].map((day) => {
    const d = new Date(monthStart);
    d.setDate(day);
    return d.getTime();
  });
  return bounds.map((start, i) => {
    const end = bounds[i + 1] ?? nextMonth.getTime();
    return {
      label: `Wk ${i + 1}`,
      count: countBetween(jobs, start, end),
      days: Math.round((end - start) / DAY_MS),
    };
  });
}

/**
 * What a delivery has paid this rider recently: the mean fee over the last 30
 * days. Null with no deliveries in that window — the pace below cannot be
 * worked out from nothing, and a guessed rate would be a promise.
 */
export function averageFee(jobs: RiderJob[], now: number): number | null {
  const since = startOfDay(now) - 29 * DAY_MS;
  const recent = delivered(jobs).filter((j) => j.completedAt >= since);
  if (recent.length === 0) return null;
  return recent.reduce((s, j) => s + j.fee, 0) / recent.length;
}

export interface TargetPlan {
  earned: number;
  remaining: number;
  hit: boolean;
  /** Days left in the week, today included. */
  daysLeft: number;
  /** "Thu–Sat", or a single day on Saturday. */
  daysLabel: string;
  /** Deliveries a day to close the gap, or null when there is no rate yet. */
  perDay: number | null;
  /** 0–100, earned against the target. */
  pct: number;
}

/**
 * The weekly earnings target, turned into deliveries a day.
 *
 * Today counts as a day left: until midnight, today's deliveries still count
 * toward the week, so leaving it out would overstate the pace needed.
 */
export function targetPlan(
  target: number,
  jobs: RiderJob[],
  now: number,
): TargetPlan {
  const weekStart = startOfWeek(now);
  const earned = earnedBetween(jobs, weekStart, weekStart + 7 * DAY_MS);
  const remaining = Math.max(0, target - earned);
  const todayIndex = new Date(now).getDay();
  const daysLeft = 7 - todayIndex;
  const fee = averageFee(jobs, now);
  const first = WEEKDAY_SHORT[todayIndex]!;
  return {
    earned,
    remaining,
    hit: target > 0 && remaining === 0,
    daysLeft,
    daysLabel: daysLeft === 1 ? first : `${first}–Sat`,
    perDay:
      fee === null || fee <= 0
        ? null
        : Math.max(1, Math.ceil(remaining / daysLeft / fee)),
    pct:
      target <= 0 ? 0 : Math.min(100, Math.round((earned / target) * 100)),
  };
}

/** When the customer was promised their order. Null without an order time. */
export function dropBy(orderDate: number | null): number | null {
  return orderDate === null ? null : orderDate + PROMISE_MINUTES * 60 * 1000;
}

/**
 * The drop-by clock: "4:12" left, or how late it is once past.
 *
 * Late is reported rather than clamped to 0:00. A clock stuck at zero looks
 * broken; one that says "3:05 late" tells the rider something true.
 */
export function clockTo(
  deadline: number,
  now: number,
): { label: string; late: boolean } {
  const diff = deadline - now;
  const late = diff < 0;
  const secs = Math.floor(Math.abs(diff) / 1000);
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, "0");
  return { label: `${m}:${s}`, late };
}
