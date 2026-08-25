"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon as ChevronDown,
  CircleXIcon,
  Grid3X2Icon as Columns3Icon,
  Search01Icon as Search,
} from "@hugeicons/core-free-icons";
import React, { useState, useMemo, useCallback, useId } from "react";
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
import { DateRange } from "react-day-picker";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Button } from "@repo/ui/components/ui/button";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import type { Id } from "@repo/backend/dataModel";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { TablePagination } from "@/components/shared/table";
import { createOrdersTableColumns } from "./columns";
import {
  Order,
  OrderStatus,
  PaymentStatus,
  OrdersPagination,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "./types";

interface OrdersTableProps {
  orders: Order[];
  allOrders: Order[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (val: string) => void;
  paymentStatusFilter?: string;
  onPaymentStatusFilterChange?: (val: string) => void;
  pickerFilter?: string;
  onPickerFilterChange?: (val: string) => void;
  pickers?: { _id: string; name: string }[];
  selectedIds: Id<"orders">[];
  onSelectedIdsChange: (ids: Id<"orders">[]) => void;
  onUpdateOrderStatus?: (orderId: Id<"orders">, status: OrderStatus) => void;
  onUpdatePaymentStatus?: (
    orderId: Id<"orders">,
    status: PaymentStatus,
  ) => void;
  onDeleteOrder?: (orderId: Id<"orders">) => void;
  onViewDetails?: (order: Order) => void;
  updateSingleOrderStatus?: (
    orderId: Id<"orders">,
    status: OrderStatus,
  ) => void;
  updateSinglePaymentStatus?: (
    orderId: Id<"orders">,
    status: PaymentStatus,
  ) => void;
  bulkUpdateOrderStatus?: (
    orderIds: Id<"orders">[],
    status: OrderStatus,
  ) => void;
  isHubManager?: boolean;
  clearanceFilter?: string;
  onClearanceFilterChange?: (val: string) => void;
  pagination: OrdersPagination;
  onPageChange: (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => void;
  onPageSizeChange: (size: number) => void;
  isLoading?: boolean;
}

export function OrdersTable({
  orders,
  allOrders,
  searchQuery = "",
  onSearchQueryChange,
  statusFilter = "all",
  onStatusFilterChange,
  paymentStatusFilter = "all",
  onPaymentStatusFilterChange,
  pickerFilter = "all",
  onPickerFilterChange,
  pickers = [],
  clearanceFilter = "all",
  onClearanceFilterChange,
  selectedIds,
  onSelectedIdsChange,
  onUpdateOrderStatus,
  onUpdatePaymentStatus,
  onDeleteOrder,
  onViewDetails,
  updateSingleOrderStatus,
  updateSinglePaymentStatus,
  bulkUpdateOrderStatus,
  isHubManager,
  pagination,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
}: OrdersTableProps) {
  const id = useId();
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "order_date",
      desc: true,
    },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [pendingBulkStatus, setPendingBulkStatus] =
    useState<OrderStatus | null>(null);
  const [orderDetailsDialogOpen, setOrderDetailsDialogOpen] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] =
    useState<Order | null>(null);

  // Only date range is filtered client-side; status/payment go server-side
  const filteredOrders = useMemo(() => {
    if (!dateRange?.from) return orders;
    return orders.filter((order) => {
      const orderDate = new Date(order.order_date);
      const fromDate = startOfDay(dateRange.from!);
      const toDate = dateRange.to
        ? endOfDay(dateRange.to)
        : endOfDay(dateRange.from!);
      return isWithinInterval(orderDate, { start: fromDate, end: toDate });
    });
  }, [orders, dateRange]);

  const columns = useMemo(
    () =>
      createOrdersTableColumns({
        onUpdateOrderStatus,
        onUpdatePaymentStatus,
        onDeleteOrder,
        onViewDetails,
        updateSingleOrderStatus,
        updateSinglePaymentStatus,
        isHubManager,
      }),
    [
      onUpdateOrderStatus,
      onUpdatePaymentStatus,
      onDeleteOrder,
      onViewDetails,
      updateSingleOrderStatus,
      updateSinglePaymentStatus,
      isHubManager,
    ],
  );

  const table = useReactTable({
    data: filteredOrders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    pageCount: Math.max(1, pagination.totalPages),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: {
        pageIndex: pagination.currentPage - 1,
        pageSize: pagination.pageSize,
      },
      rowSelection,
    },
    getRowId: (row) => row._id as string,
    onRowSelectionChange: (updater) => {
      const newSelection =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(newSelection);

      const selectedRowIds = Object.keys(newSelection).filter(
        (key) => newSelection[key],
      ) as Id<"orders">[];
      onSelectedIdsChange(selectedRowIds);
    },
  });

  // Bulk actions
  const confirmBulkStatusUpdate = useCallback(async () => {
    if (pendingBulkStatus && bulkUpdateOrderStatus) {
      try {
        await bulkUpdateOrderStatus(selectedIds, pendingBulkStatus);
        setBulkStatusDialogOpen(false);
        setPendingBulkStatus(null);
        setRowSelection({});
        onSelectedIdsChange([]);
        toast.success("Bulk order status update completed successfully!");
      } catch (error) {
        console.error("Failed to bulk update order status:", error);
        toast.error(
          getConvexErrorMessage(error, "Bulk order status update failed"),
        );
      }
    }
  }, [
    pendingBulkStatus,
    bulkUpdateOrderStatus,
    selectedIds,
    onSelectedIdsChange,
  ]);

  // Show loading skeleton
  // (removed early return — filters stay rendered; skeleton is shown inside the table body)

  return (
    <div className="w-full space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative max-w-sm">
            <HugeiconsIcon icon={Search} className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(event) =>
                onSearchQueryChange?.(String(event.target.value))
              }
              className="pl-8"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Order Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {ORDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Payment Status Filter */}
          <Select
            value={paymentStatusFilter}
            onValueChange={onPaymentStatusFilterChange}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Payment Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payment</SelectItem>
              {PAYMENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Picker Filter */}
          <Select value={pickerFilter} onValueChange={onPickerFilterChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Picker" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pickers</SelectItem>
              {pickers.map((picker) => (
                <SelectItem key={picker._id} value={picker._id}>
                  {picker.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clearance Filter */}
          <Select
            value={clearanceFilter}
            onValueChange={onClearanceFilterChange}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Order Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="clearance">Clearance</SelectItem>
              <SelectItem value="regular">Regular</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Range Filter */}
          <DatePickerWithRange
            date={dateRange}
            onDateChange={setDateRange}
            placeholder="Filter by date range"
            className="w-auto"
          />

          {/* Clear Filters */}
          {(searchQuery ||
            statusFilter !== "all" ||
            paymentStatusFilter !== "all" ||
            pickerFilter !== "all" ||
            clearanceFilter !== "all" ||
            dateRange) && (
            <Button
              variant="ghost"
              onClick={() => {
                onSearchQueryChange?.("");
                onStatusFilterChange?.("all");
                onPaymentStatusFilterChange?.("all");
                onPickerFilterChange?.("all");
                onClearanceFilterChange?.("all");
                setDateRange(undefined);
                table.resetColumnFilters();
              }}
              className="h-8 px-2 lg:px-3"
            >
              Clear
              <HugeiconsIcon icon={CircleXIcon} className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Column Visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-8">
              <HugeiconsIcon icon={Columns3Icon} className="mr-2 h-4 w-4" />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[150px]">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter(
                (column) =>
                  typeof column.accessorFn !== "undefined" &&
                  column.getCanHide(),
              )
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: columns.length || 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
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
                  No orders found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <TablePagination
        pagination={pagination}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        isLoading={isLoading}
      />

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">
            {selectedIds.length} order{selectedIds.length === 1 ? "" : "s"}{" "}
            selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Update Status
                <HugeiconsIcon icon={ChevronDown} className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {ORDER_STATUSES.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => {
                    setPendingBulkStatus(status);
                    setBulkStatusDialogOpen(true);
                  }}
                >
                  Mark as {status}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Bulk Status Update Dialog */}
      <Dialog
        open={bulkStatusDialogOpen}
        onOpenChange={setBulkStatusDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Status Update</DialogTitle>
            <DialogDescription>
              Are you sure you want to update {selectedIds.length} order
              {selectedIds.length === 1 ? "" : "s"} to "{pendingBulkStatus}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkStatusDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={confirmBulkStatusUpdate}>Update Orders</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
