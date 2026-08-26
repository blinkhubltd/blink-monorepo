"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffTable } from "@/components/staff/StaffTable";
import { User, UsersPagination } from "@/components/users/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { api } from "@repo/backend";
import { useQuery, useMutation } from "convex/react";

export default function StaffPage() {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);

  // Fetch paginated staff data
  const staffResult = useQuery(api.user.users.getAllStaff, {
    limit: pageSize,
    cursor,
  });

  // Fetch all staff for filtering/insights
  const allStaff =
    useQuery(api.user.users.getAllStaff, {
      limit: 1000,
      cursor: null,
    })?.data ?? [];

  // Table data and pagination
  const staff = staffResult?.data ?? [];
  const pagination: UsersPagination = {
    hasNext: staffResult?.pagination.hasNext ?? false,
    hasPrevious: currentPage > 1,
    totalPages: staffResult?.pagination.totalPages ?? 1,
    currentPage: currentPage,
    pageSize: pageSize,
    total: staffResult?.pagination.total ?? 0,
    cursor: staffResult?.pagination.cursor ?? null,
  };

  // Handlers for table operations
  const updateUserStatus = useMutation(api.user.users.updateUserStatus);

  const handleUpdateUserStatus = useCallback(
    async (userId: User["_id"], status: "Active" | "Inactive") => {
      try {
        await updateUserStatus({ userId, status });
        toast.success(`Staff ${status.toLowerCase()}`);
      } catch (error) {
        console.error("Error updating staff status:", error);
        toast.error(
          getConvexErrorMessage(error, "Failed to update staff status"),
        );
      }
    },
    [updateUserStatus],
  );

  const handlePageChange = useCallback(
    (page: number, direction: "first" | "prev" | "next" | "last") => {
      if (!staffResult) return;

      switch (direction) {
        case "first":
          setCurrentPage(1);
          setCursor(null);
          setCursorHistory([null]);
          break;
        case "prev":
          if (currentPage > 1) {
            const newCurrentPage = currentPage - 1;
            setCurrentPage(newCurrentPage);
            const newCursor = cursorHistory[newCurrentPage - 1];
            setCursor(newCursor ?? null);
            setCursorHistory(cursorHistory.slice(0, newCurrentPage));
          }
          break;
        case "next":
          if (staffResult.pagination.hasNext) {
            const newCursor = staffResult.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage((prev) => prev + 1);
          }
          break;
        case "last":
          if (staffResult.pagination.totalPages > 0) {
            const newCursor = staffResult.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage(staffResult.pagination.totalPages);
          }
          break;
      }
    },
    [staffResult, currentPage, cursorHistory],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    setCursor(null);
    setCursorHistory([null]);
  }, []);

  // Insights
  const totalStaff = allStaff.length;
  const activeStaff = allStaff.filter(
    (s: { status?: string }) => s.status === "Active",
  ).length;
  const inactiveStaff = allStaff.filter(
    (s: { status?: string }) => s.status === "Inactive",
  ).length;
  const isLoading = !staffResult;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Staff Management
          </h2>
          <p className="text-muted-foreground">
            Manage staff roles and permissions across the platform
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            {/* You can add an icon here if desired */}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStaff}</div>
            <p className="text-xs text-muted-foreground">All staff roles</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeStaff}</div>
            <p className="text-xs text-muted-foreground">
              {totalStaff > 0
                ? Math.round((activeStaff / totalStaff) * 100)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Inactive Staff
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveStaff}</div>
            <p className="text-xs text-muted-foreground">
              {totalStaff > 0
                ? Math.round((inactiveStaff / totalStaff) * 100)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Staff</CardTitle>
          <CardDescription>
            Manage staff roles and permissions. Staff are distinct from users,
            riders, and pickers.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 pb-6">
            <StaffTable
              staff={staff}
              allStaff={allStaff}
              isLoading={isLoading}
              onUpdateUserStatus={handleUpdateUserStatus}
              pagination={pagination}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
