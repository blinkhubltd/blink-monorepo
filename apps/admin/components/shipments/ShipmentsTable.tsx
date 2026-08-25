"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon as ChevronLeft,
  ArrowLeftDoubleIcon as ChevronFirst,
  ArrowRight01Icon as ChevronRight,
  ArrowRightDoubleIcon as ChevronLast,
  Call02Icon as Phone,
  CreditCardIcon as CreditCard,
  EditIcon as Edit,
  FilterIcon as Filter,
  Location01Icon as MapPin,
  Mail01Icon as Mail,
  MoreHorizontalIcon as MoreHorizontal,
  PackageIcon as Package,
  Search01Icon as Search,
  TruckDeliveryIcon as Truck,
  User02Icon as User,
  UserCheckIcon as UserCheck,
  UserXIcon as UserX,
  ViewIcon as Eye,
} from "@hugeicons/core-free-icons";
import React, { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { formatKES, getConvexErrorMessage } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Separator } from "@repo/ui/components/ui/separator";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@repo/ui/components/ui/pagination";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@repo/ui/components/ui/dropdown-menu";
import { formatDate } from "@/lib/date-utils";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export type ShipmentStatus =
  | "Awaiting Pickup"
  | "Picked Up"
  | "Out for Delivery"
  | "Delivered"
  | "Failed Delivery";

interface Shipment {
  _id: Id<"shipments">;
  _creationTime: number;
  status: ShipmentStatus;
  order?: {
    _id: Id<"orders">;
    reference: string;
    order_date: number;
    total_amount: number;
    payment_method?: string;
    payment_status?: "Paid" | "Unpaid";
  } | null;
  customer?: {
    _id: Id<"users">;
    name: string;
    email: string;
    phone?: string;
  } | null;
  vendor?: {
    _id: Id<"vendors">;
    name: string;
  } | null;
  rider?: {
    _id: Id<"users">;
    name: string;
    email?: string;
    phone?: string;
  } | null;
  updated_at: number;
  pickup_address?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    country?: string;
  };
  delivery_address?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    country?: string;
  };
}

/** Format a millisecond duration into a short human-readable string. */
function formatDuration(ms: number): string {
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

/**
 * Return Tailwind classes for duration badge.
 * Lesser duration = more positive (green); longer = red.
 */
function getDurationColor(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 10) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (minutes < 15) return "bg-green-100 text-green-700 border-green-200";
  if (minutes < 20) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (minutes < 25) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-red-100 text-red-700 border-red-200";
}

const getStatusColor = (status: ShipmentStatus) => {
  switch (status) {
    case "Awaiting Pickup":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "Picked Up":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Out for Delivery":
      return "bg-green-100 text-green-800 border-green-200";
    case "Delivered":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Failed Delivery":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

interface ShipmentsTableProps {
  limit?: number;
  onLimitChange?: (limit: number) => void;
  isHubManager?: boolean;
}

export function ShipmentsTable({
  limit = 10,
  onLimitChange,
  isHubManager = false,
}: ShipmentsTableProps) {
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [riderFilter, setRiderFilter] = useState<string>("all");
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(
    null,
  );
  const { availableRiders, isLoaded } = useDashboardData();

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  const vendorsData = useQuery(api.data.vendors.getActiveVendors, {
    limit: 100,
    cursor: null,
  });

  const allRiders = useQuery(api.user.users.getAllRiders);

  const statusArg: ShipmentStatus | undefined =
    statusFilter === "all"
      ? undefined
      : statusFilter === "awaiting pickup"
        ? "Awaiting Pickup"
        : statusFilter === "picked up"
          ? "Picked Up"
          : statusFilter === "out for delivery"
            ? "Out for Delivery"
            : statusFilter === "delivered"
              ? "Delivered"
              : "Failed Delivery";

  // convex queries
  const shipmentsData = useQuery(api.data.shipments.getShipments, {
    limit,
    cursor: currentCursor,
    search: debouncedSearchTerm.trim() ? debouncedSearchTerm : undefined,
    status: statusArg,
    vendor_id:
      vendorFilter !== "all" ? (vendorFilter as Id<"vendors">) : undefined,
    rider_id: riderFilter !== "all" ? (riderFilter as Id<"users">) : undefined,
  });
  const updateShipmentStatus = useMutation(api.data.shipments.updateStatus);
  const reassignRider = useMutation(api.data.shipments.reassignRider);
  const backfillShipmentsSearchText = useMutation(
    api.data.shipments.backfillShipmentsSearchText,
  );

  // State for rider reassignment
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [selectedShipmentForReassign, setSelectedShipmentForReassign] =
    useState<Id<"shipments"> | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<Id<"users"> | "">("");

  const shipments = shipmentsData?.data ?? [];
  const pagination = shipmentsData?.pagination;

  // Calculate total pages for better navigation
  const totalPages = pagination ? Math.ceil(pagination.total / limit) : 1;
  const startRecord =
    pagination?.total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endRecord = Math.min(currentPage * limit, pagination?.total ?? 0);

  useEffect(() => {
    // Reset pagination when search, status, vendor, or rider changes
    setCursors([null]);
    setCurrentCursor(null);
    setCurrentPage(1);
  }, [debouncedSearchTerm, statusArg, vendorFilter, riderFilter]);

  useEffect(() => {
    if (!shipmentsData || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      (shipmentsData.data as any[]).some((s) => !s.searchText) ||
      (debouncedSearchTerm.trim().length > 0 &&
        shipmentsData.pagination.total > 0 &&
        shipmentsData.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    backfillShipmentsSearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.success("Search index updated", {
            description: `Updated ${updatedCount} shipments for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill shipments searchText:", error);
      });
  }, [
    shipmentsData,
    hasTriggeredSearchBackfill,
    debouncedSearchTerm,
    backfillShipmentsSearchText,
  ]);

  const handleNext = useCallback(() => {
    if (pagination?.hasNext && pagination.cursor) {
      setCursors((prev) => [...prev, pagination.cursor]);
      setCurrentCursor(pagination.cursor ?? null);
      setCurrentPage((prev) => prev + 1);
    }
  }, [pagination]);

  const handlePrevious = useCallback(() => {
    if (currentPage > 1) {
      const newCursors = cursors.slice(0, -1);
      setCursors(newCursors);
      setCurrentCursor(newCursors[newCursors.length - 1] ?? null);
      setCurrentPage((prev) => prev - 1);
    }
  }, [currentPage, cursors]);

  const handleFirst = useCallback(() => {
    setCursors([null]);
    setCurrentCursor(null);
    setCurrentPage(1);
  }, []);

  const handleLast = useCallback(() => {
    // Note: This is a simplified implementation
    // In a real scenario, you'd need the backend to support jumping to the last page
    if (pagination?.hasNext) {
      // This would need backend support to get the last page cursor
      toast.info("Jump to last page not implemented yet");
    }
  }, [pagination]);

  const handleStatusChange = async (
    shipmentId: Id<"shipments">,
    status: ShipmentStatus,
  ) => {
    try {
      await updateShipmentStatus({ shipmentId, status });
      toast.success(`Shipment status updated to ${status}`);
    } catch (error) {
      console.error("Error updating shipment status:", error);
      toast.error(
        getConvexErrorMessage(error, "Failed to update shipment status"),
      );
    }
  };

  const handleReassignClick = (shipmentId: Id<"shipments">) => {
    const shipment = shipments.find((s: Shipment) => s._id === shipmentId);
    setSelectedShipmentForReassign(shipmentId);
    setSelectedRiderId(shipment?.rider?._id || "");
    setReassignDialogOpen(true);
  };

  const handleReassignSubmit = async () => {
    if (!selectedShipmentForReassign || !selectedRiderId) return;

    try {
      await reassignRider({
        shipmentId: selectedShipmentForReassign,
        riderId: selectedRiderId as Id<"users">,
      });

      toast.success("Rider reassigned successfully");
      setReassignDialogOpen(false);
    } catch (error) {
      console.error("Error reassigning rider:", error);
      toast.error(getConvexErrorMessage(error, "Failed to reassign rider"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <HugeiconsIcon icon={Search} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search shipments by reference, customer, vendor, or rider..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              {/* <HugeiconsIcon icon={Filter} className="mr-2 h-4 w-4" /> */}
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="awaiting pickup">Awaiting Pickup</SelectItem>
              <SelectItem value="picked up">Picked Up</SelectItem>
              <SelectItem value="out for delivery">Out for Delivery</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="failed delivery">Failed Delivery</SelectItem>
            </SelectContent>
          </Select>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendorsData?.data.map((v: any) => (
                <SelectItem key={v._id} value={v._id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={riderFilter} onValueChange={setRiderFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All riders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Riders</SelectItem>
              {(allRiders ?? []).map((r: any) => (
                <SelectItem key={r._id} value={r._id}>
                  {r.name ||
                    `${r.first_name || ""} ${r.last_name || ""}`.trim() ||
                    r.email?.split("@")[0] ||
                    "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80">
              <TableHead className="font-semibold">Order Ref</TableHead>
              <TableHead className="font-semibold">Customer</TableHead>
              <TableHead className="font-semibold">Vendor</TableHead>
              <TableHead className="font-semibold">Rider</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Total</TableHead>
              <TableHead className="font-semibold">Duration</TableHead>
              <TableHead className="font-semibold">Updated</TableHead>
              <TableHead className="font-semibold w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-3">
                    <HugeiconsIcon icon={Truck} className="h-16 w-16 opacity-40" />
                    <div className="font-medium text-lg">
                      No shipments found
                    </div>
                    <div className="text-sm">
                      {searchTerm || statusFilter !== "all"
                        ? "Try adjusting your search or filter criteria"
                        : "No shipments to display"}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              shipments.map((shipment: Shipment) => (
                <TableRow key={shipment._id} className="hover:bg-gray-50/50">
                  <TableCell className="font-mono text-sm">
                    {shipment.order?.reference.slice(-6).toUpperCase() ?? "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {shipment.customer?.name ?? "-"}
                      </span>
                      {shipment.customer?.email && (
                        <span className="text-sm text-muted-foreground">
                          {shipment.customer.email}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {shipment.vendor?.name ?? "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {shipment.rider?.name ?? "-"}
                      </span>
                      {shipment.rider?.phone && (
                        <span className="text-sm text-muted-foreground">
                          {shipment.rider.phone}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getStatusColor(shipment.status)}
                    >
                      {shipment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {shipment.order
                      ? formatKES(shipment.order.total_amount)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const durationMs =
                        shipment.updated_at - shipment._creationTime;
                      const safeDuration = Math.max(0, durationMs);
                      return (
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${getDurationColor(
                            safeDuration,
                          )}`}
                        >
                          {formatDuration(safeDuration)}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(shipment.updated_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100"
                        >
                          <HugeiconsIcon icon={MoreHorizontal} className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => setSelectedShipment(shipment)}
                        >
                          <HugeiconsIcon icon={Eye} className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        {!isHubManager && (
                          <>
                            <DropdownMenuItem
                              onClick={() => handleReassignClick(shipment._id)}
                            >
                              <HugeiconsIcon icon={Truck} className="h-4 w-4 mr-2" /> Reassign Rider
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {shipment.status === "Delivered" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(
                                    shipment._id,
                                    "Failed Delivery",
                                  )
                                }
                                className="text-red-600 focus:text-red-600"
                              >
                                <HugeiconsIcon icon={UserX} className="h-4 w-4 mr-2" /> Mark as
                                Failed
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(shipment._id, "Delivered")
                                }
                                className="text-green-600 focus:text-green-600"
                              >
                                <HugeiconsIcon icon={UserCheck} className="h-4 w-4 mr-2" /> Mark as
                                Delivered
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Reassign Rider Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reassign Rider</DialogTitle>
            <DialogDescription>
              Select a new rider for this shipment.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {!isLoaded ? (
              <div className="flex justify-center py-4">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-primary" />
              </div>
            ) : availableRiders.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No available riders found.
              </div>
            ) : (
              <RadioGroup
                value={selectedRiderId}
                onValueChange={(value) =>
                  setSelectedRiderId(value as Id<"users">)
                }
                className="space-y-2"
              >
                {availableRiders.map((rider) => {
                  const currentShipment = shipments.find(
                    (s: Shipment) => s._id === selectedShipmentForReassign,
                  );
                  const isCurrentRider =
                    currentShipment?.rider?._id === rider._id;

                  return (
                    <div key={rider._id} className="flex items-start space-x-2">
                      <RadioGroupItem
                        value={rider._id}
                        id={`rider-${rider._id}`}
                        disabled={isCurrentRider}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={`rider-${rider._id}`}
                          className={`cursor-pointer ${isCurrentRider ? "opacity-50" : ""}`}
                        >
                          <div className="font-medium flex items-center gap-2">
                            <HugeiconsIcon icon={User} className="h-4 w-4" />
                            {rider.name}
                            {isCurrentRider && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                Current Rider
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {rider.email}
                            {rider.phone && ` • ${rider.phone}`}
                          </div>
                        </Label>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReassignDialogOpen(false)}
              disabled={!isLoaded}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReassignSubmit}
              disabled={!selectedRiderId || !isLoaded}
            >
              Reassign Rider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-white">
          <div className="flex items-center space-x-2">
            <Label
              htmlFor="rows-per-page"
              className="text-sm text-muted-foreground"
            >
              Rows per page
            </Label>
            <Select
              value={String(limit)}
              onValueChange={(value) => onLimitChange?.(Number(value))}
            >
              <SelectTrigger
                id="rows-per-page"
                className="w-fit whitespace-nowrap"
              >
                <SelectValue placeholder={limit} />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 20, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={String(pageSize)}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-6 lg:space-x-8">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground">
                {startRecord}–{endRecord}
              </span>{" "}
              of <span className="text-foreground">{pagination.total}</span>
            </p>

            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 p-0 bg-transparent"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    aria-label="Go to first page"
                  >
                    <HugeiconsIcon icon={ChevronFirst} className="h-4 w-4" />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 p-0 bg-transparent"
                    onClick={handlePrevious}
                    disabled={currentPage === 1}
                    aria-label="Go to previous page"
                  >
                    <HugeiconsIcon icon={ChevronLeft} className="h-4 w-4" />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 p-0 bg-transparent"
                    onClick={handleNext}
                    disabled={!pagination?.hasNext}
                    aria-label="Go to next page"
                  >
                    <HugeiconsIcon icon={ChevronRight} className="h-4 w-4" />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 p-0 bg-transparent"
                    onClick={handleLast}
                    disabled={!pagination?.hasNext}
                    aria-label="Go to last page"
                  >
                    <HugeiconsIcon icon={ChevronLast} className="h-4 w-4" />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}

      {/* Shipment Details Dialog */}
      <Dialog
        open={!!selectedShipment}
        onOpenChange={() => setSelectedShipment(null)}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">
              Shipment Details - {selectedShipment?.order?.reference}
            </DialogTitle>
            <DialogDescription>
              Complete information for this shipment
            </DialogDescription>
          </DialogHeader>
          {selectedShipment && (
            <div className="space-y-6">
              {/* Status and Basic Info */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-semibold text-lg mb-1">Current Status</h4>
                  <Badge
                    variant="outline"
                    className={`${getStatusColor(selectedShipment.status)} text-base px-3 py-1`}
                  >
                    {selectedShipment.status}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">
                    {formatDate(selectedShipment.updated_at)}
                  </p>
                </div>
              </div>

              {/* Customer and Order Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-base">
                    <HugeiconsIcon icon={User} className="h-5 w-5" /> Customer Information
                  </h4>
                  <div className="space-y-2 pl-7">
                    <p className="font-medium">
                      {selectedShipment.customer?.name ?? "Not specified"}
                    </p>
                    {selectedShipment.customer?.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <HugeiconsIcon icon={Mail} className="h-4 w-4" />
                        {selectedShipment.customer.email}
                      </p>
                    )}
                    {selectedShipment.customer?.phone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <HugeiconsIcon icon={Phone} className="h-4 w-4" />
                        {selectedShipment.customer.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-base">
                    <HugeiconsIcon icon={Package} className="h-5 w-5" /> Order Information
                  </h4>
                  <div className="space-y-2 pl-7">
                    <p>
                      <span className="font-medium">Reference:</span>{" "}
                      {selectedShipment.order?.reference ?? "Not specified"}
                    </p>
                    <p>
                      <span className="font-medium">Total Amount:</span>{" "}
                      {selectedShipment.order
                        ? formatKES(selectedShipment.order.total_amount)
                        : "Not specified"}
                    </p>
                    {selectedShipment.order?.payment_status && (
                      <p>
                        <span className="font-medium">Payment Status:</span>{" "}
                        <Badge
                          variant={
                            selectedShipment.order.payment_status === "Paid"
                              ? "default"
                              : "destructive"
                          }
                          className="ml-1"
                        >
                          {selectedShipment.order.payment_status}
                        </Badge>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Vendor and Rider Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-base">
                    <HugeiconsIcon icon={Package} className="h-5 w-5" /> Vendor Information
                  </h4>
                  <div className="pl-7">
                    <p className="font-medium">
                      {selectedShipment.vendor?.name ?? "Not assigned"}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-base">
                    <HugeiconsIcon icon={Truck} className="h-5 w-5" /> Rider Information
                  </h4>
                  <div className="space-y-2 pl-7">
                    <p className="font-medium">
                      {selectedShipment.rider?.name ?? "Not assigned"}
                    </p>
                    {selectedShipment.rider?.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <HugeiconsIcon icon={Mail} className="h-4 w-4" />
                        {selectedShipment.rider.email}
                      </p>
                    )}
                    {selectedShipment.rider?.phone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <HugeiconsIcon icon={Phone} className="h-4 w-4" />
                        {selectedShipment.rider.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Addresses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-base">
                    <HugeiconsIcon icon={MapPin} className="h-5 w-5" /> Pickup Address
                  </h4>
                  <div className="pl-7 space-y-1">
                    {selectedShipment.pickup_address ? (
                      <>
                        <p>{selectedShipment.pickup_address.address_1}</p>
                        {selectedShipment.pickup_address.address_2 && (
                          <p>{selectedShipment.pickup_address.address_2}</p>
                        )}
                        <p>
                          {selectedShipment.pickup_address.city},{" "}
                          {selectedShipment.pickup_address.country}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">Not specified</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-base">
                    <HugeiconsIcon icon={MapPin} className="h-5 w-5" /> Delivery Address
                  </h4>
                  <div className="pl-7 space-y-1">
                    {selectedShipment.delivery_address ? (
                      <>
                        <p>{selectedShipment.delivery_address.address_1}</p>
                        {selectedShipment.delivery_address.address_2 && (
                          <p>{selectedShipment.delivery_address.address_2}</p>
                        )}
                        <p>
                          {selectedShipment.delivery_address.city},{" "}
                          {selectedShipment.delivery_address.country}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">Not specified</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
