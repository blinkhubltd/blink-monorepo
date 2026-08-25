"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BuildingIcon as Building,
  Loading03Icon as Loader2,
  PackageIcon as Package,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Doc } from "@repo/backend/dataModel";
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
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import type { Id } from "@repo/backend/dataModel";

interface PickerDetailsDialogProps {
  userId: Id<"users">;
  userName: string;
  userEmail: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PICKER_STATUSES = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
] as const;

export function PickerDetailsDialog({
  userId,
  userName,
  userEmail,
  isOpen,
  onClose,
  onSuccess,
}: PickerDetailsDialogProps) {
  const [vendorId, setVendorId] = useState<string>("");
  const [status, setStatus] = useState<string>("Active");
  const [isAssigning, setIsAssigning] = useState(false);

  const vendorsQuery = useQuery(api.data.vendors.getActiveVendors, {
    cursor: null,
    limit: 100,
  });
  const assignPickerWithDetailsMutation = useMutation(
    api.user.users.assignPickerWithDetails,
  );

  const vendors: Doc<"vendors">[] = vendorsQuery?.data || [];

  const handleAssign = async () => {
    if (!vendorId) {
      toast.error("Please select a vendor");
      return;
    }

    setIsAssigning(true);
    try {
      await assignPickerWithDetailsMutation({
        userId,
        vendorId: vendorId as Id<"vendors">,
        status: status as "Active" | "On Order" | "Inactive",
      });

      toast.success(`${userName} has been assigned as picker`);
      resetForm();
      onClose();
      onSuccess?.();
    } catch (error: any) {
      console.error("Error assigning picker:", error);
      toast.error(getConvexErrorMessage(error, "Failed to assign picker role"));
    } finally {
      setIsAssigning(false);
    }
  };

  const resetForm = () => {
    setVendorId("");
    setStatus("Active");
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  type Vendor = Doc<"vendors">;
  const selectedVendor = vendors.find((v: Vendor) => v._id === vendorId);

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Package} className="h-5 w-5" />
            Assign Picker Role
          </DialogTitle>
          <DialogDescription>
            Assign {userName} ({userEmail}) as a picker and configure their
            vendor assignment and status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="vendor-select">Vendor Assignment *</Label>
            <Select
              value={vendorId}
              onValueChange={setVendorId}
              disabled={isAssigning}
            >
              <SelectTrigger id="vendor-select">
                <SelectValue placeholder="Choose a vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor: Vendor) => (
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
            {vendors.length === 0 && (
              <p className="text-sm text-red-500">
                No active vendors available. Please create a vendor first.
              </p>
            )}
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
                {PICKER_STATUSES.map((statusOption) => (
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

          {selectedVendor && (
            <div className="bg-gray-50 p-3 rounded-lg space-y-2">
              <div className="text-sm font-medium">Picker Configuration:</div>
              <div className="text-sm text-gray-600">
                <div>
                  <strong>Vendor:</strong> {selectedVendor.name}
                </div>
                <div>
                  <strong>Location:</strong>{" "}
                  {selectedVendor.address?.city || "Not specified"}
                </div>
                <div>
                  <strong>Status:</strong> {status}
                </div>
                <div>
                  <strong>Commission:</strong> {selectedVendor.commission}
                  {selectedVendor.commission_type === "percentage"
                    ? "%"
                    : " (fixed)"}
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
            <div className="text-sm text-blue-800">
              <strong>Note:</strong> This user will have picker access and will
              be able to receive order assignments from the assigned vendor and
              update order statuses during the picking process.
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
            disabled={!vendorId || vendors.length === 0 || isAssigning}
          >
            {isAssigning && <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />}
            Assign Picker Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PickerDetailsDialog;
