"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BuildingIcon as Building,
  Calendar03Icon as Calendar,
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle,
  Clock01Icon as Clock,
  Delete02Icon as Trash2,
  EditIcon as Edit,
  MoreVerticalIcon as MoreVertical,
  Search01Icon as Search,
  User02Icon as User,
} from "@hugeicons/core-free-icons";
import React, { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Badge } from "@repo/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import type { ScheduleWithDetails, DayOfWeek } from "./types";
import { Id } from "@repo/backend/dataModel";
import { formatTimeOfDay } from "@/lib/date-utils";

interface ScheduleTableProps {
  onEditSchedule?: (schedule: ScheduleWithDetails) => void;
}

// Color schemes for days and roles
const dayColors: Record<DayOfWeek, string> = {
  Monday: "bg-red-100 text-red-800 border-red-200",
  Tuesday: "bg-orange-100 text-orange-800 border-orange-200",
  Wednesday: "bg-amber-100 text-amber-800 border-amber-200",
  Thursday: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Friday: "bg-lime-100 text-lime-800 border-lime-200",
  Saturday: "bg-blue-100 text-blue-800 border-blue-200",
  Sunday: "bg-purple-100 text-purple-800 border-purple-200",
};

const roleColors: Record<string, string> = {
  rider: "bg-blue-400 text-yellow-400 border-yellow-400",
  picker: "bg-blue-600 text-white border-blue-700",
  "hub manager": "bg-gray-800 text-yellow-300 border-yellow-300",
};

const getRoleBadgeClass = (role?: string) =>
  role
    ? roleColors[role.trim().toLowerCase()] || "bg-gray-100 text-gray-800"
    : "bg-gray-100 text-gray-800";

export function ScheduleTable({ onEditSchedule }: ScheduleTableProps) {
  const { schedules, vendors } = useDashboardData();
  const allRoles = useQuery(api.user.roles.getAllRoles, {}) ?? [];
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");

  const deleteSchedule = useMutation(api.data.schedules.deleteSchedule);

  const daysOfWeek: DayOfWeek[] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const filteredSchedules = useMemo(() => {
    if (!schedules) return [];

    return schedules.filter((schedule: ScheduleWithDetails) => {
      const matchesSearch =
        !searchTerm ||
        schedule.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        schedule.user?.email
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        schedule.vendor?.name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesVendor =
        selectedVendor === "all" ||
        (selectedVendor === "none" && !schedule.vendorId) ||
        schedule.vendorId === selectedVendor;

      const matchesRole =
        selectedRole === "all" || schedule.user?.role === selectedRole;

      return matchesSearch && matchesVendor && matchesRole;
    });
  }, [schedules, searchTerm, selectedVendor, selectedRole]);

  const handleDeleteSchedule = async (scheduleId: Id<"schedules">) => {
    try {
      await deleteSchedule({ id: scheduleId });
      toast.success("Schedule deleted successfully");
    } catch (error) {
      console.error("Error deleting schedule:", error);
      toast.error(getConvexErrorMessage(error, "Failed to delete schedule"));
    }
  };


  const getUniqueRoles = () => {
    const roles = new Set(
      allRoles
        .map((role: any) => role.name)
        .filter((name: any) => name.trim().toUpperCase() !== "CUSTOMER"),
    );
    return Array.from(roles) as string[];
  };

  const renderWeeklySchedule = (weeklySchedule: any) => {
    return (
      <div className="flex flex-wrap gap-1">
        {daysOfWeek.map((day) => {
          const daySchedule = weeklySchedule?.[day];
          if (!daySchedule?.enabled) {
            return (
              <Badge
                key={day}
                variant="outline"
                className="bg-gray-100 text-gray-400 border-gray-300 text-xs"
              >
                {day.slice(0, 3)}
              </Badge>
            );
          }
          return (
            <Badge
              key={day}
              variant="outline"
              className={`${dayColors[day]} text-xs`}
              title={`${formatTimeOfDay(daySchedule.startTime)} - ${formatTimeOfDay(daySchedule.endTime)}`}
            >
              {day.slice(0, 3)}
            </Badge>
          );
        })}
      </div>
    );
  };

  const getWorkingDaysCount = (weeklySchedule: any) => {
    if (!weeklySchedule) return 0;
    return Object.values(weeklySchedule).filter((day: any) => day?.enabled)
      .length;
  };

  const getTotalWeeklyHours = (weeklySchedule: any) => {
    if (!weeklySchedule) return 0;

    let totalHours = 0;
    Object.values(weeklySchedule).forEach((day: any) => {
      if (day?.enabled && day.startTime && day.endTime) {
        try {
          const [startHours, startMinutes] = day.startTime
            .split(":")
            .map(Number);
          const [endHours, endMinutes] = day.endTime.split(":").map(Number);
          const startMinuteTotal = startHours * 60 + startMinutes;
          const endMinuteTotal = endHours * 60 + endMinutes;
          const durationHours = (endMinuteTotal - startMinuteTotal) / 60;
          totalHours += durationHours;
        } catch {
          // Skip invalid time formats
        }
      }
    });

    return totalHours;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900">
            <HugeiconsIcon icon={Search} className="h-5 w-5 text-gray-600" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label className="text-black font-medium">Search</Label>
              <div className="relative">
                <HugeiconsIcon icon={Search} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-gray-300 focus:border-gray-500 focus:ring-gray-500"
                />
              </div>
            </div>

            {/* Vendor Filter */}
            <div className="space-y-2">
              <Label className="text-black font-medium">Vendor</Label>
              <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                <SelectTrigger className="border-gray-300 focus:border-gray-500 focus:ring-gray-500">
                  <SelectValue placeholder="All vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vendors</SelectItem>
                  <SelectItem value="none">No Vendor</SelectItem>
                  {vendors?.map((vendor) => (
                    <SelectItem key={vendor._id} value={vendor._id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role Filter */}
            <div className="space-y-2">
              <Label className="text-black font-medium">Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="border-gray-300 focus:border-gray-500 focus:ring-gray-500">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {getUniqueRoles().map((role) => (
                    <SelectItem key={role} value={role!}>
                      <Badge
                        variant="outline"
                        className={getRoleBadgeClass(role)}
                      >
                        {role?.replace("_", " ")}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Results Count */}
            <div className="space-y-2">
              <Label className="text-black font-medium">Results</Label>
              <div className="flex items-center h-10 px-3 border-2 border-gray-200 rounded-md">
                <span className="text-sm text-black font-medium">
                  {filteredSchedules.length} schedule
                  {filteredSchedules.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Table */}
      <Card className="border-2 border-gray-200 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-black">
            <HugeiconsIcon icon={Calendar} className="h-5 w-5 text-gray-900" />
            Staff Schedules ({filteredSchedules.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {filteredSchedules.length === 0 ? (
            <div className="text-center py-12">
              <HugeiconsIcon icon={Calendar} className="mx-auto h-16 w-16 text-gray-900" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                No schedules found
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                No schedules match your current filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200">
                    <TableHead className="text-black font-semibold">
                      Staff Member
                    </TableHead>
                    <TableHead className="text-black font-semibold">
                      Role
                    </TableHead>
                    <TableHead className="text-black font-semibold">
                      Vendor
                    </TableHead>
                    <TableHead className="text-black font-semibold">
                      Weekly Schedule
                    </TableHead>
                    <TableHead className="text-black font-semibold">
                      Working Days
                    </TableHead>
                    <TableHead className="text-black font-semibold">
                      Total Hours/Week
                    </TableHead>
                    <TableHead className="text-right text-black font-semibold">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((schedule: ScheduleWithDetails) => {
                    const workingDays = getWorkingDaysCount(
                      schedule.weeklySchedule,
                    );
                    const totalHours = getTotalWeeklyHours(
                      schedule.weeklySchedule,
                    );

                    return (
                      <TableRow
                        key={schedule._id}
                        className="border-gray-100 hover:bg-gray-50/50"
                      >
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center shadow-md">
                              <HugeiconsIcon icon={User} className="h-5 w-5 text-black" />
                            </div>
                            <div>
                              <div className="font-medium text-black">
                                {schedule.user?.name || "Unknown"}
                              </div>
                              <div className="text-sm text-gray-600">
                                {schedule.user?.email}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getRoleBadgeClass(schedule.user?.role)}
                          >
                            {schedule.user?.role?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {schedule.vendor ? (
                              <>
                                <HugeiconsIcon icon={Building} className="h-4 w-4 text-gray-900" />
                                <span className="text-sm text-black font-medium">
                                  {schedule.vendor.name}
                                </span>
                              </>
                            ) : (
                              <span className="text-sm text-gray-500 italic">
                                No vendor
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {renderWeeklySchedule(schedule.weeklySchedule)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <HugeiconsIcon icon={CheckCircle} className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium text-black">
                              {workingDays}/7 days
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-gray-800">
                            {totalHours.toFixed(1)}h
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-black hover:bg-gray-100"
                              >
                                <HugeiconsIcon icon={MoreVertical} className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {onEditSchedule && (
                                <DropdownMenuItem
                                  onClick={() => onEditSchedule(schedule)}
                                  className="hover:bg-gray-50"
                                >
                                  <HugeiconsIcon icon={Edit} className="h-4 w-4 mr-2 text-blue-600" />
                                  Edit
                                </DropdownMenuItem>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    className="hover:bg-red-50 focus:bg-red-50"
                                  >
                                    <HugeiconsIcon icon={Trash2} className="h-4 w-4 mr-2 text-red-600" />
                                    <span className="text-red-600">Delete</span>
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="border-2 border-gray-200">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-black">
                                      Delete Schedule
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete the
                                      schedule for{" "}
                                      <strong className="text-black">
                                        {schedule.user?.name}
                                      </strong>
                                      ? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="border-gray-300 text-black hover:bg-gray-50">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeleteSchedule(schedule._id)
                                      }
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
