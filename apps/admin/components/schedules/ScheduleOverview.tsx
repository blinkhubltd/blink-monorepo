"use client";

import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Building01Icon,
  Clock01Icon,
  User02Icon,
} from "@hugeicons/core-free-icons";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { formatTimeOfDay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { DayOfWeek, DaySchedule, ScheduleWithDetails } from "./types";
import {
  DAYS_OF_WEEK,
  computeScheduleStats,
  formatMinutes,
  shiftMinutes,
} from "./schedule-metrics";

/**
 * The week, as a coverage board.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 *  - "Previous Week" and "Next Week" buttons that had no handler. They could not
 *    have worked: a schedule here is a RECURRING weekly template with no dates
 *    on it, so there is no previous week to navigate to. Removed rather than
 *    wired, because the concept does not exist in the data.
 *
 *  - A per-day rainbow — Monday red, Tuesday orange, Wednesday amber — carrying
 *    no information, in `-50`/`-200` shades that only exist in light mode. Days
 *    are now coloured by whether they are covered, which is the one thing about
 *    a day worth seeing at a glance.
 *
 *  - `opacity-75` on weekends, dimming real rosters for no reason. Weekends are
 *    marked, not faded.
 *
 *  - Role badges as `bg-black text-yellow-400` and similar: hand-mixed brand
 *    approximations that bypass the theme. Now `variant` on the shared Badge.
 *
 *  - Four summary cards duplicating the page's own stat row, one of which
 *    ("Busiest Day") reduced the whole board to a single word already visible in
 *    it. Replaced by a coverage gap warning, which is the actionable read.
 */

interface ScheduleOverviewProps {
  vendorId?: string;
  staffRole?: string;
}

/** Riders and pickers are the roles a hub rosters; anything else is staff. */
function roleVariant(role: string | undefined) {
  const normalised = role?.trim().toUpperCase();
  if (normalised === "RIDER") return "default" as const;
  if (normalised === "PICKER") return "secondary" as const;
  return "outline" as const;
}

export function ScheduleOverview({ vendorId, staffRole }: ScheduleOverviewProps) {
  const { schedules, vendors } = useDashboardData();

  const filtered = useMemo<ScheduleWithDetails[]>(() => {
    if (!schedules) return [];
    return schedules.filter((schedule: ScheduleWithDetails) => {
      const matchesVendor = !vendorId || schedule.vendorId === vendorId;
      const matchesRole = !staffRole || schedule.user?.role === staffRole;
      return matchesVendor && matchesRole;
    });
  }, [schedules, vendorId, staffRole]);

  const byDay = useMemo(() => {
    const grouped = Object.fromEntries(
      DAYS_OF_WEEK.map((d) => [d, [] as { schedule: ScheduleWithDetails; day: DaySchedule }[]]),
    ) as Record<DayOfWeek, { schedule: ScheduleWithDetails; day: DaySchedule }[]>;

    for (const schedule of filtered) {
      for (const day of DAYS_OF_WEEK) {
        const entry = schedule.weeklySchedule?.[day];
        if (entry?.enabled) grouped[day].push({ schedule, day: entry });
      }
    }

    for (const day of DAYS_OF_WEEK) {
      // Sorted by start time, with unparseable times last rather than throwing.
      // `localeCompare` on a possibly-undefined startTime is what the previous
      // version did, and it crashes the render on a malformed row.
      grouped[day].sort((a, b) => {
        const left = a.day.startTime ?? "";
        const right = b.day.startTime ?? "";
        if (!left) return 1;
        if (!right) return -1;
        return left.localeCompare(right);
      });
    }

    return grouped;
  }, [filtered]);

  const stats = useMemo(() => computeScheduleStats(filtered), [filtered]);
  const selectedVendor = vendors?.find((v) => v._id === vendorId);
  const busiest = Math.max(1, ...DAYS_OF_WEEK.map((d) => byDay[d].length));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {selectedVendor ? (
          <Badge variant="secondary" className="gap-1.5">
            <HugeiconsIcon icon={Building01Icon} className="size-3" />
            {selectedVendor.name}
          </Badge>
        ) : null}
        {staffRole ? (
          <Badge variant={roleVariant(staffRole)}>
            {staffRole.replace(/_/g, " ")}
          </Badge>
        ) : null}
        <span className="text-muted-foreground text-sm">
          {stats.total} recurring {stats.total === 1 ? "schedule" : "schedules"}
          {" · "}
          {stats.staff} {stats.staff === 1 ? "person" : "people"}
        </span>
      </div>

      {/*
        The one genuinely actionable read on this screen: days with nobody
        rostered. Shown only when there is a gap, so it does not become
        furniture people stop seeing.
      */}
      {stats.total > 0 && stats.uncoveredDays.length > 0 ? (
        <div className="border-warning bg-warning/5 flex items-start gap-2 rounded-lg border p-3">
          <HugeiconsIcon
            icon={Alert02Icon}
            className="text-warning mt-0.5 size-4 shrink-0"
          />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">
              {stats.uncoveredDays.length === 7
                ? "Nobody is rostered on any day"
                : `No cover on ${stats.uncoveredDays.join(", ")}`}
            </p>
            <p className="text-muted-foreground">
              Orders placed on those days have no assigned staff.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {DAYS_OF_WEEK.map((day) => {
          const entries = byDay[day];
          const isWeekend = day === "Saturday" || day === "Sunday";
          const empty = entries.length === 0;

          return (
            <Card
              key={day}
              className={cn(
                "gap-0 py-3",
                // Coloured by MEANING: an uncovered day is the thing worth
                // noticing, not which day of the week it happens to be.
                empty && stats.total > 0 && "border-warning/40 bg-warning/5",
              )}
            >
              <CardHeader className="px-3 pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    {day.slice(0, 3)}
                    {isWeekend ? (
                      <span className="text-muted-foreground text-xs font-normal">
                        wknd
                      </span>
                    ) : null}
                  </span>
                  <Badge
                    variant={empty ? "outline" : "secondary"}
                    className="tabular-nums"
                  >
                    {entries.length}
                  </Badge>
                </CardTitle>
                {/*
                  A proportional bar per day, so the shape of the week reads
                  across the row without comparing seven numbers.
                */}
                <div className="bg-muted h-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-[width]"
                    style={{ width: `${(entries.length / busiest) * 100}%` }}
                  />
                </div>
              </CardHeader>

              <CardContent className="px-3 pt-1">
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {empty ? (
                    <p className="text-muted-foreground py-4 text-center text-xs">
                      No cover
                    </p>
                  ) : (
                    entries.map(({ schedule, day: entry }) => {
                      const span = shiftMinutes(entry);
                      return (
                        <div
                          key={`${schedule._id}-${day}`}
                          className="bg-card space-y-1.5 rounded-lg border p-2.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <HugeiconsIcon
                              icon={User02Icon}
                              className="text-muted-foreground size-3 shrink-0"
                            />
                            <span className="truncate text-xs font-medium">
                              {schedule.user?.name ?? "Unassigned"}
                            </span>
                          </div>

                          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            <HugeiconsIcon
                              icon={Clock01Icon}
                              className="size-3 shrink-0"
                            />
                            {span === null ? (
                              // Surfaced rather than rendered as a blank or a
                              // zero — a malformed time is a data problem
                              // someone has to fix.
                              <span className="text-destructive">
                                Invalid times
                              </span>
                            ) : (
                              <span className="tabular-nums">
                                {formatTimeOfDay(entry.startTime)}–
                                {formatTimeOfDay(entry.endTime)}
                                <span className="ml-1 opacity-70">
                                  ({formatMinutes(span)})
                                </span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-1">
                            {schedule.user?.role ? (
                              <Badge
                                variant={roleVariant(schedule.user.role)}
                                className="text-[10px]"
                              >
                                {schedule.user.role.replace(/_/g, " ")}
                              </Badge>
                            ) : (
                              <span />
                            )}
                            {schedule.vendor ? (
                              <span
                                className="text-muted-foreground max-w-[80px] truncate text-[10px]"
                                title={schedule.vendor.name}
                              >
                                {schedule.vendor.name}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {stats.total === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No schedules yet</CardTitle>
            <CardDescription>
              Create one to roster a rider, picker or hub manager onto specific
              days and hours.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
