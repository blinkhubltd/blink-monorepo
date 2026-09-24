"use client";

import { useState } from "react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import RiderDetailsDialog from "./RiderDetailsDialog";
import PickerDetailsDialog from "./PickerDetailsDialog";
import type { User } from "./types";

const CREW_STATUS_STYLES: Record<string, string> = {
  Active: "border-green-300 bg-green-50 text-green-700",
  Inactive: "border-gray-300 bg-gray-50 text-gray-600",
  "On Delivery": "border-blue-300 bg-blue-50 text-blue-700",
  "On Order": "border-blue-300 bg-blue-50 text-blue-700",
};

/**
 * The Staff table's "Crew" cell: a rider's or picker's working status (and a
 * rider's vehicle), with an Edit button right there on the row.
 *
 * The same edit is also in the row's "⋯" menu, but a control only reachable
 * through an overflow menu reads as "there is no way to do this" — so the
 * cell carries it visibly. A rider or picker whose details were never set up
 * (assigned before Rider/Picker were vendor-scoped) shows "Not set up" and a
 * Set up button that opens the same dialog.
 *
 * Note this is the crew status — whether they can take deliveries or picks —
 * not the account's Active/Inactive, which the Status column and the menu's
 * Activate/Deactivate already cover.
 */
export function CrewDetailsCell({
  user,
  roleName,
}: {
  user: User;
  roleName?: string;
}) {
  const [open, setOpen] = useState(false);
  const { can } = useCurrentUserPermissions();
  const canEdit = can("users:UPDATE");

  const role = roleName?.trim().toLowerCase();
  const isRider = role === "rider";
  const isPicker = role === "picker";
  if (!isRider && !isPicker) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const displayName =
    user.name || `${user.first_name || ""} ${user.last_name || ""}`.trim();
  const status = isRider ? user.rider_details?.status : user.picker_details?.status;
  const hasDetails = isRider ? !!user.rider_details : !!user.picker_details;

  // A rider is not working until approved — say where they stand instead of
  // showing an online status that cannot mean anything yet.
  const riderStage =
    isRider && !user.rider_details?.approved_at
      ? user.phone &&
        user.rider_details?.id_image &&
        user.rider_details?.license_image
        ? "Pending review"
        : "Awaiting documents"
      : null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-0.5">
        {riderStage ? (
          <Badge
            variant="outline"
            className={`w-fit ${
              riderStage === "Pending review"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
          >
            {riderStage}
          </Badge>
        ) : hasDetails && status ? (
          <Badge
            variant="outline"
            className={`w-fit ${CREW_STATUS_STYLES[status] ?? ""}`}
          >
            {status}
          </Badge>
        ) : (
          <span className="text-xs text-amber-600">Not set up</span>
        )}
        {isRider && user.rider_details ? (
          <span className="text-xs text-muted-foreground">
            {user.rider_details.vehicle_type}
            {user.rider_details.vehicle_plate
              ? ` · ${user.rider_details.vehicle_plate}`
              : ""}
          </span>
        ) : null}
      </div>

      {canEdit ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setOpen(true)}
        >
          {riderStage === "Pending review"
            ? "Review"
            : hasDetails
              ? "Edit"
              : "Set up"}
        </Button>
      ) : null}

      {isRider ? (
        <RiderDetailsDialog
          userId={user._id}
          userName={displayName || "Unknown User"}
          userEmail={user.email}
          isOpen={open}
          onClose={() => setOpen(false)}
          initial={{
            vendorId: user.rider_details?.vendor_id,
            vehicleType: user.rider_details?.vehicle_type,
            vehiclePlate: user.rider_details?.vehicle_plate,
            status: user.rider_details?.status,
          }}
        />
      ) : (
        <PickerDetailsDialog
          userId={user._id}
          userName={displayName || "Unknown User"}
          userEmail={user.email}
          isOpen={open}
          onClose={() => setOpen(false)}
          initial={{
            vendorId: user.picker_details?.vendor_id,
            status: user.picker_details?.status,
          }}
        />
      )}
    </div>
  );
}

export default CrewDetailsCell;
