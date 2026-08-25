"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon as AlertCircle,
  ChartDownIcon as TrendingDown,
  PackageIcon as Package,
  PlusIcon,
  TagIcon as Tag,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { ClearanceForm } from "@/components/clearance/ClearanceForm";
import {
  ClearanceTable,
  type ClearanceProduct,
} from "@/components/clearance/ClearanceTable";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { formatKES, getConvexErrorMessage } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { toast } from "sonner";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { useDashboardData } from "@/providers/DashboardDataProvider";

export default function ClearancePage() {
  const { categories } = useDashboardData();
  const { can, isLoading: permsLoading } = useCurrentUserPermissions();
  const canRead = permsLoading || can("clearance:READ");
  const canCreate = can("clearance:CREATE");
  const canUpdate = can("clearance:UPDATE");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const currentCursor = cursorStack[cursorStack.length - 1] ?? null;
  const paged = useQuery(
    api.data.clearance_products.getAll,
    canRead
      ? {
          limit,
          cursor: currentCursor,
          status: statusFilter !== "all" ? (statusFilter as any) : undefined,
          vendor_id:
            vendorFilter !== "all"
              ? (vendorFilter as Id<"vendors">)
              : undefined,
          category_id:
            categoryFilter !== "all"
              ? (categoryFilter as Id<"categories">)
              : undefined,
          industry_id:
            industryFilter !== "all"
              ? (industryFilter as Id<"industry">)
              : undefined,
        }
      : "skip",
  );

  const vendors = useQuery(api.data.vendors.getActiveVendors, {
    limit: 100,
    cursor: null,
  });
  const industries = useQuery(api.data.industry.getActiveIndustries, { limit: 200 });

  const createClearanceProduct = useMutation(api.data.clearance_products.create);
  const updateClearanceProduct = useMutation(api.data.clearance_products.update);
  const deactivateClearanceProduct = useMutation(
    api.data.clearance_products.deactivate,
  );
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);

  const isLoading = !paged;

  // Client-side text search filter
  const filteredProducts = useMemo(() => {
    if (!paged?.page) return [];
    const term = debouncedSearchQuery.trim().toLowerCase();
    if (!term) return paged.page;
    return paged.page.filter((p: any) => {
      const text =
        `${p.name} ${p.sku} ${p.brand ?? ""} ${p.barcode ?? ""}`.toLowerCase();
      return text.includes(term);
    });
  }, [paged?.page, debouncedSearchQuery]);

  // Stats
  const stats = useMemo(() => {
    if (!paged?.page)
      return { total: 0, active: 0, soldOut: 0, avgDiscount: 0 };
    const all = paged.page;
    const active = all.filter((p: any) => p.status === "Active").length;
    const soldOut = all.filter((p: any) => p.status === "Sold Out").length;
    const avgDiscount =
      all.length > 0
        ? Math.round(
            all.reduce(
              (sum: number, p: any) => sum + p.discount_percentage,
              0,
            ) / all.length,
          )
        : 0;
    return { total: all.length, active, soldOut, avgDiscount };
  }, [paged?.page]);

  const categoryIdToName = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c._id, c.name));
    return map;
  }, [categories]);

  useEffect(() => {
    setCursorStack([null]);
    setPage(1);
  }, [statusFilter, vendorFilter, categoryFilter, industryFilter]);

  const handlePageChange = (nextPage: number) => {
    const safe = Math.max(1, nextPage);
    if (safe === 1) {
      setCursorStack([null]);
      setPage(1);
    } else if (safe === page + 1 && paged?.continueCursor) {
      setCursorStack((prev) => [...prev, paged.continueCursor as string]);
      setPage((p) => p + 1);
    } else if (safe === page - 1 && cursorStack.length > 1) {
      setCursorStack((prev) => prev.slice(0, -1));
      setPage((p) => Math.max(1, p - 1));
    }
  };

  const handleLimitChange = (nextLimit: number) => {
    setLimit(nextLimit);
    setPage(1);
    setCursorStack([null]);
  };

  const handleFileUpload = async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file) => {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
      const { storageId } = await res.json();
      return storageId;
    });
    return Promise.all(uploadPromises);
  };

  const handleCreate = async (values: any) => {
    try {
      await createClearanceProduct(values);
      setIsDialogOpen(false);
      toast.success("Clearance product created");
    } catch (error: any) {
      toast.error(
        getConvexErrorMessage(error, "Failed to create clearance product"),
      );
      throw error;
    }
  };

  const handleUpdate = async (values: any) => {
    try {
      await updateClearanceProduct(values);
      toast.success("Clearance product updated");
    } catch (error: any) {
      toast.error(
        getConvexErrorMessage(error, "Failed to update clearance product"),
      );
      throw error;
    }
  };

  const handleDeactivate = async (id: Id<"clearance_products">) => {
    try {
      await deactivateClearanceProduct({ id });
      toast.success("Clearance product deactivated");
    } catch (error: any) {
      toast.error(getConvexErrorMessage(error, "Failed to deactivate"));
    }
  };

  const totalPages = paged
    ? paged.isDone && page === 1 && filteredProducts.length < limit
      ? 1
      : paged.isDone
        ? page
        : page + 1
    : 1;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Clearance</h1>
              <p className="text-muted-foreground">
                Manage clearance products with discounted prices
              </p>
            </div>
            {canCreate && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <HugeiconsIcon icon={PlusIcon} className="w-4 h-4 mr-2" />
                    Add Clearance Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Clearance Product</DialogTitle>
                  </DialogHeader>
                  <ClearanceForm
                    categories={categories}
                    vendors={vendors?.data ?? []}
                    industries={industries?.data ?? []}
                    onSubmit={handleCreate}
                    onCancel={() => setIsDialogOpen(false)}
                    onFileUpload={handleFileUpload}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <HugeiconsIcon icon={Tag} className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Listed</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <HugeiconsIcon icon={Package} className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <HugeiconsIcon icon={AlertCircle} className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sold Out</p>
                <p className="text-2xl font-bold">{stats.soldOut}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <HugeiconsIcon icon={TrendingDown} className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Discount</p>
                <p className="text-2xl font-bold">{stats.avgDiscount}%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <ClearanceTable
          products={(filteredProducts as ClearanceProduct[]) ?? []}
          categoryIdToName={categoryIdToName}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          vendorFilter={vendorFilter}
          onVendorFilterChange={setVendorFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          industryFilter={industryFilter}
          onIndustryFilterChange={setIndustryFilter}
          categories={categories}
          vendors={vendors?.data ?? []}
          industries={industries?.data ?? []}
          onUpdateProduct={handleUpdate}
          onDeactivateProduct={handleDeactivate}
          onFileUpload={handleFileUpload}
          canUpdate={canUpdate}
          canCreate={canCreate}
          paginationMeta={{
            page,
            limit,
            total: filteredProducts.length,
            totalPages,
            hasNext: !paged?.isDone,
            hasPrevious: page > 1,
          }}
          onPageChange={handlePageChange}
          onPageSizeChange={handleLimitChange}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
