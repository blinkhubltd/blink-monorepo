"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleXIcon,
  CreditCardIcon as CreditCard,
  DollarSignIcon as DollarSign,
  EllipsisIcon,
  FilterIcon,
  Grid3X2Icon as Columns3Icon,
  ListFilterIcon,
  RefreshCwIcon,
  ViewIcon as Eye,
} from "@hugeicons/core-free-icons";
import type React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";

import { cn, formatKES } from "@/lib/utils";
import type { Id } from "@repo/backend/dataModel";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@repo/ui/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
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
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { formatDate, DATE_FORMATS } from "@/lib/date-utils";

type Payment = {
  _id: Id<"payments">;
  order_id?: Id<"orders">;
  user_id: Id<"users">;
  amount: number;
  currency: string;
  payment_method:
    | "Card"
    | "Mobile Money"
    | "Mpesa"
    | "Cash on Delivery"
    | "Bank Transfer"
    | "Paystack";
  payment_status: "Pending" | "Completed" | "Failed" | "Refunded";
  transaction_id?: string;
  reference?: string;
  provider?: string;
  fee_amount?: number;
  net_amount: number;
  payment_date: number;
  created_at: number;
  updated_at?: number;
  // Associated data from joins
  order_reference?: string;
  customer_name?: string;
  customer_email?: string;
};

const multiColumnFilterFn: FilterFn<Payment> = (row, columnId, filterValue) => {
  const searchableRowContent =
    `${row.original.order_reference || ""} ${row.original.customer_name || ""} ${row.original.customer_email || ""} ${row.original.transaction_id || ""} ${row.original.reference || ""}`.toLowerCase();
  const searchTerm = (filterValue ?? "").toLowerCase();
  return searchableRowContent.includes(searchTerm);
};

const statusFilterFn: FilterFn<Payment> = (
  row,
  columnId,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true;
  const status = row.getValue(columnId) as string;
  return filterValue.includes(status);
};

const methodFilterFn: FilterFn<Payment> = (
  row,
  columnId,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true;
  const method = row.getValue(columnId) as string;
  return filterValue.includes(method);
};

export function PaymentsTable({
  payments,
  searchQuery = "",
  onSearchQueryChange,
  selectedIds,
  onSelectedIdsChange,
  onUpdatePaymentStatus,
  onRefundPayment,
  paginationMeta,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
}: {
  payments: Payment[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  selectedIds: Id<"payments">[];
  onSelectedIdsChange: (ids: Id<"payments">[]) => void;
  onUpdatePaymentStatus?: (
    paymentId: Id<"payments">,
    status: Payment["payment_status"],
  ) => Promise<void>;
  onRefundPayment?: (paymentId: Id<"payments">) => Promise<void>;
  paginationMeta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
  isLoading?: boolean;
}) {
  const id = useId();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "payment_date",
      desc: true,
    },
  ]);

  const [selectedPaymentForDetails, setSelectedPaymentForDetails] =
    useState<Payment | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<
    Payment["payment_status"] | null
  >(null);

  const columns: ColumnDef<Payment>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        size: 28,
        enableSorting: false,
        enableHiding: false,
      },
      {
        header: "Payment ID",
        accessorKey: "reference",
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-sm">
              {row.original.reference || `PAY-${row.original._id.slice(-8)}`}
            </div>
            {row.original.transaction_id && (
              <div className="text-xs text-muted-foreground">
                {row.original.transaction_id}
              </div>
            )}
          </div>
        ),
        size: 180,
        filterFn: multiColumnFilterFn,
        enableHiding: false,
      },
      {
        header: "Order",
        accessorKey: "order_reference",
        cell: ({ row }) => (
          <div className="font-mono text-sm">
            #
            {row.original.order_reference ||
              row.original.order_id?.slice(-8) ||
              "—"}
          </div>
        ),
        size: 120,
      },
      {
        header: "Customer",
        accessorKey: "customer_name",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.customer_name || "Unknown"}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.customer_email || "—"}
            </div>
          </div>
        ),
        size: 200,
      },
      {
        header: "Amount",
        accessorKey: "amount",
        cell: ({ row }) => {
          const amount = Number.parseFloat(row.getValue("amount"));
          const fee = row.original.fee_amount || 0;
          const net = row.original.net_amount;
          return (
            <div>
              <div className="font-medium">{formatKES(amount)}</div>
              {fee > 0 && (
                <div className="text-xs text-muted-foreground">
                  Net: {formatKES(net)} (Fee: {formatKES(fee)})
                </div>
              )}
            </div>
          );
        },
        size: 140,
      },
      {
        header: "Method",
        accessorKey: "payment_method",
        cell: ({ row }) => {
          const method = row.getValue("payment_method") as string;
          const provider = row.original.provider;
          return (
            <div>
              <div className="font-medium">{method}</div>
              {provider && (
                <div className="text-xs text-muted-foreground">{provider}</div>
              )}
            </div>
          );
        },
        size: 140,
        filterFn: methodFilterFn,
      },
      {
        header: "Status",
        accessorKey: "payment_status",
        cell: ({ row }) => (
          <StatusBadge status={row.getValue("payment_status")} />
        ),
        size: 120,
        filterFn: statusFilterFn,
      },
      {
        header: "Date",
        accessorKey: "payment_date",
        cell: ({ row }) => (
          <div className="text-sm">
            {formatDate(row.getValue("payment_date"), DATE_FORMATS.MEDIUM)}
          </div>
        ),
        size: 140,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            payment={row.original}
            onUpdatePaymentStatus={onUpdatePaymentStatus}
            onRefundPayment={onRefundPayment}
            onViewDetails={() => {
              setSelectedPaymentForDetails(row.original);
              setShowDetailsDialog(true);
            }}
          />
        ),
        size: 60,
        enableHiding: false,
      },
    ],
    [onUpdatePaymentStatus, onRefundPayment],
  );

  const table = useReactTable({
    data: payments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: true,
    pageCount: Math.max(1, paginationMeta.totalPages),
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({
              pageIndex: paginationMeta.page - 1,
              pageSize: paginationMeta.limit,
            })
          : updater;
      if (next.pageSize !== paginationMeta.limit) {
        onPageSizeChange(next.pageSize);
      }
      if (next.pageIndex !== paginationMeta.page - 1) {
        onPageChange(next.pageIndex + 1);
      }
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: {
        pageIndex: paginationMeta.page - 1,
        pageSize: paginationMeta.limit,
      },
      rowSelection,
    },
    getRowId: (row) => row._id as string,
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(next);

      // Get current page payment IDs
      const currentPageIds = payments.map((p) => p._id);

      // Determine which current page payments are selected
      const currentPageSelectedIds = currentPageIds.filter(
        (id) => next[id as string] === true,
      );

      // Create a new set from existing global selections, removing current page items
      const globalSelectedSet = new Set(selectedIds);
      currentPageIds.forEach((id) => globalSelectedSet.delete(id));

      // Add back the currently selected items from current page
      currentPageSelectedIds.forEach((id) => globalSelectedSet.add(id));

      // Convert back to array and update
      const newGlobalSelection = Array.from(globalSelectedSet);
      onSelectedIdsChange(newGlobalSelection);
    },
  });

  // Sync row selection with global selected IDs
  useEffect(() => {
    const newRowSelection: Record<string, boolean> = {};
    const selectedSet = new Set(selectedIds.map((id) => id as string));

    payments.forEach((payment) => {
      const paymentId = payment._id as string;
      newRowSelection[paymentId] = selectedSet.has(paymentId);
    });

    setRowSelection(newRowSelection);
  }, [payments, selectedIds]);

  const uniqueStatusValues = useMemo(() => {
    const statusColumn = table.getColumn("payment_status");
    if (!statusColumn) return [];
    const values = Array.from(statusColumn.getFacetedUniqueValues().keys());
    return values.sort();
  }, [table.getColumn("payment_status")?.getFacetedUniqueValues()]);

  const statusCounts = useMemo(() => {
    const statusColumn = table.getColumn("payment_status");
    if (!statusColumn) return new Map();
    return statusColumn.getFacetedUniqueValues();
  }, [table.getColumn("payment_status")?.getFacetedUniqueValues()]);

  const selectedStatuses = useMemo(() => {
    const filterValue = table
      .getColumn("payment_status")
      ?.getFilterValue() as string[];
    return filterValue ?? [];
  }, [table.getColumn("payment_status")?.getFilterValue()]);

  const uniqueMethodValues = useMemo(() => {
    const methodColumn = table.getColumn("payment_method");
    if (!methodColumn) return [];
    const values = Array.from(methodColumn.getFacetedUniqueValues().keys());
    return values.sort();
  }, [table.getColumn("payment_method")?.getFacetedUniqueValues()]);

  const methodCounts = useMemo(() => {
    const methodColumn = table.getColumn("payment_method");
    if (!methodColumn) return new Map();
    return methodColumn.getFacetedUniqueValues();
  }, [table.getColumn("payment_method")?.getFacetedUniqueValues()]);

  const selectedMethods = useMemo(() => {
    const filterValue = table
      .getColumn("payment_method")
      ?.getFilterValue() as string[];
    return filterValue ?? [];
  }, [table.getColumn("payment_method")?.getFilterValue()]);

  const handleStatusChange = (checked: boolean, value: string) => {
    const filterValue = table
      .getColumn("payment_status")
      ?.getFilterValue() as string[];
    const newFilterValue = filterValue ? [...filterValue] : [];

    if (checked) {
      newFilterValue.push(value);
    } else {
      const index = newFilterValue.indexOf(value);
      if (index > -1) {
        newFilterValue.splice(index, 1);
      }
    }

    table
      .getColumn("payment_status")
      ?.setFilterValue(newFilterValue.length ? newFilterValue : undefined);
  };

  const handleMethodChange = (checked: boolean, value: string) => {
    const filterValue = table
      .getColumn("payment_method")
      ?.getFilterValue() as string[];
    const newFilterValue = filterValue ? [...filterValue] : [];

    if (checked) {
      newFilterValue.push(value);
    } else {
      const index = newFilterValue.indexOf(value);
      if (index > -1) {
        newFilterValue.splice(index, 1);
      }
    }

    table
      .getColumn("payment_method")
      ?.setFilterValue(newFilterValue.length ? newFilterValue : undefined);
  };

  const handleBulkStatusUpdate = async (
    newStatus: Payment["payment_status"],
  ) => {
    setPendingBulkStatus(newStatus);
    setShowBulkStatusDialog(true);
  };

  const executeBulkStatusUpdate = async () => {
    if (!pendingBulkStatus || selectedIds.length === 0) {
      return;
    }

    // Filter out any undefined values and validate all IDs
    const validIds = selectedIds.filter(
      (id): id is Id<"payments"> =>
        id != null && typeof id === "string" && id.trim() !== "",
    );

    if (validIds.length === 0) {
      return;
    }

    try {
      // Call bulk update for each payment (since we don't have a bulk API yet)
      if (onUpdatePaymentStatus) {
        await Promise.all(
          validIds.map((id) => onUpdatePaymentStatus(id, pendingBulkStatus)),
        );
      }
      table.resetRowSelection();
      setShowBulkStatusDialog(false);
      setPendingBulkStatus(null);
    } catch (error) {
      console.error("Failed to bulk update payment status:", error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Input
              id={`${id}-input`}
              ref={inputRef}
              className={cn(
                "peer min-w-60 ps-9",
                Boolean(searchQuery) && "pe-9",
              )}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange?.(e.target.value)}
              placeholder="Search by reference, order, or customer..."
              type="text"
              aria-label="Search payments"
            />
            <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
              <HugeiconsIcon icon={ListFilterIcon} size={16} aria-hidden="true" />
            </div>
            {Boolean(searchQuery) && (
              <button
                className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Clear filter"
                onClick={() => {
                  onSearchQueryChange?.("");
                  if (inputRef.current) {
                    inputRef.current.focus();
                  }
                }}
              >
                <HugeiconsIcon icon={CircleXIcon} size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <HugeiconsIcon icon={FilterIcon}
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true" />
                Status
                {selectedStatuses.length > 0 && (
                  <span className="bg-background text-muted-foreground/70 -me-1 inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium">
                    {selectedStatuses.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-36 p-3" align="start">
              <div className="space-y-3">
                <div className="text-muted-foreground text-xs font-medium">
                  Payment Status
                </div>
                <div className="space-y-3">
                  {uniqueStatusValues.map((value, i) => (
                    <div key={value} className="flex items-center gap-2">
                      <Checkbox
                        id={`status-${id}-${i}`}
                        checked={selectedStatuses.includes(value)}
                        onCheckedChange={(checked: boolean) =>
                          handleStatusChange(checked, value)
                        }
                      />
                      <Label
                        htmlFor={`status-${id}-${i}`}
                        className="flex grow justify-between gap-2 font-normal"
                      >
                        {value}{" "}
                        <span className="text-muted-foreground ms-2 text-xs">
                          {statusCounts.get(value)}
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Method Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <HugeiconsIcon icon={CreditCard}
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true" />
                Method
                {selectedMethods.length > 0 && (
                  <span className="bg-background text-muted-foreground/70 -me-1 inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium">
                    {selectedMethods.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-36 p-3" align="start">
              <div className="space-y-3">
                <div className="text-muted-foreground text-xs font-medium">
                  Payment Methods
                </div>
                <div className="space-y-3">
                  {uniqueMethodValues.map((value, i) => (
                    <div key={value} className="flex items-center gap-2">
                      <Checkbox
                        id={`method-${id}-${i}`}
                        checked={selectedMethods.includes(value)}
                        onCheckedChange={(checked: boolean) =>
                          handleMethodChange(checked, value)
                        }
                      />
                      <Label
                        htmlFor={`method-${id}-${i}`}
                        className="flex grow justify-between gap-2 font-normal"
                      >
                        {value}{" "}
                        <span className="text-muted-foreground ms-2 text-xs">
                          {methodCounts.get(value)}
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <HugeiconsIcon icon={Columns3Icon}
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <HugeiconsIcon icon={RefreshCwIcon}
                    className="-ms-1 opacity-60"
                    size={16}
                    aria-hidden="true" />
                  Update Status
                  <span className="bg-background text-muted-foreground/70 -me-1 inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium">
                    {selectedIds.length}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Update selected to:</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleBulkStatusUpdate("Completed")}
                >
                  Completed
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBulkStatusUpdate("Failed")}
                >
                  Failed
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBulkStatusUpdate("Pending")}
                >
                  Pending
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBulkStatusUpdate("Refunded")}
                >
                  Refunded
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="bg-background overflow-hidden rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: `${header.getSize()}px` }}
                      className="h-11"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <div
                          className={cn(
                            header.column.getCanSort() &&
                              "flex h-full cursor-pointer items-center justify-between gap-2 select-none",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            if (
                              header.column.getCanSort() &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {{
                            asc: (
                              <HugeiconsIcon icon={ChevronUpIcon}
                                className="shrink-0 opacity-60"
                                size={16}
                                aria-hidden="true" />
                            ),
                            desc: (
                              <HugeiconsIcon icon={ChevronDownIcon}
                                className="shrink-0 opacity-60"
                                size={16}
                                aria-hidden="true" />
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
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`loading-${index}`}>
                  <TableCell>
                    <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                  </TableCell>
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
                  No payments found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <Label htmlFor={id} className="max-sm:sr-only">
            Rows per page
          </Label>
          <Select
            value={String(paginationMeta.limit)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger id={id} className="w-fit whitespace-nowrap">
              <SelectValue placeholder="Select number of results" />
            </SelectTrigger>
            <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2">
              {[5, 10, 25, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-muted-foreground flex grow justify-end text-sm whitespace-nowrap">
          <p
            className="text-muted-foreground text-sm whitespace-nowrap"
            aria-live="polite"
          >
            <span className="text-foreground">
              {paginationMeta.total === 0
                ? 0
                : (paginationMeta.page - 1) * paginationMeta.limit + 1}
              -
              {Math.min(
                paginationMeta.page * paginationMeta.limit,
                paginationMeta.total,
              )}
            </span>{" "}
            of{" "}
            <span className="text-foreground">
              {paginationMeta.total.toString()}
            </span>
          </p>
        </div>

        <div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                  onClick={() => onPageChange(1)}
                  disabled={isLoading || !paginationMeta.hasPrevious}
                  aria-label="Go to first page"
                >
                  <HugeiconsIcon icon={ChevronFirstIcon} size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                  onClick={() => onPageChange(paginationMeta.page - 1)}
                  disabled={isLoading || !paginationMeta.hasPrevious}
                  aria-label="Go to previous page"
                >
                  <HugeiconsIcon icon={ChevronLeftIcon} size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                  onClick={() => onPageChange(paginationMeta.page + 1)}
                  disabled={isLoading || !paginationMeta.hasNext}
                  aria-label="Go to next page"
                >
                  <HugeiconsIcon icon={ChevronRightIcon} size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                  onClick={() => onPageChange(paginationMeta.totalPages)}
                  disabled={isLoading || !paginationMeta.hasNext}
                  aria-label="Go to last page"
                >
                  <HugeiconsIcon icon={ChevronLastIcon} size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>

      <AlertDialog
        open={showBulkStatusDialog}
        onOpenChange={setShowBulkStatusDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Payment Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update {selectedIds.length} selected
              payment
              {selectedIds.length === 1 ? "" : "s"} to "{pendingBulkStatus}"
              status? This action will change the status of all selected
              payments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingBulkStatus(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkStatusUpdate}>
              Update Status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
            <DialogDescription>
              Complete payment information and transaction details
            </DialogDescription>
          </DialogHeader>
          {selectedPaymentForDetails && (
            <PaymentDetailsCard payment={selectedPaymentForDetails} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: Payment["payment_status"] }) {
  return (
    <Badge
      className={cn(
        status === "Completed" &&
          "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
        status === "Pending" &&
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
        status === "Failed" &&
          "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
        status === "Refunded" &&
          "bg-muted-foreground/60 text-primary-foreground",
      )}
    >
      {status}
    </Badge>
  );
}

function RowActions({
  payment,
  onUpdatePaymentStatus,
  onRefundPayment,
  onViewDetails,
}: {
  payment: Payment;
  onUpdatePaymentStatus?: (
    paymentId: Id<"payments">,
    status: Payment["payment_status"],
  ) => Promise<void>;
  onRefundPayment?: (paymentId: Id<"payments">) => Promise<void>;
  onViewDetails: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex justify-end">
          <Button
            size="icon"
            variant="ghost"
            className="shadow-none"
            aria-label="Payment actions"
          >
            <HugeiconsIcon icon={EllipsisIcon} size={16} aria-hidden="true" />
          </Button>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onViewDetails}>
            <HugeiconsIcon icon={Eye} size={16} className="mr-2" />
            <span>View Details</span>
          </DropdownMenuItem>
          {onUpdatePaymentStatus && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onUpdatePaymentStatus(payment._id, "Completed")}
                disabled={payment.payment_status === "Completed"}
              >
                <span>Mark as Completed</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onUpdatePaymentStatus(payment._id, "Failed")}
                disabled={payment.payment_status === "Failed"}
              >
                <span>Mark as Failed</span>
              </DropdownMenuItem>
            </>
          )}
          {onRefundPayment && payment.payment_status === "Completed" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onRefundPayment(payment._id)}
                className="text-orange-600"
              >
                <HugeiconsIcon icon={DollarSign} size={16} className="mr-2" />
                <span>Refund Payment</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PaymentDetailsCard({ payment }: { payment: Payment }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Payment Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment ID:</span>
                  <span className="font-mono">
                    {payment.reference || `PAY-${payment._id.slice(-8)}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order:</span>
                  <span className="font-mono">
                    #
                    {payment.order_reference ||
                      payment.order_id?.slice(-8) ||
                      "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium">
                    {formatKES(payment.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method:</span>
                  <span>{payment.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <StatusBadge status={payment.payment_status} />
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Transaction Details</h4>
              <div className="space-y-2 text-sm">
                {payment.transaction_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Transaction ID:
                    </span>
                    <span className="font-mono text-xs">
                      {payment.transaction_id}
                    </span>
                  </div>
                )}
                {payment.provider && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider:</span>
                    <span>{payment.provider}</span>
                  </div>
                )}
                {payment.fee_amount && payment.fee_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee:</span>
                    <span>{formatKES(payment.fee_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net Amount:</span>
                  <span className="font-medium">
                    {formatKES(payment.net_amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span>
                    {formatDate(payment.payment_date, DATE_FORMATS.MEDIUM)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h4 className="font-medium mb-2">Customer Information</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span>{payment.customer_name || "Unknown"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span>{payment.customer_email || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer ID:</span>
              <span className="font-mono text-xs">
                {payment.user_id.slice(-8)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
