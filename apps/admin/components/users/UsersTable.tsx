"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building02Icon as Building2,
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleXIcon,
  FactoryIcon as Factory,
  FilterIcon,
  Grid3X2Icon as Columns3Icon,
  ListFilterIcon,
  Loading03Icon as Loader2,
  ShieldUserIcon as Shield,
  UsersIcon,
  XIcon,
} from "@hugeicons/core-free-icons";
import React, { useState, useMemo, useId, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { toast } from "sonner";
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
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@repo/ui/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Badge } from "@repo/ui/components/ui/badge";
import { Switch } from "@repo/ui/components/ui/switch";
import { cn, getConvexErrorMessage } from "@/lib/utils";
import { UsersTableProps, User, USER_STATUSES } from "./types";
import { createUsersTableColumns } from "./columns";

// ──────────────────────────────────── helpers ────────────────────────────────

/** Get the vendor ID a user is associated with (from any details object). */
function getUserVendorId(user: User): string | undefined {
  return (
    user.manager_details?.vendor_id?.[0] ??
    user.picker_details?.vendor_id ??
    user.rider_details?.vendor_id ??
    undefined
  );
}

// ──────────────────────────────────── component ──────────────────────────────

export function UsersTable({
  users,
  allUsers,
  isLoading = false,
  searchQuery = "",
  onSearchQueryChange,
  onUpdateUserStatus,
  pagination,
  onPageChange,
  onPageSizeChange,
}: UsersTableProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // ── state ──
  const [sorting, setSorting] = useState<SortingState>([
    { id: "user", desc: false },
  ]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [bulkRoleId, setBulkRoleId] = useState("");
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);

  // Filters
  const [filterRoleId, setFilterRoleId] = useState<string>("");
  const [filterStaffOnly, setFilterStaffOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterVendorId, setFilterVendorId] = useState<string>("");
  const [filterIndustryId, setFilterIndustryId] = useState<string>("");

  // ── data fetching ──
  const allRoles = useQuery(api.user.roles.getAllRoles);
  const allVendors = useQuery(api.data.vendors.getAllVendors);
  const allIndustries = useQuery(api.data.industry.getAllIndustries);
  const bulkAssignRoleMutation = useMutation(api.user.users.bulkAssignRole);

  // ── lookup maps ──
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

  const industriesMap = useMemo(() => {
    const map = new Map<string, string>();
    allIndustries?.forEach((ind: any) => map.set(ind._id, ind.name));
    return map;
  }, [allIndustries]);

  /** Map vendor_id → industry_id for the industry filter. */
  const vendorIndustryMap = useMemo(() => {
    const map = new Map<string, string>();
    allVendors?.forEach((v: any) => {
      if (v.industry_id) map.set(v._id, v.industry_id);
    });
    return map;
  }, [allVendors]);

  /** Find the "Customer" role ID so we can power the Blink Staff toggle. */
  const customerRoleId = useMemo(() => {
    return allRoles?.find(
      (r: any) => r.name.trim().toLowerCase() === "customer",
    )?._id;
  }, [allRoles]);

  // ── client-side filtering of the current page data ──
  const filteredUsers = useMemo(() => {
    let data = users;

    // 1. By role
    if (filterRoleId) {
      data = data.filter((u) => u.role_id === filterRoleId);
    }

    // 2. Blink Staff — exclude users whose dynamic role is "Customer"
    if (filterStaffOnly && customerRoleId) {
      data = data.filter((u) => u.role_id !== customerRoleId);
    }

    // 3. By status
    if (filterStatus) {
      data = data.filter((u) => (u.status || "Active") === filterStatus);
    }

    // 4. By vendor
    if (filterVendorId) {
      data = data.filter((u) => getUserVendorId(u) === filterVendorId);
    }

    // 5. By industry (vendor's industry)
    if (filterIndustryId) {
      data = data.filter((u) => {
        const vid = getUserVendorId(u);
        return vid ? vendorIndustryMap.get(vid) === filterIndustryId : false;
      });
    }

    return data;
  }, [
    users,
    filterRoleId,
    filterStaffOnly,
    customerRoleId,
    filterStatus,
    filterVendorId,
    filterIndustryId,
    vendorIndustryMap,
  ]);

  const activeFilterCount = [
    filterRoleId,
    filterStaffOnly,
    filterStatus,
    filterVendorId,
    filterIndustryId,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterRoleId("");
    setFilterStaffOnly(false);
    setFilterStatus("");
    setFilterVendorId("");
    setFilterIndustryId("");
  };

  const hasServerPagination = Boolean(
    pagination && onPageChange && onPageSizeChange,
  );
  const currentPage = pagination?.currentPage || 1;
  const pageSize = pagination?.pageSize || Math.max(1, filteredUsers.length);
  const total = pagination?.total ?? filteredUsers.length;
  const totalPages = pagination?.totalPages || 1;
  const hasPrevious =
    pagination?.hasPrevious !== undefined
      ? pagination.hasPrevious
      : currentPage > 1;
  const hasNext =
    pagination?.hasNext !== undefined
      ? pagination.hasNext
      : currentPage < totalPages;

  // ── columns ──
  const columns = useMemo(() => {
    if (!onUpdateUserStatus) return [];
    return createUsersTableColumns({
      onUpdateUserStatus,
      rolesMap,
      vendorsMap,
    });
  }, [onUpdateUserStatus, rolesMap, vendorsMap]);

  // ── table instance ──
  const table = useReactTable({
    data: filteredUsers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: hasServerPagination,
    pageCount: Math.max(1, totalPages),
    state: {
      sorting,
      columnVisibility,
      pagination: {
        pageIndex: currentPage - 1,
        pageSize,
      },
      rowSelection,
    },
    getRowId: (row) => row._id as string,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
  });

  // ── render ──
  return (
    <div className="space-y-4">
      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Input
            id={`${id}-input`}
            ref={inputRef}
            className={cn("peer min-w-60 ps-9", Boolean(searchQuery) && "pe-9")}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange?.(e.target.value)}
            placeholder="Search by name, email, or phone..."
            type="text"
            aria-label="Search users"
          />
          <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
            <HugeiconsIcon icon={ListFilterIcon} size={16} aria-hidden="true" />
          </div>
          {Boolean(searchQuery) && (
            <button
              className="text-muted-foreground/80 hover:text-foreground absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-colors outline-none"
              aria-label="Clear search"
              onClick={() => {
                onSearchQueryChange?.("");
                inputRef.current?.focus();
              }}
            >
              <HugeiconsIcon icon={CircleXIcon} size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* ─── Role Filter ─── */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(filterRoleId && "border-violet-400 bg-violet-50")}
            >
              <HugeiconsIcon icon={Shield} className="-ms-0.5 opacity-60" size={14} />
              Role
              {filterRoleId && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1 text-[10px]"
                >
                  1
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-3">
              <div className="text-muted-foreground text-xs font-medium">
                Filter by Role
              </div>
              <div className="space-y-1 max-h-60 overflow-auto">
                {allRoles?.map((role: any) => (
                  <div key={role._id} className="flex items-center gap-2">
                    <Checkbox
                      id={`fr-${role._id}`}
                      checked={filterRoleId === role._id}
                      onCheckedChange={(checked) =>
                        setFilterRoleId(checked ? role._id : "")
                      }
                    />
                    <Label
                      htmlFor={`fr-${role._id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {role.name}
                    </Label>
                  </div>
                ))}
              </div>
              {filterRoleId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setFilterRoleId("")}
                >
                  Clear
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* ─── Blink Staff Toggle ─── */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            filterStaffOnly && "border-blue-400 bg-blue-50 text-blue-700",
          )}
          onClick={() => setFilterStaffOnly((prev) => !prev)}
        >
          <HugeiconsIcon icon={UsersIcon} className="-ms-0.5 opacity-60" size={14} />
          Blink Staff
          {filterStaffOnly && (
            <Badge variant="secondary" className="ml-1 h-5 px-1 text-[10px]">
              On
            </Badge>
          )}
        </Button>

        {/* ─── Status Filter ─── */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(filterStatus && "border-green-400 bg-green-50")}
            >
              <HugeiconsIcon icon={FilterIcon} className="-ms-0.5 opacity-60" size={14} />
              Status
              {filterStatus && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1 text-[10px]"
                >
                  1
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-3" align="start">
            <div className="space-y-3">
              <div className="text-muted-foreground text-xs font-medium">
                Filter by Status
              </div>
              <div className="space-y-1">
                {USER_STATUSES.map((status) => (
                  <div key={status} className="flex items-center gap-2">
                    <Checkbox
                      id={`fs-${status}`}
                      checked={filterStatus === status}
                      onCheckedChange={(checked) =>
                        setFilterStatus(checked ? status : "")
                      }
                    />
                    <Label
                      htmlFor={`fs-${status}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {status}
                    </Label>
                  </div>
                ))}
              </div>
              {filterStatus && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setFilterStatus("")}
                >
                  Clear
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* ─── Vendor Filter ─── */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(filterVendorId && "border-cyan-400 bg-cyan-50")}
            >
              <HugeiconsIcon icon={Building2} className="-ms-0.5 opacity-60" size={14} />
              Vendor
              {filterVendorId && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1 text-[10px]"
                >
                  1
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-3" align="start">
            <div className="space-y-3">
              <div className="text-muted-foreground text-xs font-medium">
                Filter by Vendor
              </div>
              <div className="space-y-1 max-h-60 overflow-auto">
                {allVendors?.map((vendor: any) => (
                  <div key={vendor._id} className="flex items-center gap-2">
                    <Checkbox
                      id={`fv-${vendor._id}`}
                      checked={filterVendorId === vendor._id}
                      onCheckedChange={(checked) =>
                        setFilterVendorId(checked ? vendor._id : "")
                      }
                    />
                    <Label
                      htmlFor={`fv-${vendor._id}`}
                      className="text-sm font-normal cursor-pointer truncate"
                    >
                      {vendor.name}
                    </Label>
                  </div>
                ))}
              </div>
              {filterVendorId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setFilterVendorId("")}
                >
                  Clear
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* ─── Industry Filter ─── */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(filterIndustryId && "border-amber-400 bg-amber-50")}
            >
              <HugeiconsIcon icon={Factory} className="-ms-0.5 opacity-60" size={14} />
              Industry
              {filterIndustryId && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1 text-[10px]"
                >
                  1
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-3">
              <div className="text-muted-foreground text-xs font-medium">
                Filter by Industry
              </div>
              <div className="space-y-1 max-h-60 overflow-auto">
                {allIndustries?.map((ind: any) => (
                  <div key={ind._id} className="flex items-center gap-2">
                    <Checkbox
                      id={`fi-${ind._id}`}
                      checked={filterIndustryId === ind._id}
                      onCheckedChange={(checked) =>
                        setFilterIndustryId(checked ? ind._id : "")
                      }
                    />
                    <Label
                      htmlFor={`fi-${ind._id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {ind.name}
                    </Label>
                  </div>
                ))}
              </div>
              {filterIndustryId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setFilterIndustryId("")}
                >
                  Clear
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* ─── Column Visibility ─── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <HugeiconsIcon icon={Columns3Icon} className="-ms-0.5 opacity-60" size={14} />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ─── Clear All Filters ─── */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-muted-foreground"
          >
            <HugeiconsIcon icon={XIcon} className="mr-1" size={14} />
            Clear filters ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* ─── Bulk Action Bar ─── */}
      {Object.keys(rowSelection).length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium">
            {Object.keys(rowSelection).length} user(s) selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Select value={bulkRoleId} onValueChange={setBulkRoleId}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Select role..." />
              </SelectTrigger>
              <SelectContent>
                {allRoles?.map((role: any) => (
                  <SelectItem key={role._id} value={role._id}>
                    <span className="flex items-center gap-2">
                      {role.name}
                      {role.is_default && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0"
                        >
                          default
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!bulkRoleId || isBulkAssigning}
              onClick={async () => {
                const selectedIds = Object.keys(rowSelection) as Id<"users">[];
                if (!selectedIds.length || !bulkRoleId) return;
                setIsBulkAssigning(true);
                try {
                  const { updated } = await bulkAssignRoleMutation({
                    userIds: selectedIds,
                    roleId: bulkRoleId as Id<"roles">,
                  });
                  const roleName = rolesMap.get(bulkRoleId) || "selected role";
                  toast.success(`Assigned "${roleName}" to ${updated} user(s)`);
                  setRowSelection({});
                  setBulkRoleId("");
                } catch (error: any) {
                  toast.error(
                    getConvexErrorMessage(error, "Failed to bulk assign role"),
                  );
                } finally {
                  setIsBulkAssigning(false);
                }
              }}
            >
              {isBulkAssigning ? (
                <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <HugeiconsIcon icon={Shield} className="h-4 w-4 mr-1" />
              )}
              Assign Role
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRowSelection({});
                setBulkRoleId("");
              }}
            >
              <HugeiconsIcon icon={XIcon} className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* ─── Table ─── */}
      <div className="bg-background overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-11">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        className="flex h-full cursor-pointer items-center justify-between gap-2 select-none"
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            header.column.getToggleSortingHandler()?.(e);
                          }
                        }}
                        tabIndex={0}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {{
                          asc: (
                            <HugeiconsIcon icon={ChevronUpIcon}
                              className="shrink-0 opacity-60"
                              size={16} />
                          ),
                          desc: (
                            <HugeiconsIcon icon={ChevronDownIcon}
                              className="shrink-0 opacity-60"
                              size={16} />
                          ),
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skel-${index}`}>
                  {Array.from({ length: columns.length }).map((_, ci) => (
                    <TableCell key={ci}>
                      <div className="h-4 w-full max-w-[120px] bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="last:py-0">
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
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ─── Pagination ─── */}
      <div className="flex items-center justify-between gap-8">
        {hasServerPagination ? (
          <div className="flex items-center gap-3">
            <Label htmlFor={id} className="max-sm:sr-only">
              Rows per page
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange?.(Number(value))}
            >
              <SelectTrigger id={id} className="w-fit whitespace-nowrap">
                <SelectValue placeholder="Select number of results" />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 25, 50].map((ps) => (
                  <SelectItem key={ps} value={ps.toString()}>
                    {ps}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Showing all filtered users
          </p>
        )}

        <p
          className="text-muted-foreground text-sm whitespace-nowrap"
          aria-live="polite"
        >
          <span className="text-foreground">
            {total === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, total)}
          </span>{" "}
          of <span className="text-foreground">{total.toString()}</span>
        </p>

        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                size="icon"
                variant="outline"
                className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                onClick={() => onPageChange?.(1, "first")}
                disabled={isLoading || !hasServerPagination || !hasPrevious}
                aria-label="Go to first page"
              >
                <HugeiconsIcon icon={ChevronFirstIcon} size={16} />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                size="icon"
                variant="outline"
                className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                onClick={() => onPageChange?.(currentPage - 1, "prev")}
                disabled={isLoading || !hasServerPagination || !hasPrevious}
                aria-label="Go to previous page"
              >
                <HugeiconsIcon icon={ChevronLeftIcon} size={16} />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                size="icon"
                variant="outline"
                className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                onClick={() => onPageChange?.(currentPage + 1, "next")}
                disabled={isLoading || !hasServerPagination || !hasNext}
                aria-label="Go to next page"
              >
                <HugeiconsIcon icon={ChevronRightIcon} size={16} />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                size="icon"
                variant="outline"
                className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                onClick={() => onPageChange?.(totalPages, "last")}
                disabled={isLoading || !hasServerPagination || !hasNext}
                aria-label="Go to last page"
              >
                <HugeiconsIcon icon={ChevronLastIcon} size={16} />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
