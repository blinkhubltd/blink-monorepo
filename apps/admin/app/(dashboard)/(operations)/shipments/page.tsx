"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CancelCircleIcon as XCircle,
  ChartBarLineIcon as BarChart3,
  CheckmarkCircle02Icon as CheckCircle,
  Clock01Icon as Clock,
  Download01Icon as Download,
  PackageIcon as Package,
  PlusSignIcon as Plus,
  TruckDeliveryIcon as Truck,
} from "@hugeicons/core-free-icons";
import { useState, useMemo } from "react";
import { ShipmentsTable } from "@/components/shipments/ShipmentsTable";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import Link from "next/link";

export default function ShipmentsPage() {
  const { shipments, isLoaded } = useDashboardData();
  const { currentUser } = require("@/lib/auth/AuthContext").useAuth();
  const { isAdminUser } = useCurrentUserPermissions();
  const [limit, setLimit] = useState(10);

  const ShipmentInsightsLink = () =>
    isAdminUser ? (
      <Link href="/shipments/insights">
        <Button variant="outline" size="sm">
          <HugeiconsIcon icon={BarChart3} className="w-4 h-4 mr-2" />
          View Insights
        </Button>
      </Link>
    ) : null;

  // Filter shipments for managers with assigned vendors
  const filteredShipments = useMemo(() => {
    if (!shipments) return [];
    const assignedVendorIds = currentUser?.manager_details?.vendor_id;
    if (assignedVendorIds && assignedVendorIds.length > 0) {
      return shipments.filter((shipment: any) =>
        assignedVendorIds.includes(shipment.vendor?._id),
      );
    }
    return shipments;
  }, [shipments, currentUser]);

  // Calculate statistics
  const totalShipments = filteredShipments.length;
  const deliveredShipments =
    filteredShipments.filter((shipment) => shipment.status === "Delivered")
      .length || 0;
  const awaitingPickupShipments =
    filteredShipments.filter(
      (shipment) => shipment.status === "Awaiting Pickup",
    ).length || 0;
  const pickedUpShipments =
    filteredShipments.filter((shipment) => shipment.status === "Picked Up")
      .length || 0;
  const outForDeliveryShipments =
    filteredShipments.filter(
      (shipment) => shipment.status === "Out for Delivery",
    ).length || 0;
  const failedShipments =
    filteredShipments.filter(
      (shipment) => shipment.status === "Failed Delivery",
    ).length || 0;

  // Calculate in-transit shipments (Picked Up + Out for Delivery)
  const inTransitShipments = pickedUpShipments + outForDeliveryShipments;

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">
            Loading shipments...
          </p>
        </div>
      </div>
    );
  }

  const isVendorManager =
    (currentUser?.manager_details?.vendor_id?.length ?? 0) > 0;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Shipments</h2>
          <p className="text-muted-foreground">
            Manage and track all your shipments in one place
          </p>
        </div>
        <ShipmentInsightsLink />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Shipments
            </CardTitle>
            <HugeiconsIcon icon={Package} className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalShipments}</div>
            <p className="text-xs text-muted-foreground">Across all statuses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
            <HugeiconsIcon icon={Truck} className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inTransitShipments}</div>
            <p className="text-xs text-muted-foreground">
              Currently being delivered
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Awaiting Pickup
            </CardTitle>
            <HugeiconsIcon icon={Clock} className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{awaitingPickupShipments}</div>
            <p className="text-xs text-muted-foreground">Ready for pickup</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <HugeiconsIcon icon={CheckCircle} className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deliveredShipments}</div>
            <p className="text-xs text-muted-foreground">
              Successfully delivered
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Failed Deliveries
            </CardTitle>
            <HugeiconsIcon icon={XCircle} className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failedShipments}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <ShipmentsTable
            isHubManager={isVendorManager}
            limit={limit}
            onLimitChange={(newLimit) => setLimit(newLimit)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
