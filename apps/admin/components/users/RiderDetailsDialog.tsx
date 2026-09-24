"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BicycleIcon as Bike,
  BuildingIcon as Building,
  CarIcon as Car,
  Loading03Icon as Loader2,
  TruckDeliveryIcon as Truck,
} from "@hugeicons/core-free-icons";
import React, { useEffect, useState } from "react";
import type { Doc } from "@repo/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { Input } from "@repo/ui/components/ui/input";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import type { Id } from "@repo/backend/dataModel";

interface RiderDetailsDialogProps {
  userId: Id<"users">;
  userName: string;
  userEmail: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /**
   * The rider's current details. Present = edit mode: the form opens
   * pre-filled and saves through `updateRiderDetails`, which merges into
   * `rider_details` instead of replacing it (so rating, location and ID
   * images survive). Absent = make this user a rider.
   */
  initial?: {
    vendorId?: string;
    vehicleType?: string;
    vehiclePlate?: string;
    status?: string;
  };
}

const VEHICLE_TYPES = [
  { value: "Motorbike", label: "Motorbike", icon: Bike },
  { value: "Bicycle", label: "Bicycle", icon: Bike },
  { value: "Car", label: "Car", icon: Car },
  { value: "Van", label: "Van", icon: Truck },
] as const;

const RIDER_STATUSES = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
] as const;

export function RiderDetailsDialog({
  userId,
  userName,
  userEmail,
  isOpen,
  onClose,
  onSuccess,
  initial,
}: RiderDetailsDialogProps) {
  const isEdit = initial !== undefined;
  const [vehicleType, setVehicleType] = useState<string>("");
  const [vehiclePlate, setVehiclePlate] = useState<string>("");
  const [status, setStatus] = useState<string>("Active");
  const [vendorId, setVendorId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Load the rider's current values each time the dialog opens in edit mode.
  useEffect(() => {
    if (!isOpen || !initial) return;
    setVehicleType(initial.vehicleType ?? "");
    setVehiclePlate(initial.vehiclePlate ?? "");
    setStatus(initial.status ?? "Inactive");
    setVendorId(initial.vendorId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open transition only
  }, [isOpen]);

  const vendorsQuery = useQuery(api.data.vendors.getActiveVendors, {});
  const vendors: Doc<"vendors">[] = vendorsQuery?.data || [];

  const assignRiderWithDetailsMutation = useMutation(
    api.user.users.assignRiderWithDetails,
  );
  const updateRiderDetailsMutation = useMutation(
    api.user.users.updateRiderDetails,
  );

  // "On Delivery" is set by the delivery flow, not chosen here — but a rider
  // who is on one must still show it, or the select would render blank.
  const statusOptions =
    initial?.status && !RIDER_STATUSES.some((s) => s.value === initial.status)
      ? [...RIDER_STATUSES, { value: initial.status, label: initial.status }]
      : RIDER_STATUSES;

  const handleAssign = async () => {
    if (!vendorId) {
      toast.error("Please select a vendor");
      return;
    }
    if (!vehicleType) {
      toast.error("Please select a vehicle type");
      return;
    }

    setIsAssigning(true);
    try {
      const details = {
        userId,
        vehicleType: vehicleType as "Motorbike" | "Bicycle" | "Car" | "Van",
        vehiclePlate: vehiclePlate.trim() || undefined,
        status: status as "Active" | "On Delivery" | "Inactive",
      };
      if (isEdit) {
        // No status: in edit mode it is the rider's own online switch, and
        // whether they may work at all is the approval section below.
        await updateRiderDetailsMutation({
          userId: details.userId,
          vehicleType: details.vehicleType,
          vehiclePlate: details.vehiclePlate,
          vendorId: vendorId as Id<"vendors">,
        });
      } else {
        await assignRiderWithDetailsMutation({
          ...details,
          vendorId: vendorId ? (vendorId as Id<"vendors">) : undefined,
        });
      }

      toast.success(
        isEdit
          ? `${userName}'s rider details were updated`
          : `${userName} has been assigned as rider`,
      );
      resetForm();
      onClose();
      onSuccess?.();
    } catch (error: any) {
      console.error("Error assigning rider:", error);
      toast.error(getConvexErrorMessage(error, "Failed to assign rider role"));
    } finally {
      setIsAssigning(false);
    }
  };

  const resetForm = () => {
    setVehicleType("");
    setVehiclePlate("");
    setStatus("Active");
    setVendorId("");
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  const selectedVehicleType = VEHICLE_TYPES.find(
    (v) => v.value === vehicleType,
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Truck} className="h-5 w-5" />
            {isEdit ? "Rider Details" : "Assign Rider Role"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Review ${userName}'s (${userEmail}) documents, and update their vendor and vehicle.`
              : `Assign ${userName} (${userEmail}) as a rider and configure their delivery details.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="vendor-select">Vendor Assignment*</Label>
            <Select
              value={vendorId}
              onValueChange={setVendorId}
              disabled={isAssigning}
            >
              <SelectTrigger id="vendor-select">
                <SelectValue placeholder="Choose a vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor: Doc<"vendors">) => (
                  <SelectItem key={vendor._id} value={vendor._id}>
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={Building} className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="font-medium">{vendor.name}</span>
                        <span className="text-xs text-gray-500">
                          {vendor.address?.city || "Location not specified"}
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle-select">Vehicle Type *</Label>
            <Select
              value={vehicleType}
              onValueChange={setVehicleType}
              disabled={isAssigning}
            >
              <SelectTrigger id="vehicle-select">
                <SelectValue placeholder="Choose a vehicle type" />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((vehicle) => {
                  const IconComponent = vehicle.icon;
                  return (
                    <SelectItem key={vehicle.value} value={vehicle.value}>
                      <div className="flex items-center gap-2">
                        <HugeiconsIcon icon={IconComponent} className="h-4 w-4" />
                        <span>{vehicle.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle-plate">
              Vehicle Plate Number (Optional)
            </Label>
            <Input
              id="vehicle-plate"
              type="text"
              placeholder="e.g., ABC-123"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              disabled={isAssigning}
            />
          </div>

          {isEdit ? (
            <RiderApprovalSection userId={userId} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="status-select">Initial Status</Label>
              <Select
                value={status}
                onValueChange={setStatus}
                disabled={isAssigning}
              >
                <SelectTrigger id="status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((statusOption) => (
                    <SelectItem
                      key={statusOption.value}
                      value={statusOption.value}
                    >
                      {statusOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedVehicleType && (
            <div className="bg-gray-50 p-3 rounded-lg space-y-2">
              <div className="text-sm font-medium">Rider Configuration:</div>
              <div className="text-sm text-gray-600">
                <div>
                  <strong>Vendor:</strong>{" "}
                  {vendorId
                    ? vendors.find(
                        (
                          v: import("@repo/backend/dataModel").Doc<"vendors">,
                        ) => v._id === vendorId,
                      )?.name || "Selected vendor"
                    : "Not assigned"}
                </div>
                <div>
                  <strong>Vehicle:</strong> {selectedVehicleType.label}
                </div>
                <div>
                  <strong>Plate:</strong> {vehiclePlate || "Not specified"}
                </div>
                <div>
                  <strong>Status:</strong> {status}
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
            <div className="text-sm text-blue-800">
              <strong>Note:</strong> This user will have rider access and will
              be able to receive delivery assignments and update their location.
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isAssigning}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!vehicleType || !vendorId || isAssigning}
          >
            {isAssigning && <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Details" : "Assign Rider Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RiderDetailsDialog;

/**
 * The rider's submitted documents and the approve / revoke control.
 *
 * Approval is what lets a rider into the app (`user/rider_onboarding.ts`) —
 * separate from their online/offline status, which is theirs to switch. The
 * rider submits phone, ID photo and licence photo from the rider app; this
 * is where an admin looks at them and says yes.
 */
function RiderApprovalSection({ userId }: { userId: Id<"users"> }) {
  const docs = useQuery(api.user.rider_onboarding.getRiderDocuments, { userId });
  const approve = useMutation(api.user.rider_onboarding.approveRider);
  const revoke = useMutation(api.user.rider_onboarding.revokeRiderApproval);
  const [busy, setBusy] = useState(false);

  if (docs === undefined) {
    return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  }

  const run = async (action: "approve" | "revoke") => {
    setBusy(true);
    try {
      if (action === "approve") {
        await approve({ userId });
        toast.success("Rider approved. They can go online now.");
      } else {
        await revoke({ userId });
        toast.success("Approval withdrawn. The rider is offline and back in review.");
      }
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Could not update approval"));
    } finally {
      setBusy(false);
    }
  };

  const approved = docs.approvedAt !== null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Documents &amp; approval</span>
        <span
          className={
            approved
              ? "rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
              : docs.missing.length > 0
                ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
                : "rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
          }
        >
          {approved
            ? "Approved"
            : docs.missing.length > 0
              ? "Awaiting documents"
              : "Pending review"}
        </span>
      </div>

      <div className="text-sm">
        <span className="text-muted-foreground">Phone: </span>
        {docs.phone ?? <span className="text-amber-700">not provided</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DocumentThumb label="ID photo" url={docs.idImageUrl} />
        <DocumentThumb label="Licence photo" url={docs.licenseImageUrl} />
      </div>

      {approved ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Approved {new Date(docs.approvedAt!).toLocaleDateString()}
            {docs.approvedBy ? ` by ${docs.approvedBy}` : ""}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void run("revoke")}
          >
            Revoke approval
          </Button>
        </div>
      ) : docs.missing.length > 0 ? (
        <p className="text-xs text-amber-700">
          Waiting on the rider for: {docs.missing.join(", ")}. They add these
          from the rider app after signing in.
        </p>
      ) : (
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={() => void run("approve")}
        >
          {busy && <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />}
          Approve rider
        </Button>
      )}
    </div>
  );
}

function DocumentThumb({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URL */}
          <img
            src={url}
            alt={label}
            className="h-24 w-full rounded-md border object-cover hover:opacity-90"
          />
        </a>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          Not submitted
        </div>
      )}
    </div>
  );
}
