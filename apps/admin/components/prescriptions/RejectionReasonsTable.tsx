"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CircleXIcon,
  Grid3X2Icon as Columns3Icon,
  PlusSignIcon as Plus,
  Search01Icon as Search,
} from "@hugeicons/core-free-icons";
import React, { useState, useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";

import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  createRejectionReasonsColumns,
  RejectionReason,
} from "./rejection-reasons-columns";
import { RejectionReasonDialog } from "./RejectionReasonDialog";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
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

export function RejectionReasonsTable() {
  const reasons = useQuery(
    api.data.prescription_rejection_reasons.getAllRejectionReasons,
  );
  const updateReason = useMutation(
    api.data.prescription_rejection_reasons.updateRejectionReason,
  );
  const deleteReason = useMutation(
    api.data.prescription_rejection_reasons.deleteRejectionReason,
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [reasonToEdit, setReasonToEdit] = useState<RejectionReason | null>(
    null,
  );

  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [reasonToToggle, setReasonToToggle] = useState<RejectionReason | null>(
    null,
  );

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reasonToDelete, setReasonToDelete] = useState<RejectionReason | null>(
    null,
  );

  const handleEdit = (reason: RejectionReason) => {
    setReasonToEdit(reason);
    setDialogOpen(true);
  };

  const handleToggleStatus = (reason: RejectionReason) => {
    setReasonToToggle(reason);
    setToggleDialogOpen(true);
  };

  const handleDelete = (reason: RejectionReason) => {
    setReasonToDelete(reason);
    setDeleteDialogOpen(true);
  };

  const confirmToggleStatus = async () => {
    if (reasonToToggle) {
      try {
        await updateReason({
          id: reasonToToggle._id,
          is_active: !reasonToToggle.is_active,
        });
        toast.success(
          `Rejection reason ${reasonToToggle.is_active ? "deactivated" : "activated"} successfully`,
        );
      } catch (error) {
        console.error(error);
        toast.error(
          getConvexErrorMessage(
            error,
            "Failed to update rejection reason status",
          ),
        );
      }
      setToggleDialogOpen(false);
      setReasonToToggle(null);
    }
  };

  const confirmDelete = async () => {
    if (reasonToDelete) {
      try {
        await deleteReason({ id: reasonToDelete._id });
        toast.success("Rejection reason deleted successfully");
      } catch (error: any) {
        console.error(error);
        toast.error(
          getConvexErrorMessage(error, "Failed to delete rejection reason"),
        );
      }
      setDeleteDialogOpen(false);
      setReasonToDelete(null);
    }
  };

  const filteredReasons = useMemo(() => {
    if (!reasons) return [];
    let filtered = reasons;

    if (typeFilter !== "all") {
      const isSystem = typeFilter === "system";
      filtered = filtered.filter((r: any) => r.is_system_default === isSystem);
    }

    return filtered;
  }, [reasons, typeFilter]);

  const columns = useMemo(
    () =>
      createRejectionReasonsColumns({
        onEdit: handleEdit,
        onToggleStatus: handleToggleStatus,
        onDelete: handleDelete,
      }),
    [],
  );

  const table = useReactTable({
    data: filteredReasons,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnVisibility,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  });

  if (reasons === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative max-w-sm">
            <HugeiconsIcon icon={Search} className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reasons..."
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(String(event.target.value))}
              className="pl-8"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="system">System Default</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          {(globalFilter || typeFilter !== "all") && (
            <Button
              variant="ghost"
              onClick={() => {
                setGlobalFilter("");
                setTypeFilter("all");
              }}
              className="h-8 px-2 lg:px-3"
            >
              Clear
              <HugeiconsIcon icon={CircleXIcon} className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setReasonToEdit(null);
              setDialogOpen(true);
            }}
          >
            <HugeiconsIcon icon={Plus} className="mr-2 h-4 w-4" />
            Add Reason
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto h-8">
                <HugeiconsIcon icon={Columns3Icon} className="mr-2 h-4 w-4" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[150px]">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide(),
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No rejection reasons found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <RejectionReasonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reasonToEdit={reasonToEdit}
      />

      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {reasonToToggle?.is_active
                ? "This will deactivate the rejection reason. It will no longer be available for selection."
                : "This will activate the rejection reason. It will be available for selection."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleStatus}
              className={
                reasonToToggle?.is_active
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-green-600 hover:bg-green-700"
              }
            >
              {reasonToToggle?.is_active ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rejection Reason</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this rejection reason?
              This action cannot be undone.
              {reasonToDelete?.is_active && " The reason is currently active."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
