"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building02Icon as Building2,
  Call02Icon as Phone,
  EditIcon as Edit,
  Location01Icon as MapPin,
  Mail01Icon as Mail,
  MoreHorizontalIcon as MoreHorizontal,
  PlusSignIcon as Plus,
  Search01Icon as Search,
  User02Icon as User,
  UserCheckIcon as UserCheck,
  UserXIcon as UserX,
  ViewIcon as Eye,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import VendorForm from "./VendorForm";
import VendorDetailsDialog from "./VendorDetailsDialog";
import type { VendorFormValues } from "./VendorForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { TablePagination, TableSkeleton } from "@/components/shared/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { Input } from "@repo/ui/components/ui/input";
import { Separator } from "@repo/ui/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@repo/ui/components/ui/dropdown-menu";

interface Product {
  _id: Id<"products">;
  name: string;
  price: number;
  status: "Active" | "Inactive" | "Archived";
  category_id: Id<"categories">;
}

interface Vendor {
  _id: Id<"vendors">;
  name: string;
  industry_id?: Id<"industry">;
  image?: string;
  imageUrl?: string | null;
  contact: { name: string; phone: string; email: string };
  business_details?: {
    business_name: string;
    bank_code: string;
    account_number: string;
    kra_pin?: string;
  };
  address: {
    address_1?: string;
    address_2?: string;
    city?: string;
    country?: string;
  };
  coordinates: { lat: number; lng: number };
  service_radius: number;
  commission?: number;
  commission_type?: "percentage" | "fixed";
  status: "Active" | "Inactive";
  updated_at?: number;
  products?: Product[];
  schedule?: {
    is_fulltime: boolean;
    weeklySchedule?: {
      Monday?: { startTime: string; endTime: string };
      Tuesday?: { startTime: string; endTime: string };
      Wednesday?: { startTime: string; endTime: string };
      Thursday?: { startTime: string; endTime: string };
      Friday?: { startTime: string; endTime: string };
      Saturday?: { startTime: string; endTime: string };
      Sunday?: { startTime: string; endTime: string };
    };
  };
}

type VendorFormData = Omit<Vendor, "_id" | "products" | "updated_at">;

interface VendorsPagination {
  hasNext: boolean;
  hasPrevious?: boolean;
  totalPages: number;
  currentPage?: number;
  pageSize?: number;
  total: number;
  cursor?: string | null;
}

interface VendorsTableProps {
  vendors: Vendor[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: "all" | "active" | "inactive";
  onStatusFilterChange: (value: "all" | "active" | "inactive") => void;
  industryFilter: string;
  onIndustryFilterChange: (value: string) => void;
  pagination?: VendorsPagination;
  isLoading?: boolean;
  onStatusUpdate: (
    vendorId: Id<"vendors">,
    status: "Active" | "Inactive",
  ) => Promise<void>;
  onVendorAdd: (formData: VendorFormData) => Promise<void>;
  onVendorUpdate: (
    vendorId: Id<"vendors">,
    formData: VendorFormData,
  ) => Promise<void>;
  onPageChange?: (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showAddVendor?: boolean;
  onAddVendorClose?: () => void;
}

const getStatusColor = (status: string) =>
  status === "Active"
    ? "bg-green-100 text-green-800 border-green-200"
    : "bg-red-100 text-red-800 border-red-200";

const getServiceRadiusBadgeColor = (radius: number) => {
  if (radius <= 2000) return "bg-blue-100 text-blue-800 border-blue-200";
  if (radius <= 2200) return "bg-purple-100 text-purple-800 border-purple-200";
  if (radius <= 2500) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
};

const VendorFormDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor | null;
  onSubmit: (formData: VendorFormData) => Promise<void>;
}> = ({ isOpen, onClose, vendor, onSubmit }) => {
  const handleSubmit = async (
    values: VendorFormValues & { image?: string },
  ) => {
    try {
      const formData: VendorFormData = {
        ...(values as unknown as VendorFormData),
        industry_id:
          values.industry_id && values.industry_id !== "none"
            ? (values.industry_id as Id<"industry">)
            : undefined,
        image: values.image as any,
      };

      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error("Error submitting vendor form:", error);
      // Remove toast dependency from component - let parent handle error feedback
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          // Prevent dialog from closing when clicking on Google Places dropdown
          const target = e.target as Element;
          if (target.closest(".pac-container")) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Allow escape key to work normally
        }}
      >
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
          <DialogDescription>
            {vendor
              ? "Update the vendor details below."
              : "Fill in the vendor details below to add a new vendor."}
          </DialogDescription>
        </DialogHeader>
        <VendorForm
          defaultValues={
            vendor
              ? {
                  ...vendor,
                  commission: vendor.commission ?? 0,
                  commission_type: vendor.commission_type ?? "percentage",
                  business_details: vendor.business_details ?? {
                    business_name: "",
                    bank_code: "",
                    account_number: "",
                    kra_pin: "",
                  },
                  address: {
                    address_1: vendor.address?.address_1 || "",
                    address_2: vendor.address?.address_2 || "",
                    city: vendor.address?.city || "",
                    country: vendor.address?.country || "",
                  },
                  schedule: vendor.schedule || {
                    is_fulltime: true,
                    weeklySchedule: undefined,
                  },
                }
              : undefined
          }
          existingImageUrl={vendor?.imageUrl}
          onSubmit={handleSubmit}
          onCancel={onClose}
          submitLabel={vendor ? "Update Vendor" : "Add Vendor"}
        />
      </DialogContent>
    </Dialog>
  );
};

export function VendorsTable({
  vendors,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  industryFilter,
  onIndustryFilterChange,
  pagination,
  isLoading = false,
  onStatusUpdate,
  onVendorAdd,
  onVendorUpdate,
  onPageChange,
  onPageSizeChange,
  showAddVendor = false,
  onAddVendorClose,
}: VendorsTableProps) {
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Fetch industries for the filter dropdown
  const industriesData = useQuery(api.data.industry.getActiveIndustries, {
    limit: 100,
  });

  // vendors are already server-filtered; no local industry filter needed
  const displayedVendors = vendors;

  const handleFormSubmit = async (formData: VendorFormData) => {
    if (editingVendor) {
      await onVendorUpdate(editingVendor._id, formData);
    } else {
      await onVendorAdd(formData);
    }
    setEditingVendor(null);
  };

  const openEditForm = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingVendor(null);
  };

  const closeAddForm = () => {
    if (onAddVendorClose) {
      onAddVendorClose();
    }
  };

  // Show loading skeleton
  if (isLoading) {
    return <TableSkeleton rows={5} columns={7} />;
  }

  return (
    <div className="w-full space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <HugeiconsIcon icon={Search} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search vendors by name, contact, or location..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={industryFilter} onValueChange={onIndustryFilterChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              <SelectItem value="none">No Industry</SelectItem>
              {industriesData?.data.map((industry: any) => (
                <SelectItem key={industry._id} value={industry._id}>
                  {industry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter Results Summary */}
      <div className="text-sm text-muted-foreground">
        Showing {displayedVendors.length} of{" "}
        {pagination?.total ?? vendors.length} vendors
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor Name</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedVendors.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  <HugeiconsIcon icon={Building2} className="mx-auto h-12 w-12 mb-2 opacity-40" />
                  <div className="font-medium">No vendors found</div>
                </TableCell>
              </TableRow>
            ) : (
              displayedVendors.map((vendor: Vendor) => (
                <TableRow key={vendor._id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <HugeiconsIcon icon={Building2} className="h-4 w-4 text-primary" />
                      <div>
                        <div className="font-medium">{vendor.name}</div>
                        <Badge
                          variant="outline"
                          className={getServiceRadiusBadgeColor(
                            vendor.service_radius,
                          )}
                        >
                          {vendor.service_radius}m radius
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <HugeiconsIcon icon={User} className="h-3.5 w-3.5" /> {vendor.contact.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <HugeiconsIcon icon={Phone} className="h-3 w-3" /> {vendor.contact.phone}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <HugeiconsIcon icon={Mail} className="h-3 w-3" /> {vendor.contact.email}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <HugeiconsIcon icon={MapPin} className="h-3 w-3" />
                      {vendor.address.address_1 ||
                        vendor.address.address_2}, {vendor.address.city}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getStatusColor(vendor.status)}
                    >
                      {vendor.status}
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
                          onClick={() => setSelectedVendor(vendor)}
                        >
                          <HugeiconsIcon icon={Eye} className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditForm(vendor)}>
                          <HugeiconsIcon icon={Edit} className="h-4 w-4 mr-2" /> Edit Vendor
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {vendor.status === "Active" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              onStatusUpdate(vendor._id, "Inactive")
                            }
                            className="text-red-600"
                          >
                            <HugeiconsIcon icon={UserX} className="h-4 w-4 mr-2" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onStatusUpdate(vendor._id, "Active")}
                            className="text-green-600"
                          >
                            <HugeiconsIcon icon={UserCheck} className="h-4 w-4 mr-2" /> Activate
                          </DropdownMenuItem>
                        )}
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

      {/* Vendor Details Dialog */}
      <VendorDetailsDialog
        vendor={selectedVendor}
        isOpen={!!selectedVendor}
        onClose={() => setSelectedVendor(null)}
      />

      {/* Add/Edit Vendor Form */}
      <VendorFormDialog
        isOpen={showForm || showAddVendor}
        onClose={editingVendor ? closeForm : closeAddForm}
        vendor={editingVendor}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
