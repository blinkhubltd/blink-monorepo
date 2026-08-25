import { describe, expect, it } from "vitest";
import {
  formatWindow,
  isWithinShift,
  toMinutes,
  upcomingShifts,
  withWeekdayEnabled,
  type WeeklyScheduleDoc,
} from "../lib/data/shifts";

/** Wednesday 2026-08-26, 09:30 local. */
const WED_0930 = new Date(2026, 7, 26, 9, 30).getTime();

const SCHEDULE: WeeklyScheduleDoc = {
  Wednesday: { startTime: "07:00", endTime: "15:00", enabled: true },
  Thursday: { startTime: "14:00", endTime: "22:00", enabled: false },
  Saturday: { startTime: "22:00", endTime: "06:00", enabled: true },
};

describe("toMinutes", () => {
  it("parses a 24-hour time", () => {
    expect(toMinutes("07:30")).toBe(450);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("rejects nonsense rather than producing a number", () => {
    // startTime is a free-text string on the schedules table, so bad values are
    // reachable from the admin UI.
    expect(toMinutes("25:00")).toBeNull();
    expect(toMinutes("07:60")).toBeNull();
    expect(toMinutes("7am")).toBeNull();
    expect(toMinutes("")).toBeNull();
  });
});

describe("formatWindow", () => {
  it("uses an en dash, per the DS", () => {
    expect(
      formatWindow({ startTime: "07:00", endTime: "15:00", enabled: true }),
    ).toBe("07:00 – 15:00");
  });
});

describe("upcomingShifts", () => {
  it("labels today and tomorrow, then names the weekday", () => {
    const rows = upcomingShifts(SCHEDULE, "Westlands hub", WED_0930);
    expect(rows[0]).toMatchObject({
      dayLabel: "Today",
      weekday: "Wednesday",
      enabled: true,
    });
    expect(rows[1]).toMatchObject({
      dayLabel: "Tomorrow",
      weekday: "Thursday",
    });
    expect(rows[2]).toMatchObject({ dayLabel: "Saturday" });
  });

  it("omits days with no template entry instead of rendering a blank shift", () => {
    const rows = upcomingShifts(SCHEDULE, "Hub", WED_0930);
    expect(rows.map((r) => r.weekday)).toEqual([
      "Wednesday",
      "Thursday",
      "Saturday",
    ]);
    expect(rows).toHaveLength(3);
  });

  it("keys rows by weekday, because that is what a toggle edits", () => {
    // A date-based key would imply per-day state the backend does not hold.
    const rows = upcomingShifts(SCHEDULE, "Hub", WED_0930);
    expect(rows.map((r) => r.id)).toEqual([
      "Wednesday",
      "Thursday",
      "Saturday",
    ]);
  });

  it("carries the disabled flag through rather than hiding the row", () => {
    const thursday = upcomingShifts(SCHEDULE, "Hub", WED_0930).find(
      (r) => r.weekday === "Thursday",
    );
    expect(thursday?.enabled).toBe(false);
  });

  it("returns nothing when the crew member has no schedule", () => {
    expect(upcomingShifts(null, "Hub", WED_0930)).toEqual([]);
    expect(upcomingShifts(undefined, "Hub", WED_0930)).toEqual([]);
  });
});

describe("withWeekdayEnabled", () => {
  it("changes one day and leaves the rest identical", () => {
    const next = withWeekdayEnabled(SCHEDULE, "Thursday", true);
    expect(next.Thursday).toEqual({
      startTime: "14:00",
      endTime: "22:00",
      enabled: true,
    });
    expect(next.Wednesday).toEqual(SCHEDULE.Wednesday);
    expect(next.Saturday).toEqual(SCHEDULE.Saturday);
  });

  it("does not invent a day that has no window", () => {
    // createOrUpdateSchedule replaces the whole object, so adding a day here
    // would silently schedule a shift nobody rostered.
    const next = withWeekdayEnabled(SCHEDULE, "Monday", true);
    expect(next.Monday).toBeUndefined();
  });

  it("does not mutate the input", () => {
    withWeekdayEnabled(SCHEDULE, "Thursday", true);
    expect(SCHEDULE.Thursday?.enabled).toBe(false);
  });
});

describe("isWithinShift", () => {
  it("is true inside an enabled window", () => {
    expect(isWithinShift(SCHEDULE, WED_0930)).toBe(true);
  });

  it("is false before it opens and after it closes", () => {
    expect(isWithinShift(SCHEDULE, new Date(2026, 7, 26, 6, 59).getTime())).toBe(
      false,
    );
    expect(isWithinShift(SCHEDULE, new Date(2026, 7, 26, 15, 0).getTime())).toBe(
      false,
    );
  });

  it("is false for a disabled day even inside its hours", () => {
    // Thursday 15:00 is inside 14:00–22:00 but the day is switched off.
    expect(isWithinShift(SCHEDULE, new Date(2026, 7, 27, 15, 0).getTime())).toBe(
      false,
    );
  });

  it("handles a window that crosses midnight", () => {
    // Saturday 22:00 – 06:00. This is where these checks normally break.
    const satLate = new Date(2026, 7, 29, 23, 30).getTime();
    const sunEarly = new Date(2026, 7, 30, 5, 0).getTime();
    const sunLate = new Date(2026, 7, 30, 7, 0).getTime();
    expect(isWithinShift(SCHEDULE, satLate)).toBe(true);
    expect(isWithinShift(SCHEDULE, sunEarly)).toBe(true);
    expect(isWithinShift(SCHEDULE, sunLate)).toBe(false);
  });

  it("is false with no schedule", () => {
    expect(isWithinShift(null, WED_0930)).toBe(false);
  });
});
