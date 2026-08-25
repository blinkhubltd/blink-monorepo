"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon as AlertTriangle,
  ArrowDataTransferVerticalIcon as ChevronsUpDown,
  Cancel01Icon as X,
  Loading03Icon as Loader2,
  ShieldUserIcon as Shield,
} from "@hugeicons/core-free-icons";
import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { Badge } from "@repo/ui/components/ui/badge";
import { Input } from "@repo/ui/components/ui/input";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { toast } from "sonner";
import type { Id } from "@repo/backend/dataModel";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { getConvexErrorMessage } from "@/lib/utils";

interface RoleAssignmentDialogProps {
  userId: Id<"users">;
  userName: string;
  currentRoleId?: Id<"roles">;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  canAssign?: boolean;
}

export function RoleAssignmentDialog({
  userId,
  userName,
  currentRoleId,
  isOpen,
  onClose,
  onSuccess,
  canAssign,
}: RoleAssignmentDialogProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [selectedVendorId, setSelectedVendorId] = useState<string>(""); // rider / picker
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]); // manager (multi)
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorPopoverOpen, setVendorPopoverOpen] = useState(false);
  const [vehicleType, setVehicleType] = useState<string>("Motorbike");
  const [vehiclePlate, setVehiclePlate] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const allRoles = useQuery(api.user.roles.getAllRoles);
  const vendors = useQuery(api.data.vendors.getAllVendors);
  const assignRoleToUser = useMutation(api.user.users.assignRoleToUser);
  const { can } = useCurrentUserPermissions();
  const canAssignFromPermissions = can("users:CREATE") || can("users:UPDATE");
  const canAssignRole = canAssign ?? canAssignFromPermissions;

  const selectedRole = allRoles?.find((r: any) => r._id === selectedRoleId);
  const roleLower = selectedRole?.name.trim().toLowerCase() ?? "";
  const needsVendor = selectedRole?.manages_vendor === true;
  const isRider = needsVendor && roleLower === "rider";
  const isPicker = needsVendor && roleLower === "picker";
  const isManager = needsVendor && !isRider && !isPicker;

  const filteredVendors = useMemo(() => {
    if (!vendors) return [];
    const q = vendorSearch.trim().toLowerCase();
    return q
      ? vendors.filter((v: any) => v.name.toLowerCase().includes(q))
      : vendors;
  }, [vendors, vendorSearch]);

  const toggleVendor = (id: string) => {
    setSelectedVendorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleConfirmRequest = () => {
    if (!canAssignRole) {
      toast.error("You are not allowed to assign roles");
      return;
    }
    if (!selectedRoleId) {
      toast.error("Please select a role");
      return;
    }
    if (needsVendor && isManager && selectedVendorIds.length === 0) {
      toast.error("Please select at least one vendor for this role");
      return;
    }
    if (needsVendor && !isManager && !selectedVendorId) {
      toast.error("Please select a vendor for this role");
      return;
    }
    setShowConfirm(true);
  };

  const handleAssign = async () => {
    if (!canAssignRole) {
      toast.error("You are not allowed to assign roles");
      return;
    }

    if (!selectedRoleId) {
      toast.error("Please select a role");
      return;
    }

    if (needsVendor && isManager && selectedVendorIds.length === 0) {
      toast.error("Please select at least one vendor for this role");
      return;
    }

    if (needsVendor && !isManager && !selectedVendorId) {
      toast.error("Please select a vendor for this role");
      return;
    }

    setIsAssigning(true);
    try {
      await assignRoleToUser({
        userId,
        roleId: selectedRoleId as Id<"roles">,
        ...(isManager && selectedVendorIds.length > 0
          ? { vendor_ids: selectedVendorIds as Id<"vendors">[] }
          : {}),
        ...(!isManager && needsVendor && selectedVendorId
          ? { vendor_id: selectedVendorId as Id<"vendors"> }
          : {}),
        ...(isRider
          ? {
              rider_vehicle_type: vehicleType as
                | "Motorbike"
                | "Bicycle"
                | "Car"
                | "Van",
              rider_vehicle_plate: vehiclePlate || undefined,
            }
          : {}),
      });
      toast.success(
        `${userName} has been assigned the "${selectedRole?.name}" role`,
      );
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(getConvexErrorMessage(error, "Failed to assign role"));
    } finally {
      setIsAssigning(false);
      setShowConfirm(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedRoleId("");
      setSelectedVendorId("");
      setSelectedVendorIds([]);
      setVendorSearch("");
      setVendorPopoverOpen(false);
      setVehicleType("Motorbike");
      setVehiclePlate("");
      setShowConfirm(false);
      onClose();
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={Shield} className="w-5 h-5 text-yellow-500" />
              Assign Role
            </DialogTitle>
            <DialogDescription>
              Assign a role to <strong>{userName}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Role Select */}
            <div className="space-y-2">
              <Label>Role</Label>
              {!allRoles ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin" />
                  Loading roles...
                </div>
              ) : allRoles.length === 0 ? (
                <p className="text-sm text-amber-600">
                  No roles have been created yet. Go to Roles &amp; Permissions
                  to create one.
                </p>
              ) : (
                <Select
                  value={selectedRoleId}
                  onValueChange={(val) => {
                    setSelectedRoleId(val);
                    setSelectedVendorId("");
                    setSelectedVendorIds([]);
                    setVendorSearch("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allRoles.map((role: any) => (
                      <SelectItem
                        key={role._id}
                        value={role._id}
                        disabled={role._id === currentRoleId}
                      >
                        <span className="flex items-center gap-2">
                          {role.name}
                          {role.is_default && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1 py-0"
                            >
                              default
                            </Badge>
                          )}
                          {role.manages_vendor && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0"
                            >
                              vendor
                            </Badge>
                          )}
                          {role._id === currentRoleId && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1 py-0"
                            >
                              current
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Vendor Select — single for riders/pickers, multi for managers */}
            {needsVendor && !isManager && (
              <div className="space-y-2">
                <Label>
                  Vendor{" "}
                  {isPicker
                    ? "(picker will be assigned here)"
                    : "(rider will be assigned here)"}
                </Label>
                {!vendors ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin" />
                    Loading vendors...
                  </div>
                ) : (
                  <Select
                    value={selectedVendorId}
                    onValueChange={setSelectedVendorId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v: any) => (
                        <SelectItem key={v._id} value={v._id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Multi-vendor select for manager roles */}
            {isManager && (
              <div className="space-y-2">
                <Label>Vendors (manager will be assigned here)</Label>
                {!vendors ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin" />
                    Loading vendors...
                  </div>
                ) : (
                  <>
                    <Popover
                      open={vendorPopoverOpen}
                      onOpenChange={setVendorPopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={vendorPopoverOpen}
                          className="w-full justify-between h-auto min-h-9 font-normal"
                        >
                          <span className="truncate">
                            {selectedVendorIds.length === 0
                              ? "Select vendors..."
                              : selectedVendorIds.length === 1
                                ? vendors.find(
                                    (v: any) => v._id === selectedVendorIds[0],
                                  )?.name
                                : `${selectedVendorIds.length} vendors selected`}
                          </span>
                          <HugeiconsIcon icon={ChevronsUpDown} className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                        align="start"
                      >
                        <div className="p-2 border-b">
                          <Input
                            placeholder="Search vendors..."
                            value={vendorSearch}
                            onChange={(e) => setVendorSearch(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <ScrollArea className="max-h-52">
                          {filteredVendors.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">
                              No vendors found.
                            </p>
                          ) : (
                            filteredVendors.map((vendor: any) => (
                              <div
                                key={vendor._id}
                                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent select-none"
                                onClick={() => toggleVendor(vendor._id)}
                              >
                                <Checkbox
                                  checked={selectedVendorIds.includes(
                                    vendor._id,
                                  )}
                                  onCheckedChange={() =>
                                    toggleVendor(vendor._id)
                                  }
                                />
                                <span className="text-sm">{vendor.name}</span>
                              </div>
                            ))
                          )}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>

                    {/* Selected vendor badges */}
                    {selectedVendorIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {selectedVendorIds.map((id) => {
                          const vendor = vendors.find((v: any) => v._id === id);
                          return vendor ? (
                            <Badge
                              key={id}
                              variant="secondary"
                              className="gap-1 pr-1"
                            >
                              {vendor.name}
                              <button
                                type="button"
                                onClick={() => toggleVendor(id)}
                                className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 hover:bg-muted"
                              >
                                <HugeiconsIcon icon={X} className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Rider extras */}
            {isRider && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Vehicle Type</Label>
                  <Select value={vehicleType} onValueChange={setVehicleType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Motorbike">Motorbike</SelectItem>
                      <SelectItem value="Bicycle">Bicycle</SelectItem>
                      <SelectItem value="Car">Car</SelectItem>
                      <SelectItem value="Van">Van</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Plate (optional)</Label>
                  <Input
                    placeholder="e.g. KAA 123A"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isAssigning}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRequest}
              disabled={
                isAssigning ||
                !canAssignRole ||
                !selectedRoleId ||
                (isManager && selectedVendorIds.length === 0) ||
                (!isManager && needsVendor && !selectedVendorId)
              }
              className="bg-black hover:bg-gray-800 text-yellow-400"
            >
              Assign Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <HugeiconsIcon icon={AlertTriangle} className="h-5 w-5" />
              Confirm Role Assignment
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to assign the{" "}
                  <strong className="text-foreground">
                    {selectedRole?.name}
                  </strong>{" "}
                  role to{" "}
                  <strong className="text-foreground">{userName}</strong>.
                </p>
                {selectedRole?.description && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                    <p className="font-medium mb-1">Role description</p>
                    <p>{selectedRole.description}</p>
                  </div>
                )}
                <p className="text-sm">
                  This will change the user&apos;s access permissions. Are you
                  sure you want to proceed?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAssign}
              disabled={isAssigning}
              className="bg-black hover:bg-gray-800 text-yellow-400"
            >
              {isAssigning && <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />}
              Yes, assign role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default RoleAssignmentDialog;
