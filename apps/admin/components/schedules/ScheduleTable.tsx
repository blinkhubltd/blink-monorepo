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
import { cn, getConvexErrorMessage } from "@/lib/utils";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import type { ScheduleWithDetails, DayOfWeek } from "./types";
import { Id } from "@repo/backend/dataModel";
import { formatTimeOfDay } from "@/lib/date-utils";
import {
  DAYS_OF_WEEK,
  formatMinutes,
  shiftMinutes,
  summariseSchedule,
} from "./schedule-metrics";

interface ScheduleTableProps {
  onEditSchedule?: (schedule: ScheduleWithDetails) => void;
}

/**
 * Role badges use the shared Badge variants rather than hand-mixed colours.
 *
 * The previous map was `bg-blue-400 text-yellow-400` for riders and
 * `bg-gray-800 text-yellow-300` for hub managers — blue is not in the Blink
 * palette at all, yellow-on-blue-400 is about 1.6:1 contrast, and every value
 * was a light-mode literal that bypassed the theme.
 *
 * Day chips are no longer coloured per weekday either: seven arbitrary hues
 * carried no information, and the only thing worth distinguishing is worked
 * versus not worked.
 */
function roleVariant(role: string | undefined) {
  const normalised = role?.trim().toLowerCase();
  if (normalised === "rider") return "default" as const;
  if (normalised === "picker") return "secondary" as const;
  return "outline" as const;
}

export function ScheduleTable({ onEditSchedule }: ScheduleTableProps) {
  const { schedules, vendors } = useDashboardData();
  const allRoles = useQuery(api.user.roles.getAllRoles, {}) ?? [];
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");

  const deleteSchedule = useMutation(api.data.schedules.deleteSchedule);

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

  const renderWeeklySchedule = (weeklySchedule: any) => (
    <div className="flex flex-wrap gap-1">
      {DAYS_OF_WEEK.map((day) => {
        const entry = weeklySchedule?.[day];
        const span = shiftMinutes(entry);
        const worked = Boolean(entry?.enabled);
        const broken = worked && span === null;

        return (
          <Badge
            key={day}
            variant={broken ? "destructive" : worked ? "secondary" : "outline"}
            className={cn("text-xs", !worked && "text-muted-foreground/60")}
            title={
              broken
                ? `${day}: times could not be read`
                : worked
                  ? `${day}: ${formatTimeOfDay(entry.startTime)}–${formatTimeOfDay(entry.endTime)} (${formatMinutes(span ?? 0)})`
                  : `${day}: not working`
            }
          >
            {day.slice(0, 3)}
          </Badge>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={Search} className="text-muted-foreground size-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <HugeiconsIcon icon={Search} className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Vendor Filter */}
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                <SelectTrigger>
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
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {getUniqueRoles().map((role) => (
                    <SelectItem key={role} value={role!}>
                      <Badge variant={roleVariant(role)}>
                        {role?.replace(/_/g, " ")}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Results Count */}
            <div className="space-y-2">
              <Label>Results</Label>
              <div className="bg-muted/40 flex h-9 items-center rounded-md border px-3">
                <span className="text-sm font-medium tabular-nums">
                  {filteredSchedules.length} schedule
                  {filteredSchedules.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={Calendar} className="text-muted-foreground size-4" />
            Staff Schedules ({filteredSchedules.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {filteredSchedules.length === 0 ? (
            <div className="text-center py-12">
              <HugeiconsIcon icon={Calendar} className="text-muted-foreground/40 mx-auto size-12" />
              <h3 className="mt-4 text-base font-semibold">
                No schedules found
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                No schedules match your current filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      Staff Member
                    </TableHead>
                    <TableHead>
                      Role
                    </TableHead>
                    <TableHead>
                      Vendor
                    </TableHead>
                    <TableHead>
                      Weekly Schedule
                    </TableHead>
                    <TableHead>
                      Working Days
                    </TableHead>
                    <TableHead>
                      Total Hours/Week
                    </TableHead>
                    <TableHead className="text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((schedule: ScheduleWithDetails) => {
                    const summary = summariseSchedule(schedule);

                    return (
                      <TableRow
                        key={schedule._id}
                        
                      >
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <div className="bg-muted grid size-9 shrink-0 place-items-center rounded-full">
                              <HugeiconsIcon icon={User} className="text-muted-foreground size-4" />
                            </div>
                            <div>
                              <div className="font-medium">
                                {schedule.user?.name || "Unknown"}
                              </div>
                              <div className="text-muted-foreground text-sm">
                                {schedule.user?.email}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleVariant(schedule.user?.role)}>
                            {schedule.user?.role?.replace(/_/g, " ") ?? "No role"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {schedule.vendor ? (
                              <>
                                <HugeiconsIcon icon={Building} className="text-muted-foreground size-4" />
                                <span className="text-sm font-medium tabular-nums">
                                  {schedule.vendor.name}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground text-sm italic">
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
                            <span className="text-sm font-medium tabular-nums">
                              {summary.workingDays}/7
                            </span>
                            {summary.overnightDays.length > 0 ? (
                              <span
                                className="text-muted-foreground text-xs"
                                title={`Crosses midnight: ${summary.overnightDays.join(", ")}`}
                              >
                                overnight
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {/* Malformed days are named rather than folded into
                              the total as zero, which is what the old
                              try/catch did. */}
                          {summary.malformedDays.length > 0 ? (
                            <Badge
                              variant="destructive"
                              title={`Unreadable times on ${summary.malformedDays.join(", ")}`}
                            >
                              Check times
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="tabular-nums">
                              {formatMinutes(summary.minutes)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                
                              >
                                <HugeiconsIcon icon={MoreVertical} className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {onEditSchedule && (
                                <DropdownMenuItem
                                  onClick={() => onEditSchedule(schedule)}
                                  
                                >
                                  <HugeiconsIcon icon={Edit} className="size-4" />
                                  Edit
                                </DropdownMenuItem>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <HugeiconsIcon icon={Trash2} className="size-4" />
                                    <span>Delete</span>
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete Schedule
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete the
                                      schedule for{" "}
                                      <strong className="text-foreground">
                                        {schedule.user?.name}
                                      </strong>
                                      ? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeleteSchedule(schedule._id)
                                      }
                                      
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
