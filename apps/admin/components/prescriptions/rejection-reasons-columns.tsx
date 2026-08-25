"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferVerticalIcon as ArrowUpDown,
  BanIcon as Ban,
  CheckmarkCircle02Icon as CheckCircle2,
  Delete02Icon as Trash2,
  Edit02Icon as Pencil,
  MoreHorizontalIcon as MoreHorizontal,
} from "@hugeicons/core-free-icons";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Badge } from "@repo/ui/components/ui/badge";
import { Id } from "@repo/backend/dataModel";
import { formatDate, DATE_FORMATS } from "@/lib/date-utils";

export type RejectionReason = {
  _id: Id<"prescriptionRejectionReasons">;
  title: string;
  description?: string;
  is_active: boolean;
  is_system_default: boolean;
  created_at: number;
};

interface RejectionReasonsColumnsProps {
  onEdit: (reason: RejectionReason) => void;
  onToggleStatus: (reason: RejectionReason) => void;
  onDelete: (reason: RejectionReason) => void;
}

export const createRejectionReasonsColumns = ({
  onEdit,
  onToggleStatus,
  onDelete,
}: RejectionReasonsColumnsProps): ColumnDef<RejectionReason>[] => [
  {
    accessorKey: "title",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Title
          <HugeiconsIcon icon={ArrowUpDown} className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => {
      return (
        <div className="max-w-[300px]" title={row.getValue("description")}>
          {row.getValue("description") || "—"}
        </div>
      );
    },
  },
  {
    accessorKey: "is_system_default",
    header: "Type",
    cell: ({ row }) => {
      const isSystem = row.getValue("is_system_default") as boolean;
      return (
        <Badge variant={isSystem ? "default" : "secondary"}>
          {isSystem ? "System Default" : "Custom"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const isActive = row.getValue("is_active") as boolean;
      return (
        <Badge variant={isActive ? "outline" : "destructive"}>
          {isActive ? "Active" : "Inactive"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    cell: ({ row }) => {
      return formatDate(row.getValue("created_at"), DATE_FORMATS.SHORT);
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const reason = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <HugeiconsIcon icon={MoreHorizontal} className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onEdit(reason)}>
              <HugeiconsIcon icon={Pencil} className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggleStatus(reason)}
              className={
                reason.is_active ? "text-orange-600" : "text-green-600"
              }
            >
              {reason.is_active ? (
                <>
                  <HugeiconsIcon icon={Ban} className="mr-2 h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={CheckCircle2} className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(reason)}
              className="text-red-600"
            >
              <HugeiconsIcon icon={Trash2} className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
