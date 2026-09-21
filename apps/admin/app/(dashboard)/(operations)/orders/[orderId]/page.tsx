"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon as ArrowLeft,
  BicycleIcon as Bike,
  Call02Icon as Phone,
  Location01Icon as MapPin,
  Mail01Icon as Mail,
  Note01Icon as Note,
  PrinterIcon as Printer,
  Store01Icon as Store,
  UserIcon as User,
} from "@hugeicons/core-free-icons";
import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { toast } from "sonner";

import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { Separator } from "@repo/ui/components/ui/separator";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";

import { AssignRiderDialog } from "@/components/orders/AssignRiderDialog";
import { PrintReceipt } from "@/components/orders/PrintReceipt";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_COLORS,
  type Order,
  type OrderStatus,
  type PaymentStatus,
} from "@/components/orders/types";
import { formatDate, DATE_FORMATS } from "@/lib/date-utils";
import { formatKES, getConvexErrorMessage } from "@/lib/utils";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { canTransitionOrder } from "@repo/lib/utils";

/**
 * One order, as a page. URL `/orders/[orderId]`.
 *
 * Replaces a "View Details" action that did nothing: the orders list set a
 * `selectedOrderForDetails` and fetched the order, and no component ever read
 * either, so the click was silently discarded. A page rather than the dialog
 * that was presumably intended, because an order is something staff work on —
 * assign, print, move through statuses — and a URL can be shared, reloaded and
 * opened in a second tab beside the list.
 *
 * Reads through `orders.getOrderDetails`, which checks `orders:READ` and a hub
 * manager's vendor scope on the server. `null` covers both "no such order" and
 * "not yours", deliberately indistinguishable.
 */

/**
 * Statuses that end or reverse an order. Confirmed first, because a select is
 * one mis-click from any option and these are the two that cannot be walked
 * back by picking the previous value again.
 */
const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  "Cancelled",
  "Refunded",
];

type PendingChange =
  | { kind: "order"; status: OrderStatus }
  | { kind: "payment"; status: PaymentStatus };

export default function OrderDetailsPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: rawId } = use(params);
  const orderId = rawId as Id<"orders">;

  const order = useQuery(api.data.orders.getOrderDetails, { orderId });
  const { can, isLoading: permissionsLoading } = useCurrentUserPermissions();
  const canUpdate = can("orders:UPDATE");

  const updateOrderStatus = useMutation(api.data.orders.updateOrderStatus);
  const updatePaymentStatus = useMutation(api.data.orders.updatePaymentStatus);

  const [assignOpen, setAssignOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);

  async function apply(change: PendingChange) {
    setSaving(true);
    try {
      if (change.kind === "order") {
        await updateOrderStatus({ orderId, status: change.status });
        toast.success(`Order marked ${change.status}`);
      } else {
        await updatePaymentStatus({ orderId, status: change.status });
        toast.success(`Payment marked ${change.status}`);
      }
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Could not update the order"));
    } finally {
      setSaving(false);
      setPending(null);
    }
  }

  function requestOrderStatus(status: OrderStatus) {
    const change: PendingChange = { kind: "order", status };
    if (TERMINAL_ORDER_STATUSES.includes(status)) setPending(change);
    else void apply(change);
  }

  function requestPaymentStatus(status: PaymentStatus) {
    const change: PendingChange = { kind: "payment", status };
    // Money moving backwards is confirmed; recording a payment is not.
    if (status === "Refunded" || status === "Unpaid") setPending(change);
    else void apply(change);
  }

  if (order === undefined) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <BackLink />
        <div className="bg-muted h-8 w-64 animate-pulse rounded" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="bg-muted h-80 animate-pulse rounded-xl lg:col-span-2" />
          <div className="bg-muted h-80 animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (order === null) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle>Order not found</CardTitle>
            <CardDescription>
              It may have been deleted, or it belongs to a vendor you do not
              manage.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Checkout writes the same line to `street` and `address_1`, so one of them;
  // `address_2` is the apartment or floor and is easy to lose.
  const address = [
    order.address?.address_1 ?? order.address?.street,
    order.address?.address_2,
    order.address?.city,
    order.address?.state,
    order.address?.postal_code,
    order.address?.country,
  ]
    .filter(Boolean)
    .join(", ");

  // The receipt component takes the list's row shape; this order carries every
  // field it reads.
  const receiptOrder = order as unknown as Order;

  return (
    <div className="flex-1 space-y-6 p-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              #{order.reference}
            </h1>
            <Badge
              variant="outline"
              className={ORDER_STATUS_COLORS[order.order_status]}
            >
              {order.order_status}
            </Badge>
            <Badge
              variant="outline"
              className={PAYMENT_STATUS_COLORS[order.payment_status]}
            >
              {order.payment_status}
            </Badge>
            {order.is_clearance ? (
              <Badge variant="outline">Clearance</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            Placed {formatDate(order.order_date, DATE_FORMATS.DATE_TIME)} ·{" "}
            {order.payment_method}
            {order.payment_mode === "pay_on_delivery"
              ? " · pay on delivery"
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setReceiptOpen(true)}>
            <HugeiconsIcon icon={Printer} className="mr-2 h-4 w-4" />
            Print receipt
          </Button>
          {canUpdate ? (
            <Button onClick={() => setAssignOpen(true)}>
              <HugeiconsIcon icon={Bike} className="mr-2 h-4 w-4" />
              {order.rider_id ? "Reassign rider" : "Assign rider"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: what was ordered */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>
                {order.items.length}{" "}
                {order.items.length === 1 ? "line" : "lines"} from{" "}
                {order.vendor_name ?? "this vendor"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item._id}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                          <span>SKU {item.sku}</span>
                          {item.requires_prescription ? (
                            <Badge variant="outline" className="text-xs">
                              Rx
                            </Badge>
                          ) : null}
                          {item.is_picked ? (
                            <span className="text-green-700">
                              Picked
                              {item.picked_quantity !== undefined &&
                              item.picked_quantity !== item.quantity
                                ? ` (${item.picked_quantity} of ${item.quantity})`
                                : ""}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatKES(item.price)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatKES(item.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Separator className="my-4" />

              <dl className="ml-auto max-w-xs space-y-2 text-sm">
                <MoneyRow label="Subtotal" value={order.subtotal_amount} />
                {order.discount_amount > 0 ? (
                  <MoneyRow label="Discount" value={-order.discount_amount} />
                ) : null}
                {order.tax_amount > 0 ? (
                  <MoneyRow label="Tax" value={order.tax_amount} />
                ) : null}
                <MoneyRow label="Delivery" value={order.delivery_fee} />
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{formatKES(order.total_amount)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {order.special_instructions ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HugeiconsIcon icon={Note} className="h-4 w-4" />
                  Delivery instructions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {order.special_instructions}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right: status, people, place */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              {!canUpdate && !permissionsLoading ? (
                <CardDescription>
                  You can view this order but not change it.
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Order status</label>
                <Select
                  value={order.order_status}
                  onValueChange={(value) =>
                    requestOrderStatus(value as OrderStatus)
                  }
                  disabled={!canUpdate || saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/*
                      Only the moves the server accepts: one step at a time,
                      one back for a mis-click, cancel while live, refund once
                      ended. The current status stays listed so the select
                      can show it.
                    */}
                    {ORDER_STATUSES.map((status) => (
                      <SelectItem
                        key={status}
                        value={status}
                        disabled={
                          status !== order.order_status &&
                          !canTransitionOrder(order.order_status, status)
                        }
                      >
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Payment status</label>
                <Select
                  value={order.payment_status}
                  onValueChange={(value) =>
                    requestPaymentStatus(value as PaymentStatus)
                  }
                  disabled={!canUpdate || saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <dl className="space-y-2 text-sm">
                <InfoRow
                  label="Shipment"
                  value={order.shipment_status ?? "Not created"}
                />
                <InfoRow
                  label="Confirmed"
                  value={
                    order.confirmed_at
                      ? formatDate(order.confirmed_at, DATE_FORMATS.DATE_TIME)
                      : "—"
                  }
                />
                <InfoRow
                  label="Picked up"
                  value={
                    order.picked_up_at
                      ? formatDate(order.picked_up_at, DATE_FORMATS.DATE_TIME)
                      : "—"
                  }
                />
                {order.payment_mode === "pay_now" ? (
                  <InfoRow
                    label="Delivery code"
                    value={
                      order.delivery_code_verified ? "Verified" : "Not verified"
                    }
                  />
                ) : null}
                {order.payment_reference ? (
                  <InfoRow
                    label="Payment ref"
                    value={order.payment_reference}
                    mono
                  />
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rider</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.rider_id ? (
                <>
                  <IconLine icon={Bike}>
                    {order.rider_name ?? "Unnamed rider"}
                  </IconLine>
                  {order.rider_phone ? (
                    <IconLine icon={Phone}>
                      <a
                        className="hover:underline"
                        href={`tel:${order.rider_phone}`}
                      >
                        {order.rider_phone}
                      </a>
                    </IconLine>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">No rider assigned yet.</p>
              )}
              {order.picker_name ? (
                <p className="text-muted-foreground">
                  Picked by {order.picker_name}
                </p>
              ) : null}
              {canUpdate ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setAssignOpen(true)}
                >
                  {order.rider_id ? "Reassign rider" : "Assign rider"}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <IconLine icon={User}>{order.customer_name}</IconLine>
              {order.customer_phone ? (
                <IconLine icon={Phone}>
                  <a
                    className="hover:underline"
                    href={`tel:${order.customer_phone}`}
                  >
                    {order.customer_phone}
                  </a>
                </IconLine>
              ) : null}
              {order.customer_email ? (
                <IconLine icon={Mail}>
                  <a
                    className="hover:underline"
                    href={`mailto:${order.customer_email}`}
                  >
                    {order.customer_email}
                  </a>
                </IconLine>
              ) : null}
              {order.receiver_contact ? (
                <div className="bg-muted rounded-md p-3">
                  <div className="text-muted-foreground text-xs font-medium uppercase">
                    Receiving on their behalf
                  </div>
                  <div>{order.receiver_contact.name}</div>
                  <div>{order.receiver_contact.phone}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <IconLine icon={MapPin}>
                {address || "No address on file"}
              </IconLine>
              {order.address?.lat !== undefined &&
              order.address?.lng !== undefined ? (
                <a
                  className="block text-sm font-medium hover:underline"
                  href={`https://www.google.com/maps?q=${order.address.lat},${order.address.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps
                </a>
              ) : null}
              <Separator />
              <IconLine icon={Store}>
                {order.vendor_name ?? "Unknown vendor"}
              </IconLine>
            </CardContent>
          </Card>
        </div>
      </div>

      <AssignRiderDialog
        orderId={order._id}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
      <PrintReceipt
        order={receiptOrder}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "order"
                ? `Mark this order ${pending.status}?`
                : `Mark this payment ${pending?.status}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "order"
                ? "This ends the order for the customer and the rider. It can be changed back, but they will already have been told."
                : "This records that the money has not been kept. It does not move any money by itself."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                if (pending) void apply(pending);
              }}
            >
              {saving ? "Saving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/orders"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
    >
      <HugeiconsIcon icon={ArrowLeft} className="h-4 w-4" />
      Back to orders
    </Link>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{formatKES(value)}</dd>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function IconLine({
  icon,
  children,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <HugeiconsIcon
        icon={icon}
        className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
      />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
