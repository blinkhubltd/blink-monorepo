"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ActivityIcon as Activity,
  Building02Icon as Building2,
  Calendar03Icon as Calendar,
  Call02Icon as Phone,
  Location01Icon as MapPin,
  Mail01Icon as Mail,
  PackageIcon as Package,
  ShieldUserIcon as Shield,
  StarIcon as Star,
  TruckDeliveryIcon as Truck,
  User02Icon as UserIcon,
} from "@hugeicons/core-free-icons";
import React from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Badge } from "@repo/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { User, STATUS_COLORS } from "./types";

interface UserDetailsDialogProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}

const InfoItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm font-medium break-words">{value}</div>
    </div>
  </div>
);

export function UserDetailsDialog({
  user,
  isOpen,
  onClose,
}: UserDetailsDialogProps) {
  const allRoles = useQuery(api.user.roles.getAllRoles);
  const allVendors = useQuery(api.data.vendors.getAllVendors);

  if (!user) return null;

  const displayName =
    user.name || `${user.first_name || ""} ${user.last_name || ""}`.trim();

  const initials =
    displayName
      .split(" ")
      .filter((n) => n.length > 0)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  const roleName = user.role_id
    ? allRoles?.find((r: any) => r._id === user.role_id)?.name
    : undefined;

  const displayStatus = user.status || "Active";
  const statusColorClass = STATUS_COLORS[displayStatus];

  const getVendorName = (vendorId: string) =>
    allVendors?.find((v: any) => v._id === vendorId)?.name ?? vendorId;

  const hasRiderDetails = !!user.rider_details;
  const hasPickerDetails = !!user.picker_details;
  const hasManagerDetails =
    !!user.manager_details && user.manager_details.vendor_id?.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={user.image} alt={displayName} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl truncate">
                {displayName || "Unknown User"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            <Badge variant="outline" className={`${statusColorClass} shrink-0`}>
              {displayStatus}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1">
          {/* Basic Information */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <HugeiconsIcon icon={UserIcon} className="h-4 w-4" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoItem
                icon={<HugeiconsIcon icon={Mail} className="h-4 w-4" />}
                label="Email"
                value={user.email || "—"}
              />
              <Separator />
              <InfoItem
                icon={<HugeiconsIcon icon={Phone} className="h-4 w-4" />}
                label="Phone"
                value={user.phone || "—"}
              />
              <Separator />
              <InfoItem
                icon={<HugeiconsIcon icon={Calendar} className="h-4 w-4" />}
                label="Joined"
                value={new Date(user._creationTime).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" },
                )}
              />
              {user.address?.address && (
                <>
                  <Separator />
                  <InfoItem
                    icon={<HugeiconsIcon icon={MapPin} className="h-4 w-4" />}
                    label="Address"
                    value={user.address.address}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Role Information */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <HugeiconsIcon icon={Shield} className="h-4 w-4" />
                Role & Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoItem
                icon={<HugeiconsIcon icon={Shield} className="h-4 w-4" />}
                label="Assigned Role"
                value={
                  roleName ? (
                    <Badge
                      variant="outline"
                      className="bg-violet-50 text-violet-700 border-violet-200"
                    >
                      {roleName}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Unassigned
                    </Badge>
                  )
                }
              />
              <Separator />
              <InfoItem
                icon={<HugeiconsIcon icon={Activity} className="h-4 w-4" />}
                label="Account Status"
                value={
                  <Badge variant="outline" className={statusColorClass}>
                    {displayStatus}
                  </Badge>
                }
              />
            </CardContent>
          </Card>

          {/* Manager Details */}
          {hasManagerDetails && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <HugeiconsIcon icon={Building2} className="h-4 w-4" />
                  Manager Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <InfoItem
                  icon={<HugeiconsIcon icon={Building2} className="h-4 w-4" />}
                  label="Assigned Vendors"
                  value={
                    <div className="flex flex-wrap gap-1 mt-1">
                      {user.manager_details!.vendor_id.map((vid) => (
                        <Badge key={vid} variant="secondary">
                          {getVendorName(vid)}
                        </Badge>
                      ))}
                    </div>
                  }
                />
                {user.manager_details?.assigned_at && (
                  <>
                    <Separator />
                    <InfoItem
                      icon={<HugeiconsIcon icon={Calendar} className="h-4 w-4" />}
                      label="Assigned At"
                      value={new Date(
                        user.manager_details.assigned_at,
                      ).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Rider Details */}
          {hasRiderDetails && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <HugeiconsIcon icon={Truck} className="h-4 w-4" />
                  Rider Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <InfoItem
                  icon={<HugeiconsIcon icon={Truck} className="h-4 w-4" />}
                  label="Vehicle Type"
                  value={user.rider_details!.vehicle_type}
                />
                {user.rider_details!.vehicle_plate && (
                  <>
                    <Separator />
                    <InfoItem
                      icon={<HugeiconsIcon icon={Truck} className="h-4 w-4" />}
                      label="Vehicle Plate"
                      value={user.rider_details!.vehicle_plate}
                    />
                  </>
                )}
                {user.rider_details!.vendor_id && (
                  <>
                    <Separator />
                    <InfoItem
                      icon={<HugeiconsIcon icon={Building2} className="h-4 w-4" />}
                      label="Assigned Vendor"
                      value={
                        <Badge variant="secondary">
                          {getVendorName(user.rider_details!.vendor_id!)}
                        </Badge>
                      }
                    />
                  </>
                )}
                <Separator />
                <InfoItem
                  icon={<HugeiconsIcon icon={Activity} className="h-4 w-4" />}
                  label="Rider Status"
                  value={
                    <Badge
                      variant="outline"
                      className={
                        user.rider_details!.status === "Active"
                          ? "bg-green-100 text-green-800 border-green-200"
                          : user.rider_details!.status === "On Delivery"
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-red-100 text-red-800 border-red-200"
                      }
                    >
                      {user.rider_details!.status}
                    </Badge>
                  }
                />
                {user.rider_details!.rating !== undefined && (
                  <>
                    <Separator />
                    <InfoItem
                      icon={<HugeiconsIcon icon={Star} className="h-4 w-4" />}
                      label="Rating"
                      value={`${user.rider_details!.rating.toFixed(1)} / 5.0`}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Picker Details */}
          {hasPickerDetails && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <HugeiconsIcon icon={Package} className="h-4 w-4" />
                  Picker Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <InfoItem
                  icon={<HugeiconsIcon icon={Building2} className="h-4 w-4" />}
                  label="Assigned Vendor"
                  value={
                    <Badge variant="secondary">
                      {getVendorName(user.picker_details!.vendor_id)}
                    </Badge>
                  }
                />
                <Separator />
                <InfoItem
                  icon={<HugeiconsIcon icon={Activity} className="h-4 w-4" />}
                  label="Picker Status"
                  value={
                    <Badge
                      variant="outline"
                      className={
                        user.picker_details!.status === "Active"
                          ? "bg-green-100 text-green-800 border-green-200"
                          : user.picker_details!.status === "On Order"
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-red-100 text-red-800 border-red-200"
                      }
                    >
                      {user.picker_details!.status}
                    </Badge>
                  }
                />
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UserDetailsDialog;
