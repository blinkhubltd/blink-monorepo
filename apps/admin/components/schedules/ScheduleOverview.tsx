"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon as ChevronLeft,
  ArrowRight01Icon as ChevronRight,
  BuildingIcon as Building,
  Calendar03Icon as Calendar,
  Clock01Icon as Clock,
  User02Icon as User,
} from "@hugeicons/core-free-icons";
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import type { ScheduleWithDetails, DayOfWeek } from "./types";
import { formatTimeOfDay } from "@/lib/date-utils";

const daysOfWeek: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Color schemes matching the main components
const dayColors: Record<DayOfWeek, string> = {
  Monday: "bg-red-50 border-red-200",
  Tuesday: "bg-orange-50 border-orange-200",
  Wednesday: "bg-amber-50 border-amber-200",
  Thursday: "bg-emerald-50 border-emerald-200",
  Friday: "bg-lime-50 border-lime-200",
  Saturday: "bg-blue-50 border-blue-200",
  Sunday: "bg-purple-50 border-purple-200",
};

const roleColors: Record<string, string> = {
  RIDER: "bg-black text-yellow-400 border-yellow-400",
  PICKER: "bg-yellow-400 text-black border-yellow-500",
  "HUB MANAGER": "bg-gray-800 text-yellow-300 border-yellow-300",
};

interface ScheduleOverviewProps {
  vendorId?: string;
  staffRole?: string;
}

export function ScheduleOverview({
  vendorId,
  staffRole,
}: ScheduleOverviewProps) {
  const { schedules, vendors } = useDashboardData();

  // Filter schedules based on props
  const filteredSchedules = useMemo(() => {
    if (!schedules) return [];

    return schedules.filter((schedule: ScheduleWithDetails) => {
      const matchesVendor = !vendorId || schedule.vendorId === vendorId;
      const matchesRole = !staffRole || schedule.user?.role === staffRole;
      return matchesVendor && matchesRole;
    });
  }, [schedules, vendorId, staffRole]);

  // Transform schedules to show each staff member for each day they work
  const schedulesByDay = useMemo(() => {
    const grouped: {
      [key in DayOfWeek]: Array<{
        schedule: ScheduleWithDetails;
        dayData: any;
      }>;
    } = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: [],
    };

    filteredSchedules.forEach((schedule: ScheduleWithDetails) => {
      if (schedule.weeklySchedule) {
        Object.entries(schedule.weeklySchedule).forEach(([day, dayData]) => {
          if (dayData?.enabled && daysOfWeek.includes(day as DayOfWeek)) {
            grouped[day as DayOfWeek].push({ schedule, dayData });
          }
        });
      }
    });

    // Sort schedules within each day by start time
    Object.keys(grouped).forEach((day) => {
      grouped[day as DayOfWeek].sort((a, b) =>
        a.dayData.startTime.localeCompare(b.dayData.startTime)
      );
    });

    return grouped;
  }, [filteredSchedules]);


  const selectedVendor = vendors?.find((v) => v._id === vendorId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Calendar} className="h-5 w-5 text-yellow-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Weekly Schedule Overview
            </h2>
          </div>
          {selectedVendor && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 border-gray-300"
            >
              <HugeiconsIcon icon={Building} className="h-3 w-3" />
              {selectedVendor.name}
            </Badge>
          )}
          {staffRole && (
            <Badge
              variant="outline"
              className={roleColors[staffRole] || "bg-gray-100"}
            >
              {staffRole.replace("_", " ")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <HugeiconsIcon icon={ChevronLeft} className="h-4 w-4" />
            Previous Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <HugeiconsIcon icon={ChevronRight} className="h-4 w-4" />
            Next Week
          </Button>
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {daysOfWeek.map((day) => {
          const daySchedules = schedulesByDay[day];
          const isWeekend = day === "Saturday" || day === "Sunday";

          return (
            <Card
              key={day}
              className={`border ${dayColors[day]} ${isWeekend ? "opacity-75" : ""}`}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span
                    className={`font-bold ${isWeekend ? "text-gray-700" : "text-gray-900"}`}
                  >
                    {day}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-xs border-gray-300 text-gray-700 bg-gray-100"
                  >
                    {daySchedules.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {daySchedules.length === 0 ? (
                    <div className="text-center py-6 text-gray-400">
                      <HugeiconsIcon icon={Clock} className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-xs">No schedules</p>
                    </div>
                  ) : (
                    daySchedules.map(({ schedule, dayData }, index) => (
                      <div
                        key={`${schedule._id}-${day}`}
                        className="p-3 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <HugeiconsIcon icon={User} className="h-3 w-3 text-yellow-600" />
                          <span className="text-xs font-medium truncate text-black">
                            {schedule.user?.name || "Unknown"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mb-2">
                          <HugeiconsIcon icon={Clock} className="h-3 w-3 text-yellow-600" />
                          <span className="text-xs font-mono text-gray-700">
                            {formatTimeOfDay(dayData.startTime)} -{" "}
                            {formatTimeOfDay(dayData.endTime)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className={`text-xs ${roleColors[schedule.user?.role || ""] || "bg-gray-100 text-gray-800"}`}
                          >
                            {schedule.user?.role?.replace("_", " ")}
                          </Badge>
                          {schedule.vendor && (
                            <div className="flex items-center gap-1">
                              <HugeiconsIcon icon={Building} className="h-3 w-3 text-yellow-600" />
                              <span
                                className="text-xs text-gray-600 truncate max-w-16"
                                title={schedule.vendor.name}
                              >
                                {schedule.vendor.name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-900">
              Total Schedules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {filteredSchedules.length}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-900">
              Active Staff
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {new Set(filteredSchedules.map((s) => s.userId)).size}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-900">Busiest Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-gray-900">
              {daysOfWeek.reduce(
                (busiest, day) =>
                  schedulesByDay[day].length > schedulesByDay[busiest].length
                    ? day
                    : busiest,
                "Monday"
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-900">Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-gray-900">
              {
                daysOfWeek.filter((day) => schedulesByDay[day].length > 0)
                  .length
              }
              /7 days
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
