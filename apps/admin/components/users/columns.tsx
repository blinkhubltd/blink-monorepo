"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ShieldUserIcon as Shield,
  UserCheckIcon as UserCheck,
  UserXIcon as UserX,
} from "@hugeicons/core-free-icons";
import { ColumnDef } from "@tanstack/react-table";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Badge } from "@repo/ui/components/ui/badge";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { User, STATUS_COLORS } from "./types";
import ActionCell from "./ActionCell";
import type { Id } from "@repo/backend/dataModel";

interface UsersTableColumnsProps {
  onUpdateUserStatus: (
    userId: Id<"users">,
    status: "Active" | "Inactive",
  ) => Promise<void>;
  rolesMap: Map<string, string>;
  vendorsMap: Map<string, string>;
}

export function createUsersTableColumns({
  onUpdateUserStatus,
  rolesMap,
  vendorsMap,
}: UsersTableColumnsProps): ColumnDef<User>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: "user",
      accessorKey: "name",
      header: "User",
      cell: ({ row }) => {
        const user = row.original;
        const displayName =
          user.name ||
          `${user.first_name || ""} ${user.last_name || ""}`.trim();

        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.image} alt={displayName} />
              <AvatarFallback className="text-xs">
                {displayName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium truncate">
                {displayName || "Unknown User"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {user.email}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => {
        const phone = row.original.phone;
        return (
          <span className="text-sm text-muted-foreground">{phone || "—"}</span>
        );
      },
    },
    {
      id: "role",
      header: "Role",
      cell: ({ row }) => {
        const user = row.original;
        const roleName = user.role_id ? rolesMap.get(user.role_id) : undefined;

        if (!roleName) {
          return (
            <Badge variant="outline" className="text-muted-foreground">
              Unassigned
            </Badge>
          );
        }

        return (
          <Badge
            variant="outline"
            className="bg-violet-50 text-violet-700 border-violet-200 flex items-center gap-1 w-fit"
          >
            <HugeiconsIcon icon={Shield} className="w-3 h-3" />
            {roleName}
          </Badge>
        );
      },
    },
    {
      id: "vendor",
      header: "Vendor",
      cell: ({ row }) => {
        const user = row.original;
        const managerVendorIds = user.manager_details?.vendor_id ?? [];
        const primaryVendorId =
          managerVendorIds.length > 0
            ? managerVendorIds[0]
            : (user.picker_details?.vendor_id ?? user.rider_details?.vendor_id);
        if (!primaryVendorId)
          return <span className="text-muted-foreground text-sm">—</span>;
        const vendorName = vendorsMap.get(primaryVendorId) ?? "Unknown";
        return (
          <div className="flex items-center gap-1">
            <Badge
              variant="secondary"
              className="font-normal truncate max-w-[120px]"
            >
              {vendorName}
            </Badge>
            {managerVendorIds.length > 1 && (
              <Badge variant="outline" className="text-xs shrink-0">
                +{managerVendorIds.length - 1}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as
          | "Active"
          | "Inactive"
          | undefined;
        const displayStatus = status || "Active";
        const colorClass = STATUS_COLORS[displayStatus];

        return (
          <Badge
            variant="outline"
            className={`${colorClass} flex items-center gap-1 w-fit`}
          >
            {displayStatus === "Active" ? (
              <HugeiconsIcon icon={UserCheck} className="w-3 h-3" />
            ) : (
              <HugeiconsIcon icon={UserX} className="w-3 h-3" />
            )}
            {displayStatus}
          </Badge>
        );
      },
    },
    {
      accessorKey: "_creationTime",
      header: "Joined",
      cell: ({ row }) => {
        const date = new Date(row.getValue("_creationTime"));
        return (
          <span className="text-sm text-muted-foreground">
            {date.toLocaleDateString()}
          </span>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const user = row.original;
        return (
          <ActionCell user={user} onUpdateUserStatus={onUpdateUserStatus} />
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
