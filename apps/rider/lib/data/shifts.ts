/**
 * Weekly shift template -> dated rows.
 *
 * The backend stores a schedule as a recurring weekly template: one optional
 * `{ startTime, endTime, enabled }` per weekday name. The design shows dated
 * rows — "Today", "Tomorrow", "Thursday". Turning one into the other needs a
 * date, so `now` is a parameter and nothing here reads the clock.
 *
 * Consequence worth stating: a rider cannot be shown a one-off shift, because
 * the data model cannot express one. Every row is the template projected onto a
 * date, and toggling a row edits the template for that weekday — i.e. it
 * changes every future occurrence, not just that day. The UI has to say so.
 */
import type { Shift } from "./types";

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

export interface DayWindow {
  startTime: string;
  endTime: string;
  enabled: boolean;
}

/** Matches the backend `weeklyShiftSchedule`: every day optional. */
export type WeeklyScheduleDoc = Partial<Record<WeekdayName, DayWindow>>;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(offset: number, weekday: WeekdayName): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return weekday;
}

export interface UpcomingShift extends Shift {
  /** The template key this row edits. */
  weekday: WeekdayName;
  /** Days from today, 0-indexed. */
  offset: number;
}

/**
 * The next `days` days as shift rows, today first.
 *
 * Days with no template entry are omitted rather than rendered as an empty
 * shift: the crew member is simply not scheduled, and a row reading "—" invites
 * the reading that data is missing.
 */
export function upcomingShifts(
  schedule: WeeklyScheduleDoc | null | undefined,
  hubName: string,
  now: number,
  days = 7,
): UpcomingShift[] {
  if (!schedule) return [];
  const today = startOfDay(now);
  const rows: UpcomingShift[] = [];

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(today + offset * DAY_MS);
    const weekday = WEEKDAY_NAMES[date.getDay()];
    if (!weekday) continue;
    const window = schedule[weekday];
    if (!window) continue;

    rows.push({
      // Keyed by weekday, not by date: the row edits the template entry, and a
      // date-based key would imply per-day state the backend does not hold.
      id: weekday,
      weekday,
      offset,
      dayLabel: dayLabel(offset, weekday),
      timeLabel: formatWindow(window),
      hubName,
      enabled: window.enabled,
    });
  }

  return rows;
}

/** "07:00 – 15:00", with an en dash per the DS. */
export function formatWindow(window: DayWindow): string {
  return `${window.startTime} – ${window.endTime}`;
}

/**
 * The template with one weekday toggled, ready to send back.
 *
 * `createOrUpdateSchedule` takes the whole `weeklySchedule` object, so a toggle
 * has to resend every day. Rebuilding it from the current template rather than
 * patching in place means a stale render cannot drop a day the crew member
 * never touched.
 */
export function withWeekdayEnabled(
  schedule: WeeklyScheduleDoc,
  weekday: WeekdayName,
  enabled: boolean,
): WeeklyScheduleDoc {
  const current = schedule[weekday];
  if (!current) return schedule;
  return { ...schedule, [weekday]: { ...current, enabled } };
}

/**
 * Whether the crew member is inside a scheduled window right now.
 *
 * Handles the overnight case (endTime before startTime, e.g. 22:00 – 06:00),
 * which is where this kind of check normally breaks.
 */
export function isWithinShift(
  schedule: WeeklyScheduleDoc | null | undefined,
  now: number,
): boolean {
  if (!schedule) return false;
  const d = new Date(now);
  const minutes = d.getHours() * 60 + d.getMinutes();

  const todayName = WEEKDAY_NAMES[d.getDay()];
  const yesterdayName = WEEKDAY_NAMES[(d.getDay() + 6) % 7];

  const today = todayName ? schedule[todayName] : undefined;
  if (today?.enabled) {
    const start = toMinutes(today.startTime);
    const end = toMinutes(today.endTime);
    if (start !== null && end !== null) {
      if (end > start && minutes >= start && minutes < end) return true;
      // Overnight window that began today and has not yet closed.
      if (end <= start && minutes >= start) return true;
    }
  }

  // An overnight window that began yesterday and closes this morning.
  const yesterday = yesterdayName ? schedule[yesterdayName] : undefined;
  if (yesterday?.enabled) {
    const start = toMinutes(yesterday.startTime);
    const end = toMinutes(yesterday.endTime);
    if (start !== null && end !== null && end <= start && minutes < end) {
      return true;
    }
  }

  return false;
}

/** "07:30" -> 450. Null for anything unparseable. */
export function toMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
