"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BicycleIcon as Bike,
  CreditCardIcon as CreditCard,
  Delete02Icon as Trash2,
  MoreHorizontalIcon as MoreHorizontal,
  PackageIcon as Package,
  PrinterIcon as Printer,
  RefreshIcon as RefreshCw,
  ViewIcon as Eye,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import type { Id } from "@repo/backend/dataModel";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { AssignRiderDialog } from "./AssignRiderDialog";
import { ShipmentDetailsDialog } from "./ShipmentDetailsDialog";
import { PrintReceipt } from "./PrintReceipt";
import {
  Order,
  OrderStatus,
  PaymentStatus,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "./types";

export interface RowActionsProps {
  order: Order;
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
  isHubManager?: boolean;
}

export function RowActions({
  order,
  onUpdateOrderStatus,
  onUpdatePaymentStatus,
  onDeleteOrder,
  onViewDetails,
  updateSingleOrderStatus,
  updateSinglePaymentStatus,
  isHubManager = false,
}: RowActionsProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignRiderOpen, setAssignRiderOpen] = useState(false);
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [printReceiptOpen, setPrintReceiptOpen] = useState(false);
  const assignRider = useMutation(api.data.orders.assignRider);

  const handleOrderStatusUpdate = (status: OrderStatus) => {
    if (updateSingleOrderStatus) {
      updateSingleOrderStatus(order._id, status);
    } else if (onUpdateOrderStatus) {
      onUpdateOrderStatus(order._id, status);
    }
  };

  const handlePaymentStatusUpdate = (status: PaymentStatus) => {
    if (updateSinglePaymentStatus) {
      updateSinglePaymentStatus(order._id, status);
    } else if (onUpdatePaymentStatus) {
      onUpdatePaymentStatus(order._id, status);
    }
  };

  const handleDelete = () => {
    if (onDeleteOrder) {
      onDeleteOrder(order._id);
    }
    setDeleteDialogOpen(false);
  };

  const handleAssignRider = async (riderId: Id<"users">) => {
    try {
      await assignRider({
        orderId: order._id,
        riderId,
      });

      toast.success("Rider assigned successfully");
    } catch (error) {
      console.error("Failed to assign rider:", error);
      toast.error(getConvexErrorMessage(error, "Failed to assign rider"));
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <HugeiconsIcon icon={MoreHorizontal} className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem onClick={() => onViewDetails?.(order)}>
            <HugeiconsIcon icon={Eye} className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setShipmentDialogOpen(true)}>
            <HugeiconsIcon icon={Package} className="mr-2 h-4 w-4" />
            View Shipment
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setPrintReceiptOpen(true)}>
            <HugeiconsIcon icon={Printer} className="mr-2 h-4 w-4" />
            Print Receipt
          </DropdownMenuItem>

          {!isHubManager && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={RefreshCw} className="mr-2 h-4 w-4" />
                  Update Order Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {ORDER_STATUSES.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => handleOrderStatusUpdate(status)}
                      disabled={order.order_status === status}
                    >
                      {status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={CreditCard} className="mr-2 h-4 w-4" />
                  Update Payment Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {PAYMENT_STATUSES.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => handlePaymentStatusUpdate(status)}
                      disabled={order.payment_status === status}
                    >
                      {status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem onClick={() => setAssignRiderOpen(true)}>
                <HugeiconsIcon icon={Bike} className="mr-2 h-4 w-4" />
                Assign Rider
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-red-600"
              >
                <HugeiconsIcon icon={Trash2} className="mr-2 h-4 w-4" />
                Delete Order
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete order #{order.reference}? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Rider Dialog */}
      <AssignRiderDialog
        open={assignRiderOpen}
        onOpenChange={setAssignRiderOpen}
        onSuccess={() => setAssignRiderOpen(false)}
        orderId={order._id}
      />

      {/* Shipment Details Dialog */}
      <ShipmentDetailsDialog
        open={shipmentDialogOpen}
        onOpenChange={setShipmentDialogOpen}
        order={order}
      />

      {/* Print Receipt Dialog */}
      <PrintReceipt
        open={printReceiptOpen}
        onOpenChange={setPrintReceiptOpen}
        order={order}
      />
    </>
  );
}
