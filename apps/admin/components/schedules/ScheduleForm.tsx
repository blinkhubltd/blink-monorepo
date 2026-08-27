"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BuildingIcon as Building,
  Calendar03Icon as Calendar,
  Clock01Icon as Clock,
  UserGroupIcon as Users,
  ZapIcon as Zap,
} from "@hugeicons/core-free-icons";
import React, { useState, useEffect, useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Separator } from "@repo/ui/components/ui/separator";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import type {
  DayOfWeek,
  ScheduleFormData,
  BulkScheduleFormData,
  User,
  Vendor,
  WeeklySchedule,
  DaySchedule,
} from "./types";
import { Id } from "@repo/backend/dataModel";

interface ScheduleFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: Partial<ScheduleFormData>;
}

const daysOfWeek: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Role badges use the shared Badge variants; days are not colour-coded.
 *
 * What this replaces: a seven-hue per-weekday map (Monday red, Tuesday orange,
 * Wednesday amber…) and role colours mixing `bg-blue-600` with
 * `text-yellow-400`. The day hues carried no information — a day is either
 * worked or not, and which weekday it is, is already written on it. The role
 * colours were not Blink palette values and several pairings fell under 2:1
 * contrast. Every value was a light-mode literal, so both palettes broke in
 * dark mode.
 */
function roleVariant(role: string | undefined) {
  const normalised = role?.trim().toLowerCase();
  if (normalised === "rider") return "default" as const;
  if (normalised === "picker") return "secondary" as const;
  return "outline" as const;
}

export function ScheduleForm({
  onSuccess,
  onCancel,
  initialData,
}: ScheduleFormProps) {
  const { vendors } = useDashboardData();
  const [isLoading, setIsLoading] = useState(false);

  // Form mode
  const [mode, setMode] = useState<"individual" | "bulk">("individual");

  // Individual schedule form
  const [selectedUser, setSelectedUser] = useState<string>("none-selected");
  const [selectedVendor, setSelectedVendor] = useState<string>("all-vendors");
  const [selectedRole, setSelectedRole] = useState<string>("none-selected");

  // Bulk schedule form
  const [bulkVendor, setBulkVendor] = useState<string>("none-selected");
  const [bulkRole, setBulkRole] = useState<string>("none-selected");
  const [selectedStaff, setSelectedStaff] = useState<Id<"users">[]>([]);

  // Schedule data
  const [scheduleData, setScheduleData] = useState<WeeklySchedule>({});

  // Time range mode
  const [useTimeRange, setUseTimeRange] = useState(false);
  const [dayRange, setDayRange] = useState<{
    start: DayOfWeek | "none-selected";
    end: DayOfWeek | "none-selected";
  }>({
    start: "none-selected",
    end: "none-selected",
  });
  const [commonStartTime, setCommonStartTime] = useState("09:00");
  const [commonEndTime, setCommonEndTime] = useState("17:00");

  // Queries
  const vendorStaff = useQuery(
    api.user.users.getVendorStaff,
    selectedVendor !== "all-vendors" &&
      selectedVendor !== "none-selected" &&
      selectedRole !== "none-selected"
      ? {
          vendorId: selectedVendor as Id<"vendors">,
          roleName: selectedRole,
        }
      : "skip",
  );

  const bulkVendorStaff = useQuery(
    api.data.schedules.getVendorStaffWithSchedules,
    bulkVendor !== "none-selected" && bulkRole !== "none-selected"
      ? { vendorId: bulkVendor as Id<"vendors">, role: bulkRole }
      : "skip",
  );

  const allRoles = useQuery(api.user.roles.getAllRoles, {}) ?? [];
  const staffRoles = useMemo(
    () =>
      allRoles
        .map((role: any) => role.name)
        .filter((name: any) => name.trim().toUpperCase() !== "CUSTOMER"),
    [allRoles],
  );

  // Mutations
  const createOrUpdateSchedule = useMutation(
    api.data.schedules.createOrUpdateSchedule,
  );
  const createBulkSchedules = useMutation(api.data.schedules.createBulkSchedules);

  // Initialize form with initial data
  useEffect(() => {
    if (initialData) {
      if (initialData.userId) setSelectedUser(initialData.userId);
      if (initialData.vendorId) setSelectedVendor(initialData.vendorId);
      if (initialData.weeklySchedule) {
        setScheduleData(initialData.weeklySchedule);
      }
    }
  }, [initialData]);

  // Auto-select days in range
  useEffect(() => {
    if (
      useTimeRange &&
      dayRange.start !== "none-selected" &&
      dayRange.end !== "none-selected"
    ) {
      const startIndex = daysOfWeek.indexOf(dayRange.start as DayOfWeek);
      const endIndex = daysOfWeek.indexOf(dayRange.end as DayOfWeek);

      if (startIndex !== -1 && endIndex !== -1) {
        const newScheduleData = { ...scheduleData };

        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);

        // Auto-select checkboxes for days in range
        for (let i = start; i <= end; i++) {
          const day = daysOfWeek[i];
          // start/end come from the two day selects, so the range is only as
          // trustworthy as those; skipping beats writing an `undefined` key.
          if (!day) continue;
          newScheduleData[day] = {
            startTime: commonStartTime,
            endTime: commonEndTime,
            enabled: true,
          };
        }

        setScheduleData(newScheduleData);
      }
    }
  }, [dayRange, commonStartTime, commonEndTime, useTimeRange]);

  const handleDayScheduleChange = (
    day: DayOfWeek,
    field: "startTime" | "endTime",
    value: string,
  ) => {
    setScheduleData((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
        enabled: prev[day]?.enabled ?? false,
      },
    }));
  };

  const toggleDayEnabled = (day: DayOfWeek, enabled: boolean) => {
    setScheduleData((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        startTime: prev[day]?.startTime ?? "09:00",
        endTime: prev[day]?.endTime ?? "17:00",
        enabled,
      },
    }));
  };

  const handleStaffSelection = (userId: Id<"users">, checked: boolean) => {
    if (checked) {
      setSelectedStaff((prev) => [...prev, userId]);
    } else {
      setSelectedStaff((prev) => prev.filter((id) => id !== userId));
    }
  };

  const selectAllStaff = () => {
    if (bulkVendorStaff) {
      setSelectedStaff(bulkVendorStaff.map((staff: any) => staff._id));
    }
  };

  const deselectAllStaff = () => {
    setSelectedStaff([]);
  };

  const validateForm = () => {
    const enabledDays = Object.entries(scheduleData).filter(
      ([_, data]) => data?.enabled,
    );

    if (enabledDays.length === 0) {
      toast.error("Please select at least one day and time");
      return false;
    }

    for (const [day, data] of enabledDays) {
      if (!data?.startTime || !data?.endTime) {
        toast.error(`Please set both start and end time for ${day}`);
        return false;
      }

      if (data.startTime >= data.endTime) {
        toast.error(`End time must be after start time for ${day}`);
        return false;
      }
    }

    if (mode === "individual" && selectedUser === "none-selected") {
      toast.error("Please select a staff member");
      return false;
    }

    if (mode === "bulk" && selectedStaff.length === 0) {
      toast.error("Please select at least one staff member");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      // Filter enabled days and format for submission
      const weeklySchedule: WeeklySchedule = {};
      Object.entries(scheduleData).forEach(([day, data]) => {
        if (data?.enabled) {
          weeklySchedule[day as DayOfWeek] = {
            startTime: data.startTime,
            endTime: data.endTime,
            enabled: true,
          };
        }
      });

      if (mode === "individual") {
        await createOrUpdateSchedule({
          userId: selectedUser as Id<"users">,
          vendorId:
            selectedVendor !== "all-vendors" &&
            selectedVendor !== "none-selected"
              ? (selectedVendor as Id<"vendors">)
              : undefined,
          weeklySchedule,
        });
        toast.success("Schedule created/updated successfully!");
      } else {
        const result = await createBulkSchedules({
          userIds: selectedStaff,
          vendorId:
            bulkVendor !== "none-selected"
              ? (bulkVendor as Id<"vendors">)
              : undefined,
          weeklySchedule,
        });

        if (result.errors.length > 0) {
          toast.warning(
            `Created/updated ${result.created + result.updated} schedules. ${result.errors.length} errors found.`,
          );
        } else {
          toast.success(
            `Successfully created/updated ${result.created + result.updated} schedules!`,
          );
        }
      }

      onSuccess?.();
    } catch (error) {
      console.error("Error creating schedule:", error);
      toast.error(getConvexErrorMessage(error, "Failed to create schedule"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-h-[80vh] overflow-y-auto">
      {/* Mode Selection */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <HugeiconsIcon icon={Users} className="h-5 w-5 text-muted-foreground" />
            Schedule Type
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Button
              variant={mode === "individual" ? "default" : "outline"}
              onClick={() => setMode("individual")}
              className={
                mode === "individual"
                  ? "bg-primary text-primary-foreground hover:bg-primary"
                  : "border-border text-foreground hover:bg-muted/40"
              }
            >
              <HugeiconsIcon icon={Zap} className="h-4 w-4 mr-2" />
              Individual Staff
            </Button>
            <Button
              variant={mode === "bulk" ? "default" : "outline"}
              onClick={() => setMode("bulk")}
              className={
                mode === "bulk"
                  ? "bg-primary text-primary-foreground hover:bg-primary"
                  : "border-border text-foreground hover:bg-muted/40"
              }
            >
              <HugeiconsIcon icon={Users} className="h-4 w-4 mr-2" />
              Multiple Staff
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Staff Selection */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <HugeiconsIcon icon={Building} className="h-5 w-5 text-muted-foreground" />
            {mode === "individual"
              ? "Select Staff Member"
              : "Select Staff Members"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {mode === "individual" ? (
            <>
              {/* Vendor Selection */}
              <div className="space-y-2">
                <Label className="text-foreground font-medium">
                  Vendor (Optional)
                </Label>
                <Select
                  value={selectedVendor}
                  onValueChange={setSelectedVendor}
                >
                  <SelectTrigger className="border-border focus:border-border focus:ring-gray-500">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[300px]">
                    <SelectItem value="all-vendors">All Vendors</SelectItem>
                    {vendors.map((vendor: Vendor) => (
                      <SelectItem key={vendor._id} value={vendor._id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Role Selection */}
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="border-border focus:border-border focus:ring-gray-500">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[300px]">
                    <SelectItem value="none-selected" disabled>
                      Select a role
                    </SelectItem>
                    {staffRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        <Badge variant={roleVariant(role)}>
                          {role.replace("_", " ")}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* User Selection */}
              {vendorStaff && (
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Staff Member</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger className="border-primary focus:border-primary focus:ring-yellow-500">
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent className="min-w-[400px]">
                      <SelectItem value="none-selected" disabled>
                        Select a staff member
                      </SelectItem>
                      {vendorStaff.map((user: User) => (
                        <SelectItem key={user._id} value={user._id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{user.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Bulk Vendor Selection */}
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Vendor</Label>
                <Select value={bulkVendor} onValueChange={setBulkVendor}>
                  <SelectTrigger className="border-primary focus:border-primary focus:ring-yellow-500">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[300px]">
                    <SelectItem value="none-selected" disabled>
                      Select a vendor
                    </SelectItem>
                    {vendors.map((vendor: Vendor) => (
                      <SelectItem key={vendor._id} value={vendor._id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bulk Role Selection */}
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Role</Label>
                <Select value={bulkRole} onValueChange={setBulkRole}>
                  <SelectTrigger className="border-primary focus:border-primary focus:ring-yellow-500">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[300px]">
                    <SelectItem value="none-selected" disabled>
                      Select a role
                    </SelectItem>
                    {staffRoles.map((role: any) => (
                      <SelectItem key={role} value={role}>
                        <Badge variant={roleVariant(role)}>
                          {role.replace("_", " ")}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Staff List */}
              {bulkVendorStaff && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-foreground font-medium">
                      Staff Members
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={selectAllStaff}
                        className="border-primary text-foreground hover:bg-primary/10"
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={deselectAllStaff}
                        className="text-destructive hover:bg-destructive/5"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg p-4 max-h-40 overflow-y-auto bg-muted/40">
                    {bulkVendorStaff.map((user: any) => (
                      <div
                        key={user._id}
                        className="flex items-center space-x-3 py-2 border-b last:border-b-0"
                      >
                        <Checkbox
                          id={user._id}
                          checked={selectedStaff.includes(user._id)}
                          onCheckedChange={(checked) =>
                            handleStaffSelection(user._id, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={user._id}
                          className="flex-1 cursor-pointer flex justify-between items-center"
                        >
                          <span className="text-foreground font-medium">
                            {user.name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {user.email}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground p-2 rounded">
                    {selectedStaff.length} of {bulkVendorStaff.length} staff
                    selected
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Time Range Option */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <HugeiconsIcon icon={Calendar} className="h-5 w-5 text-muted-foreground" />
            Quick Schedule Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="useTimeRange"
              checked={useTimeRange}
              onCheckedChange={(checked) => setUseTimeRange(checked === true)}
            />
            <Label htmlFor="useTimeRange" className="text-foreground font-medium">
              Set same schedule for a range of days
            </Label>
          </div>

          {useTimeRange && (
            <div className="flex flex-col md:grid-cols-4 gap-4 rounded-lg border p-2">
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Start Day</Label>
                <Select
                  value={dayRange.start}
                  onValueChange={(value) =>
                    setDayRange((prev) => ({
                      ...prev,
                      start: value as DayOfWeek,
                    }))
                  }
                >
                  <SelectTrigger className="border-border focus:border-border">
                    <SelectValue placeholder="Start day" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[150px]">
                    <SelectItem value="none-selected" disabled>
                      Select start day
                    </SelectItem>
                    {daysOfWeek.map((day) => (
                      <SelectItem key={day} value={day}>
                        <Badge variant="secondary">
                          {day}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground font-medium">End Day</Label>
                <Select
                  value={dayRange.end}
                  onValueChange={(value) =>
                    setDayRange((prev) => ({
                      ...prev,
                      end: value as DayOfWeek,
                    }))
                  }
                >
                  <SelectTrigger className="border-border focus:border-border">
                    <SelectValue placeholder="End day" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[150px]">
                    <SelectItem value="none-selected" disabled>
                      Select end day
                    </SelectItem>
                    {daysOfWeek.map((day) => (
                      <SelectItem key={day} value={day}>
                        <Badge variant="secondary">
                          {day}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Start Time</Label>
                <Input
                  type="time"
                  value={commonStartTime}
                  onChange={(e) => setCommonStartTime(e.target.value)}
                  className="border-border focus:border-border focus:ring-gray-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground font-medium">End Time</Label>
                <Input
                  type="time"
                  value={commonEndTime}
                  onChange={(e) => setCommonEndTime(e.target.value)}
                  className="border-border focus:border-border focus:ring-gray-500"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Day Schedules */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <HugeiconsIcon icon={Clock} className="h-5 w-5 text-muted-foreground" />
            Weekly Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {daysOfWeek.map((day) => (
            <div
              key={day}
              className="flex items-center space-x-4 p-4 border border-border rounded-lg bg-muted/40"
            >
              <Checkbox
                id={day}
                checked={scheduleData[day]?.enabled ?? false}
                onCheckedChange={(checked) =>
                  toggleDayEnabled(day, checked as boolean)
                }
              />
              <div className="min-w-[120px]">
                <Badge variant="secondary" className="px-3 py-1 text-sm">
                  {day}
                </Badge>
              </div>
              <div className="flex space-x-3 flex-1 items-center">
                <div className="flex flex-col space-y-1">
                  <Label className="text-xs text-muted-foreground">Start Time</Label>
                  <Input
                    type="time"
                    value={scheduleData[day]?.startTime ?? ""}
                    onChange={(e) =>
                      handleDayScheduleChange(day, "startTime", e.target.value)
                    }
                    disabled={!scheduleData[day]?.enabled}
                    className="w-32 border-border focus:border-border focus:ring-gray-500"
                  />
                </div>
                <span className="self-center text-muted-foreground mt-4">to</span>
                <div className="flex flex-col space-y-1">
                  <Label className="text-xs text-muted-foreground">End Time</Label>
                  <Input
                    type="time"
                    value={scheduleData[day]?.endTime ?? ""}
                    onChange={(e) =>
                      handleDayScheduleChange(day, "endTime", e.target.value)
                    }
                    disabled={!scheduleData[day]?.enabled}
                    className="w-32 border-border focus:border-border focus:ring-gray-500"
                  />
                </div>
              </div>
              {scheduleData[day]?.enabled &&
                scheduleData[day]?.startTime &&
                scheduleData[day]?.endTime && (
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 border-primary"
                  >
                    {scheduleData[day]?.startTime} -{" "}
                    {scheduleData[day]?.endTime}
                  </Badge>
                )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4 pt-4">
        {onCancel && (
          <Button
            variant="outline"
            onClick={onCancel}
            className="border-border text-foreground hover:bg-muted/40"
          >
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={isLoading}
          className="bg-primary text-primary-foreground hover:bg-primary border-border"
        >
          {isLoading ? "Creating..." : "Create Schedule"}
        </Button>
      </div>
    </div>
  );
}
