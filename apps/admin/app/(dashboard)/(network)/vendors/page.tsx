"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building02Icon as Building2,
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle,
  Clock01Icon as Clock,
  PlusSignIcon as Plus,
} from "@hugeicons/core-free-icons";
import { VendorsTable } from "@/components/vendors/VendorsTable";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { getConvexErrorMessage } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

interface Vendor {
  _id: Id<"vendors">;
  name: string;
  industry_id?: Id<"industry">;
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
  service_center?: { lat: number; lng: number } | undefined;
  service_radius: number;
  commission?: number;
  commission_type?: "percentage" | "fixed";
  image?: string;
  status: "Active" | "Inactive";
  updated_at?: number;
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

type VendorFormData = Omit<Vendor, "_id" | "updated_at">;

interface VendorsPagination {
  hasNext: boolean;
  hasPrevious?: boolean;
  totalPages: number;
  currentPage?: number;
  pageSize?: number;
  total: number;
  cursor?: string | null;
}

export default function VendorsPage() {
  const { vendors, isLoaded } = useDashboardData();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const statusArg =
    statusFilter === "all"
      ? undefined
      : statusFilter === "active"
        ? "Active"
        : "Inactive";

  const industryArg =
    industryFilter === "all" || industryFilter === "none"
      ? undefined
      : (industryFilter as Id<"industry">);

  const vendorsResult = useQuery(api.data.vendors.getVendors, {
    limit: pageSize,
    cursor,
    search: debouncedSearchQuery.trim() ? debouncedSearchQuery : undefined,
    status: statusArg,
    industry: industryArg,
  });

  useEffect(() => {
    setCursor(null);
    setCurrentPage(1);
    setCursorHistory([null]);
  }, [debouncedSearchQuery, statusArg, industryArg]);

  const vendorsData = vendorsResult?.data ?? [];
  const pagination: VendorsPagination = {
    hasNext: vendorsResult?.pagination.hasNext ?? false,
    hasPrevious: currentPage > 1,
    totalPages: vendorsResult?.pagination.totalPages ?? 1,
    currentPage: currentPage,
    pageSize: pageSize,
    total: vendorsResult?.pagination.total ?? 0,
    cursor: vendorsResult?.pagination.cursor ?? null,
  };
  const updateVendor = useMutation(api.data.vendors.updateVendor);
  const updateVendorStatus = useMutation(api.data.vendors.updateVendorStatus);
  const addVendor = useMutation(api.data.vendors.addVendor);
  const backFillingVendorsSearchText = useMutation(
    api.data.vendors.backFillingVendorsSearchText,
  );

  useEffect(() => {
    if (!vendorsResult || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      vendorsResult.data.some((vendor: any) => !vendor.searchText) ||
      (debouncedSearchQuery.trim().length > 0 &&
        vendorsResult.pagination.total > 0 &&
        vendorsResult.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    backFillingVendorsSearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.success("Search index updated", {
            description: `Updated ${updatedCount} vendors for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill vendors searchText:", error);
      });
  }, [
    vendorsResult,
    hasTriggeredSearchBackfill,
    debouncedSearchQuery,
    backFillingVendorsSearchText,
  ]);

  const handleStatusUpdate = useCallback(
    async (vendorId: Id<"vendors">, status: "Active" | "Inactive") => {
      try {
        await updateVendorStatus({ vendorId, status });
        toast.success(`Vendor status updated to ${status}`);
      } catch (error) {
        console.error("Error updating vendor status:", error);
        toast.error(
          getConvexErrorMessage(error, "Failed to update vendor status"),
        );
      }
    },
    [updateVendorStatus],
  );

  const handleVendorAdd = useCallback(
    async (formData: VendorFormData) => {
      try {
        const vendorData = {
          name: formData.name,
          industry_id: formData.industry_id,
          image: formData.image,
          contact: formData.contact,
          business_details: {
            business_name: formData.business_details?.business_name ?? "",
            bank_code: formData.business_details?.bank_code ?? "",
            account_number: formData.business_details?.account_number ?? "",
            kra_pin: formData.business_details?.kra_pin
              ? formData.business_details.kra_pin
              : undefined,
          },
          address: formData.address,
          coordinates: formData.coordinates,
          service_center: formData.service_center,
          service_radius: formData.service_radius,
          status: formData.status,
          commission: formData.commission ?? 0,
          commission_type: formData.commission_type ?? ("percentage" as const),
          schedule: formData.schedule,
        };
        await addVendor(vendorData as any);
        toast.success("Vendor added successfully");
      } catch (error) {
        console.error("Error adding vendor:", error);
        toast.error(getConvexErrorMessage(error, "Failed to add vendor"));
        throw error;
      }
    },
    [addVendor],
  );

  const handleVendorUpdate = useCallback(
    async (vendorId: Id<"vendors">, formData: VendorFormData) => {
      try {
        // Transform the data to match the expected API shape
        const vendorData = {
          id: vendorId,
          name: formData.name,
          industry_id: formData.industry_id,
          image: formData.image,
          contact: formData.contact,
          business_details: {
            business_name: formData.business_details?.business_name ?? "",
            bank_code: formData.business_details?.bank_code ?? "",
            account_number: formData.business_details?.account_number ?? "",
            kra_pin: formData.business_details?.kra_pin
              ? formData.business_details.kra_pin
              : undefined,
          },
          address: formData.address,
          coordinates: formData.coordinates,
          service_center: formData.service_center,
          service_radius: formData.service_radius,
          status: formData.status,
          commission: formData.commission ?? 0,
          commission_type: formData.commission_type ?? ("percentage" as const),
          schedule: formData.schedule,
        };
        await updateVendor(vendorData as any);
        toast.success("Vendor updated successfully");
      } catch (error) {
        console.error("Error updating vendor:", error);
        toast.error(getConvexErrorMessage(error, "Failed to update vendor"));
        throw error;
      }
    },
    [updateVendor],
  );

  const handlePageChange = useCallback(
    (page: number, direction: "first" | "prev" | "next" | "last") => {
      if (!vendorsResult) return;

      switch (direction) {
        case "first":
          setCurrentPage(1);
          setCursor(null);
          setCursorHistory([null]);
          break;
        case "prev":
          if (currentPage > 1) {
            const newCurrentPage = currentPage - 1;
            setCurrentPage(newCurrentPage);
            const newCursor = cursorHistory[newCurrentPage - 1];
            setCursor(newCursor ?? null);
            setCursorHistory(cursorHistory.slice(0, newCurrentPage));
          }
          break;
        case "next":
          if (vendorsResult.pagination.hasNext) {
            const newCursor = vendorsResult.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage((prev) => prev + 1);
          }
          break;
        case "last":
          if (vendorsResult.pagination.totalPages > 0) {
            const newCursor = vendorsResult.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage(vendorsResult.pagination.totalPages);
          }
          break;
      }
    },
    [vendorsResult, currentPage, cursorHistory],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    setCursor(null);
    setCursorHistory([null]);
  }, []);

  const totalVendors = vendors?.length;
  const activeVendors =
    vendors?.filter((vendor) => vendor.status === "Active").length || 0;
  const inactiveVendors =
    vendors?.filter((vendor) => vendor.status === "Inactive").length || 0;
  const pendingVendors =
    vendors?.filter((vendor) => !vendor.status).length || 0;

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">
            Loading vendors...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground">
            Manage and monitor vendor accounts
          </p>
        </div>
        <Button onClick={() => setShowAddVendor(true)}>
          <HugeiconsIcon icon={Plus} className="mr-2 h-4 w-4" /> Add Vendor
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            <HugeiconsIcon icon={Building2} className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVendors}</div>
            <p className="text-xs text-muted-foreground">
              All registered vendors
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <HugeiconsIcon icon={CheckCircle} className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeVendors}</div>
            <p className="text-xs text-muted-foreground">
              Currently active vendors
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <HugeiconsIcon icon={XCircle} className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveVendors}</div>
            <p className="text-xs text-muted-foreground">Inactive vendors</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <HugeiconsIcon icon={Clock} className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingVendors}</div>
            <p className="text-xs text-muted-foreground">Pending approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Vendors Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Vendors</CardTitle>
          <CardDescription>
            Manage vendor accounts and their details across the platform
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 pb-6">
            <VendorsTable
              vendors={vendorsData}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              industryFilter={industryFilter}
              onIndustryFilterChange={(val) => {
                setIndustryFilter(val);
                setCursor(null);
                setCurrentPage(1);
                setCursorHistory([null]);
              }}
              pagination={pagination}
              isLoading={!vendorsResult}
              onStatusUpdate={handleStatusUpdate}
              onVendorAdd={handleVendorAdd}
              onVendorUpdate={handleVendorUpdate}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              showAddVendor={showAddVendor}
              onAddVendorClose={() => setShowAddVendor(false)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
