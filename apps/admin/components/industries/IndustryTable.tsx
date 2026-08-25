"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BanIcon as Ban,
  BriefcaseDollarIcon as Briefcase,
  Building02Icon as Building2,
  CheckmarkCircle02Icon as CheckCircle,
  CreditCardIcon as CreditCard,
  Delete02Icon as Trash,
  EditIcon as Edit,
  MoreHorizontalIcon as MoreHorizontal,
  Search01Icon as Search,
  ViewIcon as Eye,
} from "@hugeicons/core-free-icons";
import type React from "react";
import { useState } from "react";
import type { Id } from "@repo/backend/dataModel";
import { Badge } from "@repo/ui/components/ui/badge";
import { IndustryForm } from "./IndustryForm";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { TableSkeleton, TablePagination } from "@/components/shared/table";
import { ProtectedDisplayField } from "@/components/shared/ProtectedField";

type Industry = {
  _id: Id<"industry">;
  name: string;
  description?: string;
  status: "Active" | "Inactive";
  image?: string;
  imageUrl?: string | null;
  bank_details?: {
    business_name: string;
    bank_code: string;
    account_number: string;
    kra_pin?: string;
  };
  updated_at?: string;
};

type IndustryFormValues = {
  name: string;
  description?: string;
  status: "Active" | "Inactive";
  image?: string;
  bank_details?: {
    business_name: string;
    bank_code: string;
    account_number: string;
    kra_pin?: string;
  };
};

interface IndustryTableProps {
  industries: Industry[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: "all" | "active" | "inactive";
  onStatusFilterChange: (value: "all" | "active" | "inactive") => void;
  onUpdateIndustry: (
    industryId: Id<"industry">,
    values: IndustryFormValues,
  ) => Promise<void>;
  onDeleteIndustry: (id: Id<"industry">) => Promise<void>;
  onStatusUpdate: (
    industryId: Id<"industry">,
    status: "Active" | "Inactive",
  ) => Promise<void>;
  onFileUpload?: (file: File) => Promise<string>;
  pagination?: {
    hasNext: boolean;
    hasPrevious?: boolean;
    totalPages: number;
    currentPage?: number;
    pageSize?: number;
    total: number;
    cursor?: string | null;
  };
  onPageChange?: (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => void;
  onPageSizeChange?: (pageSize: number) => void;
  isLoading?: boolean;
}

const getStatusColor = (status: string) =>
  status === "Active"
    ? "bg-green-100 text-green-800 border-green-200"
    : "bg-red-100 text-red-800 border-red-200";

export function IndustryTable({
  industries,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  onUpdateIndustry,
  onDeleteIndustry,
  onStatusUpdate,
  pagination,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  onFileUpload,
}: IndustryTableProps) {
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [editingIndustry, setEditingIndustry] = useState<Industry | null>(null);
  const [deletingIndustry, setDeletingIndustry] = useState<Industry | null>(
    null,
  );

  const handleFormSubmit = async (formData: IndustryFormValues) => {
    if (editingIndustry) {
      await onUpdateIndustry(editingIndustry._id, formData);
      setShowForm(false);
      setEditingIndustry(null);
    }
  };

  const openEditForm = (industry: Industry) => {
    setEditingIndustry(industry);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingIndustry(null);
  };

  const handleDelete = async () => {
    if (deletingIndustry) {
      await onDeleteIndustry(deletingIndustry._id);
      setDeletingIndustry(null);
    }
  };

  const handleViewMore = (industry: Industry) => {
    setSelectedIndustry(industry);
  };

  // Show loading skeleton
  if (isLoading) {
    return <TableSkeleton rows={5} columns={4} />;
  }

  return (
    <div className="w-full space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <HugeiconsIcon icon={Search} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search industries by name or description..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-3">
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatusFilterChange(value as "all" | "active" | "inactive")
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter Results Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {industries.length} of {pagination?.total ?? industries.length}{" "}
        industries
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Industry Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {industries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground"
                >
                  <HugeiconsIcon icon={Briefcase} className="mx-auto h-12 w-12 mb-2 opacity-40" />
                  <div className="font-medium">No industries found</div>
                  {searchQuery || statusFilter !== "all" ? (
                    <div className="text-sm mt-1">
                      Try adjusting your search or filters
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ) : (
              industries.map((industry: Industry) => (
                <TableRow key={industry._id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <HugeiconsIcon icon={Briefcase} className="h-4 w-4 text-primary" />
                      <div className="font-medium">{industry.name}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground max-w-md truncate">
                      {industry.description || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getStatusColor(industry.status)}
                    >
                      {industry.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <HugeiconsIcon icon={MoreHorizontal} className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => handleViewMore(industry)}
                        >
                          <HugeiconsIcon icon={Eye} className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openEditForm(industry)}
                        >
                          <HugeiconsIcon icon={Edit} className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {industry.status === "Active" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              onStatusUpdate(industry._id, "Inactive")
                            }
                            className="text-orange-600"
                          >
                            <HugeiconsIcon icon={Ban} className="h-4 w-4 mr-2" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() =>
                              onStatusUpdate(industry._id, "Active")
                            }
                            className="text-green-600"
                          >
                            <HugeiconsIcon icon={CheckCircle} className="h-4 w-4 mr-2" /> Activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeletingIndustry(industry)}
                          className="text-red-600"
                        >
                          <HugeiconsIcon icon={Trash} className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && onPageChange && (
        <TablePagination
          pagination={{
            ...pagination,
            currentPage: pagination.currentPage || 1,
            pageSize: pagination.pageSize || 10,
          }}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}

      {/* View Details Dialog */}
      <Dialog
        open={!!selectedIndustry}
        onOpenChange={() => setSelectedIndustry(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Industry Details</DialogTitle>
            <DialogDescription>
              Detailed information about the industry
            </DialogDescription>
          </DialogHeader>
          {selectedIndustry && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <HugeiconsIcon icon={Briefcase} className="h-5 w-5" />
                    {selectedIndustry.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Description
                    </div>
                    <div className="text-sm">
                      {selectedIndustry.description || "No description"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-muted-foreground">
                      Status:
                    </div>
                    <Badge
                      variant="outline"
                      className={getStatusColor(selectedIndustry.status)}
                    >
                      {selectedIndustry.status}
                    </Badge>
                  </div>
                  {selectedIndustry.updated_at && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Last Updated
                      </div>
                      <div className="text-sm">
                        {new Date(selectedIndustry.updated_at).toLocaleString()}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bank Details Section */}
              {selectedIndustry.bank_details && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <HugeiconsIcon icon={CreditCard} className="h-5 w-5" />
                      Bank Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-start gap-3 py-2">
                      <div className="text-muted-foreground mt-0.5">
                        <HugeiconsIcon icon={Building2} className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">
                          Business Name
                        </p>
                        <p className="text-sm font-medium break-words">
                          {selectedIndustry.bank_details.business_name ||
                            "Not provided"}
                        </p>
                      </div>
                    </div>
                    <div className="border-t my-2" />
                    <ProtectedDisplayField
                      icon={<HugeiconsIcon icon={CreditCard} className="h-4 w-4" />}
                      label="Bank Code"
                      hasValue={!!selectedIndustry.bank_details.bank_code}
                    />
                    <div className="border-t my-2" />
                    <ProtectedDisplayField
                      icon={<HugeiconsIcon icon={CreditCard} className="h-4 w-4" />}
                      label="Account Number"
                      hasValue={!!selectedIndustry.bank_details.account_number}
                    />
                    <div className="border-t my-2" />
                    <div className="flex items-start gap-3 py-2">
                      <div className="text-muted-foreground mt-0.5">
                        <HugeiconsIcon icon={Building2} className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">
                          KRA PIN
                        </p>
                        <p className="text-sm font-medium break-words">
                          {selectedIndustry.bank_details.kra_pin ||
                            "Not provided"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedIndustry(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Industry Form Dialog */}
      <Dialog open={showForm} onOpenChange={closeForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Edit Industry</DialogTitle>
            <DialogDescription>
              Update the industry details below
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            <IndustryForm
              initialIndustry={editingIndustry || undefined}
              mode="edit"
              onSubmit={handleFormSubmit}
              onCancel={closeForm}
              onFileUpload={onFileUpload}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingIndustry}
        onOpenChange={() => setDeletingIndustry(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the industry &quot;
              {deletingIndustry?.name}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
