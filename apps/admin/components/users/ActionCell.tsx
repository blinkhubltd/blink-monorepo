"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreHorizontalIcon as MoreHorizontal,
  ShieldUserIcon as Shield,
  TruckDeliveryIcon as Truck,
  UserCheckIcon as UserCheck,
  UserXIcon as UserX,
  ViewIcon as Eye,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { User } from "./types";
import RoleAssignmentDialog from "./RoleAssignmentDialog";
import UserDetailsDialog from "./UserDetailsDialog";
import RiderDetailsDialog from "./RiderDetailsDialog";
import PickerDetailsDialog from "./PickerDetailsDialog";
import type { Id } from "@repo/backend/dataModel";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { toast } from "sonner";

interface ActionCellProps {
  user: User;
  onUpdateUserStatus: (
    userId: Id<"users">,
    status: "Active" | "Inactive",
  ) => Promise<void>;
  /**
   * The row's role name. A rider or picker gets an "Edit … details" action
   * for their vendor, status and (rider) vehicle — the only place in the
   * dashboard those can be changed once the role is assigned.
   */
  roleName?: string;
}

export function ActionCell({
  user,
  onUpdateUserStatus,
  roleName,
}: ActionCellProps) {
  const role = roleName?.trim().toLowerCase();
  const isRider = role === "rider";
  const isPicker = role === "picker";
  const [showCrewDialog, setShowCrewDialog] = useState(false);
  const [showRoleAssignmentDialog, setShowRoleAssignmentDialog] =
    useState(false);
  const [showUserDetailsDialog, setShowUserDetailsDialog] = useState(false);
  const { can } = useCurrentUserPermissions();
  const canUpdateUser = can("users:UPDATE");
  const canAssignRole = can("users:CREATE") || can("users:UPDATE");

  const displayName =
    user.name || `${user.first_name || ""} ${user.last_name || ""}`.trim();

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
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setShowUserDetailsDialog(true)}
            className="cursor-pointer"
          >
            <HugeiconsIcon icon={Eye} className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              if (!canUpdateUser) {
                toast.error("You are not allowed to update users");
                return;
              }
              const currentStatus = user.status || "Active";
              const newStatus =
                currentStatus === "Active" ? "Inactive" : "Active";
              onUpdateUserStatus(user._id, newStatus);
            }}
            className="cursor-pointer"
            disabled={!canUpdateUser}
          >
            {(user.status || "Active") === "Active" ? (
              <>
                <HugeiconsIcon icon={UserX} className="mr-2 h-4 w-4" />
                Deactivate User
              </>
            ) : (
              <>
                <HugeiconsIcon icon={UserCheck} className="mr-2 h-4 w-4" />
                Activate User
              </>
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              if (!canAssignRole) {
                toast.error("You are not allowed to assign roles");
                return;
              }
              setShowRoleAssignmentDialog(true);
            }}
            className="cursor-pointer font-medium"
            disabled={!canAssignRole}
          >
            <HugeiconsIcon icon={Shield} className="mr-2 h-4 w-4" />
            Assign Role
          </DropdownMenuItem>

          {isRider || isPicker ? (
            <DropdownMenuItem
              onClick={() => {
                if (!canUpdateUser) {
                  toast.error("You are not allowed to update users");
                  return;
                }
                setShowCrewDialog(true);
              }}
              className="cursor-pointer"
              disabled={!canUpdateUser}
            >
              <HugeiconsIcon icon={Truck} className="mr-2 h-4 w-4" />
              {isRider ? "Edit Rider Details" : "Edit Picker Details"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {isRider ? (
        <RiderDetailsDialog
          userId={user._id}
          userName={displayName || "Unknown User"}
          userEmail={user.email}
          isOpen={showCrewDialog}
          onClose={() => setShowCrewDialog(false)}
          initial={{
            vendorId: user.rider_details?.vendor_id,
            vehicleType: user.rider_details?.vehicle_type,
            vehiclePlate: user.rider_details?.vehicle_plate,
            status: user.rider_details?.status,
          }}
        />
      ) : null}

      {isPicker ? (
        <PickerDetailsDialog
          userId={user._id}
          userName={displayName || "Unknown User"}
          userEmail={user.email}
          isOpen={showCrewDialog}
          onClose={() => setShowCrewDialog(false)}
          initial={{
            vendorId: user.picker_details?.vendor_id,
            status: user.picker_details?.status,
          }}
        />
      ) : null}

      <RoleAssignmentDialog
        userId={user._id}
        userName={displayName || "Unknown User"}
        currentRoleId={user.role_id}
        isOpen={showRoleAssignmentDialog}
        onClose={() => setShowRoleAssignmentDialog(false)}
        canAssign={canAssignRole}
      />

      <UserDetailsDialog
        user={user}
        isOpen={showUserDetailsDialog}
        onClose={() => setShowUserDetailsDialog(false)}
      />
    </>
  );
}

export default ActionCell;
