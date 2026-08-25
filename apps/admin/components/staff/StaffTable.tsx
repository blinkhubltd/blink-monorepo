"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  TableFilters,
  TablePagination,
  TableSkeleton,
} from "@/components/shared/table";
import { User, USER_STATUSES } from "../users/types";
import { createUsersTableColumns } from "../users/columns";
import { Id } from "@repo/backend/dataModel";
import { UsersPagination } from "../users/types";

export function StaffTable({
  staff,
  allStaff,
  isLoading = false,
  onUpdateUserStatus,
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  staff: User[];
  allStaff: User[];
  isLoading?: boolean;
  onUpdateUserStatus?: (
    userId: Id<"users">,
    status: "Active" | "Inactive",
  ) => Promise<void>;
  pagination?: UsersPagination;
  onPageChange?: (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  // Filter state
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch roles and vendors for the columns
  const allRoles = useQuery(api.user.roles.getAllRoles);
  const allVendors = useQuery(api.data.vendors.getAllVendors);

  const rolesMap = useMemo(() => {
    const map = new Map<string, string>();
    allRoles?.forEach((r: any) => map.set(r._id, r.name));
    return map;
  }, [allRoles]);

  const vendorsMap = useMemo(() => {
    const map = new Map<string, string>();
    allVendors?.forEach((v: any) => map.set(v._id, v.name));
    return map;
  }, [allVendors]);

  // Create columns with handlers
  const columns = useMemo(() => {
    if (!onUpdateUserStatus) {
      return [];
    }
    return createUsersTableColumns({
      onUpdateUserStatus,
      rolesMap,
      vendorsMap,
    });
  }, [onUpdateUserStatus, rolesMap, vendorsMap]);

  // Filter all staff based on search criteria
  const filteredAllStaff = useMemo(() => {
    return allStaff.filter((user) => {
      const displayName =
        user.name || `${user.first_name || ""} ${user.last_name || ""}`.trim();
      const matchesGlobal =
        globalFilter === "" ||
        displayName.toLowerCase().includes(globalFilter.toLowerCase()) ||
        user.email.toLowerCase().includes(globalFilter.toLowerCase()) ||
        user.phone.includes(globalFilter);
      const matchesStatus =
        statusFilter === "all" || (user.status || "Active") === statusFilter;
      return matchesGlobal && matchesStatus;
    });
  }, [allStaff, globalFilter, statusFilter]);

  const filteredStaffIds = useMemo(
    () => new Set(filteredAllStaff.map((user) => user._id)),
    [filteredAllStaff],
  );

  // Filter the paginated staff to show only those that match the search
  const displayedStaff = useMemo(() => {
    return staff.filter((user) => filteredStaffIds.has(user._id));
  }, [staff, filteredStaffIds]);

  // Initialize table
  const table = useReactTable({
    data: displayedStaff,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    manualPagination: true,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  // Show loading skeleton
  if (isLoading) {
    return <TableSkeleton rows={5} columns={6} />;
  }

  const filters = [
    {
      key: "status",
      label: "Status",
      value: statusFilter,
      options: USER_STATUSES.map((status) => ({
        value: status,
        label: status,
      })),
      onChange: setStatusFilter,
    },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Filters */}
      <TableFilters
        table={table}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        filters={filters}
        filteredCount={filteredAllStaff.length}
        totalCount={allStaff.length}
        searchPlaceholder="Search staff by name, email, or phone..."
      />

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No staff found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && onPageChange && (
        <TablePagination
          pagination={{
            ...pagination,
            currentPage: pagination.currentPage || 1,
            pageSize: pagination.pageSize || 10,
          }}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}
