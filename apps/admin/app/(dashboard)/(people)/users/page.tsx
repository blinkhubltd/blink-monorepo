"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChartBarLineIcon as BarChart3,
  ShieldUserIcon as Shield,
  UserCheckIcon as UserCheck,
  UserGroupIcon as UsersIcon,
} from "@hugeicons/core-free-icons";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { UsersTable, type UsersPagination } from "@/components/users";
import { Button } from "@repo/ui/components/ui/button";
import { toast } from "sonner";
import type { Id } from "@repo/backend/dataModel";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { getConvexErrorMessage } from "@/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const DEFAULT_PAGE_SIZE = 10;

/**
 * Which role this page lists. `/users` is Customers; the sidebar's Riders link
 * is `/users?role=rider`. Anything unrecognised falls back to Customer rather
 * than passing an arbitrary string to `getUsers`, so a mistyped URL shows the
 * customer list, not an empty table or every account.
 */
const LISTABLE_ROLES = { rider: "Rider" } as const;

export default function UsersPage() {
  const searchParams = useSearchParams();
  const roleParam = (searchParams.get("role") ?? "").toLowerCase();
  const roleName =
    roleParam in LISTABLE_ROLES
      ? LISTABLE_ROLES[roleParam as keyof typeof LISTABLE_ROLES]
      : "Customer";
  const isCustomers = roleName === "Customer";
  const {
    can,
    isLoading: permissionsLoading,
    isAdminUser,
  } = useCurrentUserPermissions();
  const canReadUsers = permissionsLoading || can("users:READ");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  // Same component instance serves /users and /users?role=rider, so the
  // cursor and search from one list must not carry into the other.
  useEffect(() => {
    setCurrentPage(1);
    setCursor(null);
    setCursorHistory([null]);
    setSearchQuery("");
  }, [roleName]);

  const usersQuery = useQuery(
    api.user.users.getUsers,
    canReadUsers
      ? {
          limit: pageSize,
          cursor,
          search: debouncedSearchQuery.trim()
            ? debouncedSearchQuery
            : undefined,
          // This is the "Customers" page in the nav (`/users`) — Staff has
          // its own page and its own query (`getAllStaff`), and Riders,
          // Agents and Vendors likewise. Without this the table showed every
          // account on the platform, super admins included, under a heading
          // that said "Customers".
          role: roleName,
        }
      : "skip",
  );

  const allUsersQuery = useQuery(
    api.user.users.getAllUsersForManagement,
    canReadUsers ? {} : "skip",
  );
  const allRoles = useQuery(api.user.roles.getAllRoles, canReadUsers ? {} : "skip");

  const updateUserStatusMutation = useMutation(api.user.users.updateUserStatus);
  const backfillUsersSearchText = useMutation(
    api.user.users.backfillUsersSearchText,
  );

  useEffect(() => {
    setCursor(null);
    setCurrentPage(1);
    setCursorHistory([null]);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (!usersQuery || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      usersQuery.data.some((u: any) => !u.searchText) ||
      (debouncedSearchQuery.trim().length > 0 &&
        usersQuery.pagination.total > 0 &&
        usersQuery.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    backfillUsersSearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.success("Search index updated", {
            description: `Updated ${updatedCount} users for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill users searchText:", error);
      });
  }, [
    usersQuery,
    hasTriggeredSearchBackfill,
    debouncedSearchQuery,
    backfillUsersSearchText,
  ]);

  const handleUpdateUserStatus = useCallback(
    async (userId: Id<"users">, status: "Active" | "Inactive") => {
      try {
        await updateUserStatusMutation({ userId, status });
        toast.success(`User ${status.toLowerCase()}`);
      } catch (error) {
        console.error("Error updating user status:", error);
        toast.error(
          getConvexErrorMessage(error, "Failed to update user status"),
        );
      }
    },
    [updateUserStatusMutation],
  );

  const handlePageChange = useCallback(
    (_page: number, direction: "first" | "prev" | "next" | "last") => {
      if (!usersQuery) return;

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
          if (usersQuery.pagination.hasNext) {
            const newCursor = usersQuery.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage((prev) => prev + 1);
          }
          break;
        case "last":
          if (usersQuery.pagination.totalPages > 0) {
            const newCursor = usersQuery.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage(usersQuery.pagination.totalPages);
          }
          break;
      }
    },
    [usersQuery, currentPage, cursorHistory],
  );

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
    setCursor(null);
    setCursorHistory([null]);
  }, []);

  // ── Stats from dynamic roles ──
  const stats = useMemo(() => {
    if (!allUsersQuery || !allRoles) return null;

    const rolesMap = new Map<string, string>();
    allRoles.forEach((r: { _id: string; name: string }) =>
      rolesMap.set(r._id, r.name.trim().toLowerCase()),
    );

    // Scoped to the role this page lists — the table is, so the cards above
    // it must be too, or a Riders page reports platform-wide totals.
    const wanted = roleName.toLowerCase();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let total = 0;
    let activeCount = 0;
    let withVendorCount = 0;
    let joinedThisMonth = 0;

    for (const user of allUsersQuery as any[]) {
      const userRole = user.role_id ? rolesMap.get(user.role_id) : undefined;
      if (userRole !== wanted) continue;
      total++;
      if ((user.status || "Active") === "Active") activeCount++;
      if (user.rider_details?.vendor_id) withVendorCount++;
      if (user._creationTime >= monthStart.getTime()) joinedThisMonth++;
    }

    return {
      total,
      active: activeCount,
      inactive: total - activeCount,
      withVendor: withVendorCount,
      joinedThisMonth,
    };
  }, [allUsersQuery, allRoles, roleName]);

  const pagination: UsersPagination | undefined = usersQuery
    ? {
        hasNext: usersQuery.pagination.hasNext,
        hasPrevious: currentPage > 1,
        totalPages: usersQuery.pagination.totalPages,
        currentPage,
        pageSize,
        total: usersQuery.pagination.total,
        cursor: usersQuery.pagination.cursor,
      }
    : undefined;

  const isLoading = usersQuery === undefined || allUsersQuery === undefined;

  if (!permissionsLoading && !can("users:READ")) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You don&apos;t have permission to view users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {isCustomers ? "Customers" : `${roleName}s`}
          </h2>
          <p className="text-muted-foreground">
            {isCustomers
              ? "Customer accounts only. Promoting one to a role — rider, agent, staff — moves it off this list; manage it from that role's own page afterward."
              : `${roleName} accounts only.`}
          </p>
        </div>
        {isAdminUser && (
          <Link href="/users/insights">
            <Button variant="outline" size="sm">
              <HugeiconsIcon icon={BarChart3} className="w-4 h-4 mr-2" />
              View Insights
            </Button>
          </Link>
        )}
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total {roleName}s
              </CardTitle>
              <HugeiconsIcon icon={UsersIcon} className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                {roleName} accounts on the platform
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Inactive {roleName}s
              </CardTitle>
              <HugeiconsIcon icon={Shield} className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inactive}</div>
              <p className="text-xs text-muted-foreground">
                Deactivated or not yet active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active {roleName}s
              </CardTitle>
              <HugeiconsIcon icon={UserCheck} className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0
                  ? `${Math.round((stats.active / stats.total) * 100)}% of total`
                  : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {isCustomers ? "Joined this month" : "Assigned to a vendor"}
              </CardTitle>
              <HugeiconsIcon icon={Shield} className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isCustomers ? stats.joinedThisMonth : stats.withVendor}
              </div>
              <p className="text-xs text-muted-foreground">
                {isCustomers
                  ? "New sign-ups since the 1st"
                  : `${stats.total - stats.withVendor} with no vendor yet`}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isCustomers ? "All Customers" : `All ${roleName}s`}</CardTitle>
          <CardDescription>
            Change a role here to promote a customer. Riders and pickers are
            managed in their own sections once promoted.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 pb-6">
            <UsersTable
              users={usersQuery?.data || []}
              allUsers={allUsersQuery || []}
              isLoading={isLoading}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
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
