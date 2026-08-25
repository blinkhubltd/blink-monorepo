"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BicycleIcon as Bike,
  BuildingIcon as Building,
  CarIcon as Car,
  Loading03Icon as Loader2,
  TruckDeliveryIcon as Truck,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
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
}: RiderDetailsDialogProps) {
  const [vehicleType, setVehicleType] = useState<string>("");
  const [vehiclePlate, setVehiclePlate] = useState<string>("");
  const [status, setStatus] = useState<string>("Active");
  const [vendorId, setVendorId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);

  const vendorsQuery = useQuery(api.data.vendors.getActiveVendors, {});
  const vendors: Doc<"vendors">[] = vendorsQuery?.data || [];

  const assignRiderWithDetailsMutation = useMutation(
    api.user.users.assignRiderWithDetails,
  );

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
      await assignRiderWithDetailsMutation({
        userId,
        vehicleType: vehicleType as "Motorbike" | "Bicycle" | "Car" | "Van",
        vehiclePlate: vehiclePlate.trim() || undefined,
        vendorId: vendorId ? (vendorId as Id<"vendors">) : undefined,
        status: status as "Active" | "On Delivery" | "Inactive",
      });

      toast.success(`${userName} has been assigned as rider`);
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
            Assign Rider Role
          </DialogTitle>
          <DialogDescription>
            Assign {userName} ({userEmail}) as a rider and configure their
            delivery details.
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
                {RIDER_STATUSES.map((statusOption) => (
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
            Assign Rider Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RiderDetailsDialog;
