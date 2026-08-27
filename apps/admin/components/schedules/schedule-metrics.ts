import type { DayOfWeek, DaySchedule, ScheduleWithDetails } from "./types";

/**
 * The numbers the schedules screens report.
 *
 * ── Why this is separate, and what was wrong ──────────────────────────────
 *
 * The page computed weekly hours inline, and three things about it were wrong in
 * ways that produce a plausible number rather than an error:
 *
 *  1. a `try/catch` around the parse that swallowed the error. A malformed time
 *     silently contributed nothing, so a schedule with one bad day reported
 *     fewer hours than it has, and no one could tell.
 *
 *  2. An overnight shift — 22:00 to 06:00, which riders work — gives
 *     `end - start = -16` hours, and that NEGATIVE value was added to the total.
 *     A hub running nights reported less than zero hours for those staff and
 *     dragged the average down.
 *
 *  3. Staff whose every day was disabled were excluded from the denominator
 *     (`if (weeklyHours > 0)`), so "average weekly hours" silently meant
 *     "average among people who actually work", which is a different and much
 *     more flattering figure.
 *
 * Pure and exported so the arithmetic is testable without mounting a page —
 * these are exactly the cases nobody clicks through by hand.
 */

export const DAYS_OF_WEEK: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Minutes since midnight, or null if the string is not `HH:MM`. */
export function parseTimeOfDay(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * How long a shift lasts, in minutes.
 *
 * An end at or before the start is treated as crossing midnight and wrapping to
 * the next day, because that is what a night shift is — 22:00 to 06:00 is eight
 * hours, not minus sixteen. Returns null when either time is unparseable, so the
 * caller decides whether that is a skip or a problem, rather than the arithmetic
 * quietly deciding it is zero.
 */
export function shiftMinutes(day: DaySchedule | undefined): number | null {
  if (!day?.enabled) return null;
  const start = parseTimeOfDay(day.startTime);
  const end = parseTimeOfDay(day.endTime);
  if (start === null || end === null) return null;
  if (end === start) return 0;
  return end > start ? end - start : 24 * 60 - start + end;
}

export interface ScheduleSummary {
  /** Enabled days with a parseable start and end. */
  workingDays: number;
  /** Total minutes across the week. */
  minutes: number;
  /** Enabled days whose times could not be read — surfaced, never swallowed. */
  malformedDays: DayOfWeek[];
  /** Days that wrap past midnight. */
  overnightDays: DayOfWeek[];
}

export function summariseSchedule(
  schedule: Pick<ScheduleWithDetails, "weeklySchedule">,
): ScheduleSummary {
  let minutes = 0;
  let workingDays = 0;
  const malformedDays: DayOfWeek[] = [];
  const overnightDays: DayOfWeek[] = [];

  for (const day of DAYS_OF_WEEK) {
    const entry = schedule.weeklySchedule?.[day];
    if (!entry?.enabled) continue;

    const span = shiftMinutes(entry);
    if (span === null) {
      malformedDays.push(day);
      continue;
    }

    const start = parseTimeOfDay(entry.startTime);
    const end = parseTimeOfDay(entry.endTime);
    if (start !== null && end !== null && end <= start && span > 0) {
      overnightDays.push(day);
    }

    minutes += span;
    workingDays++;
  }

  return { workingDays, minutes, malformedDays, overnightDays };
}

export interface ScheduleStats {
  total: number;
  staff: number;
  vendors: number;
  /** Mean weekly hours across EVERY schedule, including zero-hour ones. */
  averageWeeklyHours: number;
  /** Schedules with at least one enabled day. */
  scheduledStaff: number;
  /** Schedules where every day is off. */
  emptySchedules: number;
  /** Schedules containing a day whose times could not be parsed. */
  malformedSchedules: number;
  /** Enabled-day count per weekday, for the coverage view. */
  perDay: Record<DayOfWeek, number>;
  /** Weekdays with nobody rostered at all. */
  uncoveredDays: DayOfWeek[];
}

export function computeScheduleStats(
  schedules: ScheduleWithDetails[],
): ScheduleStats {
  const perDay = Object.fromEntries(
    DAYS_OF_WEEK.map((d) => [d, 0]),
  ) as Record<DayOfWeek, number>;

  let totalMinutes = 0;
  let scheduledStaff = 0;
  let emptySchedules = 0;
  let malformedSchedules = 0;

  for (const schedule of schedules) {
    const summary = summariseSchedule(schedule);
    totalMinutes += summary.minutes;

    if (summary.malformedDays.length > 0) malformedSchedules++;
    if (summary.workingDays === 0) emptySchedules++;
    else scheduledStaff++;

    for (const day of DAYS_OF_WEEK) {
      if (schedule.weeklySchedule?.[day]?.enabled) perDay[day]++;
    }
  }

  return {
    total: schedules.length,
    staff: new Set(schedules.map((s) => s.userId)).size,
    vendors: new Set(schedules.map((s) => s.vendorId).filter(Boolean)).size,
    // Divided by EVERY schedule, not only the non-empty ones. The old figure
    // excluded zero-hour schedules from the denominator, so adding an unrostered
    // staff member could not move it — which is the opposite of what someone
    // reading "average weekly hours" would expect.
    averageWeeklyHours:
      schedules.length > 0 ? totalMinutes / 60 / schedules.length : 0,
    scheduledStaff,
    emptySchedules,
    malformedSchedules,
    perDay,
    uncoveredDays: DAYS_OF_WEEK.filter((d) => perDay[d] === 0),
  };
}

/** "8h 30m", or "—" for nothing. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
