"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BuildingIcon as Building,
  Calendar03Icon as Calendar,
  Clock01Icon as Clock,
  Grid2X2Icon as Grid3x3,
  PlusSignIcon as Plus,
  TableIcon as Table,
  UserGroupIcon as Users,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import {
  ScheduleForm,
  ScheduleTable,
  ScheduleOverview,
  type ScheduleWithDetails,
} from "@/components/schedules";
import { useDashboardData } from "@/providers/DashboardDataProvider";

export default function SchedulesPage() {
  const { schedules, vendors, isLoaded } = useDashboardData();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<ScheduleWithDetails | null>(null);
  const [activeTab, setActiveTab] = useState("table");

  // Calculate some stats
  const totalSchedules = schedules?.length || 0;
  const uniqueStaff = new Set(
    schedules?.map((s: ScheduleWithDetails) => s.userId)
  ).size;
  const vendorsWithSchedules = new Set(
    schedules
      ?.filter((s: ScheduleWithDetails) => s.vendorId)
      .map((s: ScheduleWithDetails) => s.vendorId)
  ).size;

  // Calculate average working hours per week
  const averageWeeklyHours = React.useMemo(() => {
    if (!schedules || schedules.length === 0) return 0;

    let totalHours = 0;
    let staffCount = 0;

    schedules.forEach((schedule: ScheduleWithDetails) => {
      if (schedule.weeklySchedule) {
        let weeklyHours = 0;
        Object.values(schedule.weeklySchedule).forEach((day: any) => {
          if (day?.enabled && day.startTime && day.endTime) {
            try {
              const [startHours, startMinutes] = day.startTime
                .split(":")
                .map(Number);
              const [endHours, endMinutes] = day.endTime.split(":").map(Number);
              const startMinuteTotal = startHours * 60 + startMinutes;
              const endMinuteTotal = endHours * 60 + endMinutes;
              const durationHours = (endMinuteTotal - startMinuteTotal) / 60;
              weeklyHours += durationHours;
            } catch (error) {
              // Skip invalid time formats
            }
          }
        });
        if (weeklyHours > 0) {
          totalHours += weeklyHours;
          staffCount++;
        }
      }
    });

    return staffCount > 0 ? totalHours / staffCount : 0;
  }, [schedules]);

  const handleCreateSuccess = () => {
    setShowCreateDialog(false);
  };

  const handleEditSchedule = (schedule: ScheduleWithDetails) => {
    setEditingSchedule(schedule);
  };

  const handleEditSuccess = () => {
    setEditingSchedule(null);
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading schedules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black">
            Staff Schedules
          </h1>
          <p className="text-gray-600 mt-1">
            Manage working schedules for riders, pickers, and hub managers
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-black hover:bg-gray-800 text-yellow-400 border-black"
        >
          <HugeiconsIcon icon={Plus} className="h-4 w-4 mr-2" />
          Create Schedule
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-900">
              Total Schedules
            </CardTitle>
            <HugeiconsIcon icon={Calendar} className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">
              {totalSchedules}
            </div>
            <p className="text-xs text-gray-600">Across all staff members</p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-900">
              Staff with Schedules
            </CardTitle>
            <HugeiconsIcon icon={Users} className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">{uniqueStaff}</div>
            <p className="text-xs text-gray-600">Individual staff members</p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-900">
              Active Vendors
            </CardTitle>
            <HugeiconsIcon icon={Building} className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">
              {vendorsWithSchedules}
            </div>
            <p className="text-xs text-gray-600">
              Of {vendors?.length || 0} total vendors
            </p>
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-900">
              Avg Weekly Hours
            </CardTitle>
            <HugeiconsIcon icon={Clock} className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {averageWeeklyHours.toFixed(1)}
            </div>
            <p className="text-xs text-gray-600">Hours per staff member</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Quick Actions</CardTitle>
          <CardDescription className="text-gray-600">
            Common schedule management tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(true)}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <HugeiconsIcon icon={Plus} className="h-4 w-4 mr-2" />
              Add Individual Schedule
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(true)}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <HugeiconsIcon icon={Users} className="h-4 w-4 mr-2" />
              Bulk Schedule Setup
            </Button>
            <Button
              variant="outline"
              onClick={() => setActiveTab("overview")}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <HugeiconsIcon icon={Grid3x3} className="h-4 w-4 mr-2" />
              View Weekly Overview
            </Button>
            <Button
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <HugeiconsIcon icon={Clock} className="h-4 w-4 mr-2" />
              Generate Time Reports
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content with Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2 bg-gray-100 border border-gray-200">
          <TabsTrigger
            value="table"
            className="data-[state=active]:bg-white data-[state=active]:text-gray-900 text-gray-600"
          >
            <HugeiconsIcon icon={Table} className="h-4 w-4 mr-2" />
            Schedule Table
          </TabsTrigger>
          <TabsTrigger
            value="overview"
            className="data-[state=active]:bg-white data-[state=active]:text-gray-900 text-gray-600"
          >
            <HugeiconsIcon icon={Grid3x3} className="h-4 w-4 mr-2" />
            Weekly Overview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="space-y-6">
          <ScheduleTable onEditSchedule={handleEditSchedule} />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <ScheduleOverview />
        </TabsContent>
      </Tabs>

      {/* Create Schedule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-full max-h-[95vh] overflow-y-auto border border-gray-200">
          <DialogHeader className="-m-6 p-6 mb-4 border-b border-gray-100">
            <DialogTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <HugeiconsIcon icon={Calendar} className="h-6 w-6 text-gray-800" />
              Create New Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="px-2">
            <ScheduleForm
              onSuccess={handleCreateSuccess}
              onCancel={() => setShowCreateDialog(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Schedule Dialog */}
      <Dialog
        open={!!editingSchedule}
        onOpenChange={() => setEditingSchedule(null)}
      >
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] overflow-y-auto border border-gray-200">
          <DialogHeader className="-m-6 p-6 mb-4 border-b border-gray-100">
            <DialogTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <HugeiconsIcon icon={Calendar} className="h-6 w-6 text-yellow-600" />
              Edit Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="px-2">
            {editingSchedule && (
              <ScheduleForm
                initialData={{
                  userId: editingSchedule.userId,
                  vendorId: editingSchedule.vendorId,
                  weeklySchedule: editingSchedule.weeklySchedule,
                }}
                onSuccess={handleEditSuccess}
                onCancel={() => setEditingSchedule(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
