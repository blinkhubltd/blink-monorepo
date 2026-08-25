"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Call02Icon as Phone,
  Location01Icon as MapPin,
  Mail01Icon as Mail,
  PackageIcon as Package,
  Store01Icon as Store,
  TruckDeliveryIcon as Truck,
  User02Icon as User,
} from "@hugeicons/core-free-icons";
import React from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { formatDate, DATE_FORMATS } from "@/lib/date-utils";
import { formatKES } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Badge } from "@repo/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Order } from "./types";

interface ShipmentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
}

export function ShipmentDetailsDialog({
  open,
  onOpenChange,
  order,
}: ShipmentDetailsDialogProps) {
  const shipmentData = useQuery(api.data.shipments.getShipmentByOrderId, {
    orderId: order._id,
  });

  const orderItems = useQuery(api.data.order_items.listByOrder, {
    orderId: order._id,
  });

  const isLoading = shipmentData === undefined || orderItems === undefined;
  const hasShipment = shipmentData !== null;

  const getStatusColor = (status: string) => {
    const statusColors = {
      "Awaiting Pickup": "bg-yellow-100 text-yellow-800",
      "Picked Up": "bg-blue-100 text-blue-800",
      "Out for Delivery": "bg-purple-100 text-purple-800",
      Delivered: "bg-green-100 text-green-800",
      "Failed Delivery": "bg-red-100 text-red-800",
    };
    return (
      statusColors[status as keyof typeof statusColors] ||
      "bg-gray-100 text-gray-800"
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Package} className="h-5 w-5" />
            Shipment Details for Order #{order.reference}
          </DialogTitle>
          <DialogDescription>
            {hasShipment
              ? "Complete shipment information including delivery details"
              : "No shipment has been created for this order yet"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : !hasShipment ? (
          <div className="text-center p-8">
            <HugeiconsIcon icon={Package} className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Shipment Created</h3>
            <p className="text-muted-foreground">
              This order hasn't been assigned to a shipment yet. Contact
              logistics to create a shipment for delivery.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Shipment Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HugeiconsIcon icon={Truck} className="h-5 w-5" />
                  Shipment Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={getStatusColor(shipmentData.status)}>
                      {shipmentData.status}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-2">
                      Shipment ID: #{shipmentData._id.slice(-8).toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {formatDate(
                        shipmentData._creationTime,
                        DATE_FORMATS.DATE_TIME,
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HugeiconsIcon icon={User} className="h-5 w-5" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium">
                      {shipmentData.customer?.name || "Unknown Customer"}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <HugeiconsIcon icon={Mail} className="h-4 w-4" />
                      {shipmentData.customer?.email || "No email"}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <HugeiconsIcon icon={Phone} className="h-4 w-4" />
                      {shipmentData.customer?.phone || "No phone"}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Delivery Address
                    </p>
                    <div className="flex items-start gap-2">
                      <HugeiconsIcon icon={MapPin} className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="text-sm">
                        {shipmentData.delivery_address.street && (
                          <p>{shipmentData.delivery_address.street}</p>
                        )}
                        {shipmentData.delivery_address.city && (
                          <p>{shipmentData.delivery_address.city}</p>
                        )}
                        {shipmentData.delivery_address.state && (
                          <p>{shipmentData.delivery_address.state}</p>
                        )}
                        {shipmentData.delivery_address.country && (
                          <p>{shipmentData.delivery_address.country}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Vendor Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HugeiconsIcon icon={Store} className="h-5 w-5" />
                  Vendor Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium">
                      {shipmentData.vendor?.name || "Unknown Vendor"}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <HugeiconsIcon icon={Mail} className="h-4 w-4" />
                      {shipmentData.vendor?.contact?.email || "No email"}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <HugeiconsIcon icon={Phone} className="h-4 w-4" />
                      {shipmentData.vendor?.contact?.phone || "No phone"}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Pickup Address
                    </p>
                    <div className="flex items-start gap-2">
                      <HugeiconsIcon icon={MapPin} className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="text-sm">
                        {shipmentData.pickup_address.address_1 && (
                          <p>{shipmentData.pickup_address.address_1}</p>
                        )}
                        {shipmentData.pickup_address.city && (
                          <p>{shipmentData.pickup_address.city}</p>
                        )}
                        {shipmentData.pickup_address.country && (
                          <p>{shipmentData.pickup_address.country}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rider Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HugeiconsIcon icon={Truck} className="h-5 w-5" />
                  Rider Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium">
                      {shipmentData.rider?.name || "No rider assigned"}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <HugeiconsIcon icon={Mail} className="h-4 w-4" />
                      {shipmentData.rider?.email || "No email"}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <HugeiconsIcon icon={Phone} className="h-4 w-4" />
                      {shipmentData.rider?.phone || "No phone"}
                    </div>
                  </div>
                  <div>
                    {shipmentData.rider?.rider_details && (
                      <>
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          Rider Details
                        </p>
                        <div className="text-sm space-y-1">
                          <p>
                            License:{" "}
                            {shipmentData.rider.rider_details.vehicle_plate}
                          </p>
                          <p>
                            Vehicle:{" "}
                            {shipmentData.rider.rider_details.vehicle_type ||
                              "N/A"}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            Status:{" "}
                            {shipmentData.rider.rider_details.status || "N/A"}
                          </Badge>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HugeiconsIcon icon={Package} className="h-5 w-5" />
                  Order Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Subtotal
                    </p>
                    <p className="font-medium">
                      {formatKES(order.subtotal_amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Delivery Fee
                    </p>
                    <p className="font-medium">
                      {formatKES(order.delivery_fee)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Tax
                    </p>
                    <p className="font-medium">{formatKES(order.tax_amount)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Total
                    </p>
                    <p className="font-bold text-lg">
                      {formatKES(order.total_amount)}
                    </p>
                  </div>
                </div>

                {/* Order Items */}
                <Separator className="my-4" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    Order Items
                  </p>
                  <div className="space-y-2">
                    {orderItems && orderItems.length > 0 ? (
                      orderItems.map((item: any) => (
                        <div
                          key={item._id}
                          className="flex items-center justify-between p-3 bg-muted rounded-md"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Quantity: {item.quantity} ×{" "}
                              {formatKES(item.price)}
                            </p>
                            {item.discount > 0 && (
                              <p className="text-xs text-green-600">
                                Discount: -{formatKES(item.discount)}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              {formatKES(item.total)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No items found
                      </p>
                    )}
                  </div>
                </div>

                <Separator className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Payment Method
                    </p>
                    <p className="font-medium">{order.payment_method}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Payment Status
                    </p>
                    <Badge variant="outline">{order.payment_status}</Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Order Date
                    </p>
                    <p className="font-medium">
                      {formatDate(order.order_date, DATE_FORMATS.DATE_TIME)}
                    </p>
                  </div>
                </div>
                {order.special_instructions && (
                  <>
                    <Separator className="my-4" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        Special Instructions
                      </p>
                      <p className="text-sm bg-muted p-3 rounded-md">
                        {order.special_instructions}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
