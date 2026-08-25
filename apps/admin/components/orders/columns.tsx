"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDataTransferVerticalIcon as ArrowUpDown } from "@hugeicons/core-free-icons";
import React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { formatDate, DATE_FORMATS } from "@/lib/date-utils";
import { formatKES } from "@/lib/utils";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Order,
  OrderStatus,
  PaymentStatus,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_COLORS,
} from "./types";
import { RowActions, RowActionsProps } from "./RowActions";
import type { Id } from "@repo/backend/dataModel";

function formatPickupDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "< 1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function getPickupDurationColor(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 1) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (minutes < 4) return "bg-green-100 text-green-700 border-green-200";
  if (minutes < 8) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (minutes < 10) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-red-100 text-red-700 border-red-200";
}

interface CreateColumnsProps {
  onUpdateOrderStatus?: RowActionsProps["onUpdateOrderStatus"];
  onUpdatePaymentStatus?: RowActionsProps["onUpdatePaymentStatus"];
  onDeleteOrder?: RowActionsProps["onDeleteOrder"];
  onViewDetails?: RowActionsProps["onViewDetails"];
  updateSingleOrderStatus?: RowActionsProps["updateSingleOrderStatus"];
  updateSinglePaymentStatus?: RowActionsProps["updateSinglePaymentStatus"];
  isHubManager?: boolean;
}

export function createOrdersTableColumns({
  onUpdateOrderStatus,
  onUpdatePaymentStatus,
  onDeleteOrder,
  onViewDetails,
  updateSingleOrderStatus,
  updateSinglePaymentStatus,
  isHubManager = false,
}: CreateColumnsProps): ColumnDef<Order>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
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
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "reference",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Order Ref
            <HugeiconsIcon icon={ArrowUpDown} className="ml-2 h-4 w-4" />
          </Button>
        );
      },

      cell: ({ row }) => {
        const reference = row.getValue("reference") as string;
        const date = row.original.order_date;
        const isClearance = (row.original as any).is_clearance;
        return (
          <div className="flex flex-col font-medium text-primary">
            <span className="font-mono">
              {reference.slice(-6).toUpperCase()}
            </span>
            <span className="text-sm text-gray-500">{formatDate(date)}</span>
            {isClearance && (
              <Badge
                variant="outline"
                className="mt-1 w-fit text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200"
              >
                Clearance
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "customer_name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Customer
            <HugeiconsIcon icon={ArrowUpDown} className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const name = row.getValue("customer_name") as string;
        return (
          <div className="max-w-[200px]">
            <div className="font-medium text-gray-900 truncate">
              {name || "Unknown"}
            </div>
            <div className="text-sm text-gray-500 truncate">
              {row.original.customer_email || "—"}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "vendor_name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Vendor
            <HugeiconsIcon icon={ArrowUpDown} className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const name = row.getValue("vendor_name") as string;
        return (
          <div className="max-w-[150px] truncate font-medium">
            {name || "Unknown Vendor"}
          </div>
        );
      },
    },
    {
      accessorKey: "order_status",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Order Status
            <HugeiconsIcon icon={ArrowUpDown} className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const status = row.getValue("order_status") as OrderStatus;
        return (
          <Badge
            variant="outline"
            className={`${ORDER_STATUS_COLORS[status]} font-medium`}
          >
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: "payment_status",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold"
          >
            Payment Status
            <HugeiconsIcon icon={ArrowUpDown} className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const status = row.getValue("payment_status") as PaymentStatus;
        return (
          <Badge
            variant="outline"
            className={`${PAYMENT_STATUS_COLORS[status]} font-medium`}
          >
            {status === "Unpaid" ? "On Delivery" : status}
          </Badge>
        );
      },
    },
    {
      accessorKey: "total_amount",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-auto p-0 font-semibold text-right"
          >
            Total Amount
            <HugeiconsIcon icon={ArrowUpDown} className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const amount = parseFloat(row.getValue("total_amount"));
        return (
          <div className="text-right font-medium">{formatKES(amount)}</div>
        );
      },
    },
    {
      accessorKey: "picker_name",
      header: "Picker",
      cell: ({ row }) => {
        const pickerName = row.getValue("picker_name") as string;
        return (
          <div className="max-w-[120px] truncate text-sm">
            {pickerName || "—"}
          </div>
        );
      },
    },
    {
      id: "pickup_duration",
      header: "Pickup Duration",
      cell: ({ row }) => {
        const confirmedAt = row.original.confirmed_at;
        const pickedUpAt = row.original.picked_up_at;
        if (!confirmedAt || !pickedUpAt) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        const durationMs = pickedUpAt - confirmedAt;
        if (durationMs <= 0) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        return (
          <Badge
            variant="outline"
            className={`${getPickupDurationColor(durationMs)} font-medium`}
          >
            {formatPickupDuration(durationMs)}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const order = row.original;

        return (
          <RowActions
            order={order}
            onUpdateOrderStatus={onUpdateOrderStatus}
            onUpdatePaymentStatus={onUpdatePaymentStatus}
            onDeleteOrder={onDeleteOrder}
            onViewDetails={onViewDetails}
            updateSingleOrderStatus={updateSingleOrderStatus}
            updateSinglePaymentStatus={updateSinglePaymentStatus}
            isHubManager={isHubManager}
          />
        );
      },
    },
  ];
}
