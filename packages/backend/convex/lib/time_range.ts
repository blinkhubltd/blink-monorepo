/**
 * Dashboard period resolution.
 *
 * `data/insights.ts` contains THREE separate implementations of this — an inline
 * switch, a local `getDateRange`, and a `computeDateRange` — which is how
 * "this week" can mean different things on two widgets of the same page. This is
 * the one that new code uses.
 *
 * Pure, and `now` is a parameter: a period boundary is exactly the kind of logic
 * that is untestable once it reads the clock itself.
 */

export const timeRanges = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
  "all",
] as const;

export type TimeRangeKey = (typeof timeRanges)[number];

export interface Period {
  /** Inclusive start, epoch ms. 0 for "all". */
  start: number;
  /** Inclusive end, epoch ms. */
  end: number;
  /**
   * The immediately preceding window of the same length, for period-over-period
   * comparison. Null for "all", which has nothing to compare against.
   */
  previous: { start: number; end: number } | null;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Sunday-based, matching the existing implementations in insights.ts. */
function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function startOfYear(ms: number): number {
  return new Date(new Date(ms).getFullYear(), 0, 1).getTime();
}

/**
 * Resolves a period key against a supplied `now`.
 *
 * Calendar arithmetic goes through Date rather than fixed millisecond offsets, so
 * "last month" is the previous CALENDAR month rather than 30 days back — the two
 * disagree by up to three days, which is the difference between a February
 * comparison being right and being nonsense.
 */
export function resolvePeriod(key: TimeRangeKey, now: number): Period {
  switch (key) {
    case "today": {
      const start = startOfDay(now);
      return {
        start,
        end: endOfDay(now),
        previous: { start: start - DAY, end: start - 1 },
      };
    }
    case "yesterday": {
      const start = startOfDay(now - DAY);
      return {
        start,
        end: endOfDay(now - DAY),
        previous: { start: start - DAY, end: start - 1 },
      };
    }
    case "thisWeek": {
      const start = startOfWeek(now);
      return {
        start,
        end: endOfDay(now),
        previous: { start: start - 7 * DAY, end: start - 1 },
      };
    }
    case "lastWeek": {
      const thisWeek = startOfWeek(now);
      const start = thisWeek - 7 * DAY;
      return {
        start,
        end: thisWeek - 1,
        previous: { start: start - 7 * DAY, end: start - 1 },
      };
    }
    case "thisMonth": {
      const start = startOfMonth(now);
      const d = new Date(start);
      const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      return {
        start,
        end: endOfDay(now),
        previous: { start: prevStart, end: start - 1 },
      };
    }
    case "lastMonth": {
      const d = new Date(startOfMonth(now));
      const start = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      const prevStart = new Date(d.getFullYear(), d.getMonth() - 2, 1).getTime();
      return {
        start,
        end: d.getTime() - 1,
        previous: { start: prevStart, end: start - 1 },
      };
    }
    case "thisYear": {
      const start = startOfYear(now);
      const year = new Date(start).getFullYear();
      return {
        start,
        end: endOfDay(now),
        previous: {
          start: new Date(year - 1, 0, 1).getTime(),
          end: start - 1,
        },
      };
    }
    case "lastYear": {
      const year = new Date(startOfYear(now)).getFullYear();
      const start = new Date(year - 1, 0, 1).getTime();
      return {
        start,
        end: new Date(year, 0, 1).getTime() - 1,
        previous: {
          start: new Date(year - 2, 0, 1).getTime(),
          end: start - 1,
        },
      };
    }
    case "all":
      // No previous window: there is nothing before "everything", and inventing
      // one would render a growth figure against zero.
      return { start: 0, end: endOfDay(now), previous: null };
  }
}

/** "2026-08-25" in local time, the key charts bucket by. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Every day in the period, as keys, oldest first.
 *
 * Charts need the gaps: a day with no orders must appear as zero rather than
 * being skipped, or the x-axis compresses and the trend line lies about its
 * slope. Capped because "all" would otherwise enumerate from 1970.
 */
export function dayKeysInPeriod(period: Period, maxDays = 120): string[] {
  const start = period.start === 0 ? period.end - 29 * DAY : period.start;
  const keys: string[] = [];
  for (let t = startOfDay(start); t <= period.end && keys.length < maxDays; t += DAY) {
    keys.push(dayKey(t));
  }
  return keys;
}
