"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferVerticalIcon as ArrowUpDown,
  MoreHorizontalIcon as MoreHorizontal,
  Search01Icon as Search,
} from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import type { Id } from "@repo/backend/dataModel";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Input } from "@repo/ui/components/ui/input";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
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
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { TablePagination } from "@/components/shared/table/TablePagination";
import { formatKES } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type TransactionStatus = "pending" | "successful" | "failed" | "refunded";
type TransactionType = "credit" | "debit";

export type TransactionRow = {
  _id: Id<"transactions">;
  _creationTime: number;
  reference: string;
  order_id: Id<"orders">;
  order_reference: string | null;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  payment_method: "Card" | "Mobile Money";
  updated_at?: number;
};

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface TransactionsTableProps {
  transactions: TransactionRow[];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  statusFilter: TransactionStatus | undefined;
  onStatusFilterChange: (s: TransactionStatus | undefined) => void;
  typeFilter: TransactionType | undefined;
  onTypeFilterChange: (t: TransactionType | undefined) => void;
  canUpdate: boolean;
  onUpdateStatus: (id: Id<"transactions">, status: TransactionStatus) => void;
  paginationMeta: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isLoading: boolean;
}

// ── Status Transition Map (mirrors backend) ───────────────────────────────────

const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  pending: ["successful", "failed"],
  failed: ["pending"],
  successful: ["refunded"],
  refunded: [],
};

// ── Style Maps ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  TransactionStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100",
  },
  successful: {
    label: "Successful",
    className:
      "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
  },
  refunded: {
    label: "Refunded",
    className:
      "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100",
  },
};

const TYPE_BADGE: Record<
  TransactionType,
  { label: string; className: string }
> = {
  credit: {
    label: "Credit",
    className: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
  },
  debit: {
    label: "Debit",
    className:
      "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100",
  },
};

// ── Row Actions ───────────────────────────────────────────────────────────────

function RowActions({
  row,
  canUpdate,
  onUpdateStatus,
}: {
  row: TransactionRow;
  canUpdate: boolean;
  onUpdateStatus: (id: Id<"transactions">, status: TransactionStatus) => void;
}) {
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    nextStatus: TransactionStatus | null;
  }>({ open: false, nextStatus: null });

  const allowedNext = ALLOWED_TRANSITIONS[row.status];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <HugeiconsIcon icon={MoreHorizontal} className="h-4 w-4" />
            <span className="sr-only">Open actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-xs text-muted-foreground cursor-default select-none"
            disabled
          >
            Reference: {row.reference}
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {canUpdate && allowedNext.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={ArrowUpDown} className="mr-2 h-4 w-4" />
                Update Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {allowedNext.map((next) => (
                  <DropdownMenuItem
                    key={next}
                    onClick={() =>
                      setConfirmState({ open: true, nextStatus: next })
                    }
                  >
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[next].className}`}
                    >
                      {STATUS_BADGE[next].label}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : canUpdate && allowedNext.length === 0 ? (
            <DropdownMenuItem disabled>
              <HugeiconsIcon icon={ArrowUpDown} className="mr-2 h-4 w-4 opacity-40" />
              <span className="text-muted-foreground">
                Status is terminal (refunded)
              </span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState({ open, nextStatus: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Update</AlertDialogTitle>
            <AlertDialogDescription>
              Change transaction <strong>{row.reference}</strong> status from{" "}
              <strong>{row.status}</strong> to{" "}
              <strong>{confirmState.nextStatus}</strong>? This action cannot be
              easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmState.nextStatus) {
                  onUpdateStatus(row._id, confirmState.nextStatus);
                }
                setConfirmState({ open: false, nextStatus: null });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main Table ────────────────────────────────────────────────────────────────

const columnHelper = createColumnHelper<TransactionRow>();

export function TransactionsTable({
  transactions,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  canUpdate,
  onUpdateStatus,
  paginationMeta,
  onPageChange,
  onPageSizeChange,
  isLoading,
}: TransactionsTableProps) {
  const columns = useMemo<ColumnDef<TransactionRow, any>[]>(
    () => [
      columnHelper.accessor("reference", {
        header: "Reference",
        cell: (info) => (
          <span className="font-mono text-sm font-medium">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("order_reference", {
        header: "Order Ref",
        cell: (info) =>
          info.getValue() ? (
            <span className="font-mono text-sm text-muted-foreground">
              {info.getValue()}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          ),
      }),
      columnHelper.accessor("amount", {
        header: "Amount",
        cell: (info) => (
          <span className="font-semibold tabular-nums">
            {formatKES(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("type", {
        header: "Type",
        cell: (info) => {
          const badge = TYPE_BADGE[info.getValue() as TransactionType];
          return (
            <Badge variant="outline" className={badge.className}>
              {badge.label}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("payment_method", {
        header: "Method",
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const badge = STATUS_BADGE[info.getValue() as TransactionStatus];
          return (
            <Badge variant="outline" className={badge.className}>
              {badge.label}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("_creationTime", {
        header: "Date",
        cell: (info) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {new Date(info.getValue()).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RowActions
            row={row.original}
            canUpdate={canUpdate}
            onUpdateStatus={onUpdateStatus}
          />
        ),
      }),
    ],
    [canUpdate, onUpdateStatus],
  );

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: paginationMeta.totalPages,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <HugeiconsIcon icon={Search} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reference, status, type…"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter ?? "all"}
          onValueChange={(v) =>
            onStatusFilterChange(
              v === "all" ? undefined : (v as TransactionStatus),
            )
          }
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="successful">Successful</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={typeFilter ?? "all"}
          onValueChange={(v) =>
            onTypeFilterChange(v === "all" ? undefined : (v as TransactionType))
          }
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="credit">Credit</SelectItem>
            <SelectItem value="debit">Debit</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/30">
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
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <TablePagination
        pagination={{
          hasNext: paginationMeta.hasNext,
          hasPrevious: paginationMeta.hasPrevious,
          totalPages: paginationMeta.totalPages,
          currentPage: paginationMeta.page,
          pageSize: paginationMeta.limit,
          total: paginationMeta.total,
        }}
        onPageChange={(page, direction) => {
          if (direction === "first") onPageChange(1);
          else if (direction === "prev") onPageChange(paginationMeta.page - 1);
          else if (direction === "next") onPageChange(paginationMeta.page + 1);
          else if (direction === "last")
            onPageChange(paginationMeta.totalPages);
        }}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[5, 10, 25, 50]}
      />
    </div>
  );
}
