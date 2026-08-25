"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon as AlertCircle,
  ChartBarLineIcon as BarChart3,
  ChartUpIcon as TrendingUp,
  FileUpIcon as FileUp,
  ImagesIcon as Images,
  PackageIcon as Package,
  PlusIcon,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { ProductForm } from "@/components/products/ProductForm";
import { ProductTable } from "@/components/products/ProductTable";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { formatKES } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { toast } from "sonner";
import { ProductImport } from "@/components/products/ProductImport";
import { BulkImageUpload } from "@/components/products/BulkImageUpload";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import Link from "next/link";

export default function ProductsPage() {
  const { products: allProducts, categories } = useDashboardData();
  const { isAdminUser, convexUser, can } = useCurrentUserPermissions();
  const canMoveToClearance = can("clearance:CREATE");
  const industries = useQuery(api.data.industry.getActiveIndustries, { limit: 200 });

  // Auto-filter by assigned vendors for managers
  const assignedVendorIds = (convexUser as any)?.manager_details?.vendor_id as
    | Id<"vendors">[]
    | undefined;

  const [selectedProductIds, setSelectedProductIds] = useState<
    Id<"products">[]
  >([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isBulkImageDialogOpen, setIsBulkImageDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "Active" | "Inactive" | "Archived"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const currentCursor = cursorStack[cursorStack.length - 1] ?? null;
  const paged = useQuery(api.data.products.getProducts, {
    limit,
    cursor: currentCursor,
    search: debouncedSearchQuery.trim() ? debouncedSearchQuery : undefined,
    status:
      statusFilter !== "all"
        ? (statusFilter as "Active" | "Inactive" | "Archived")
        : undefined,
    category_id:
      categoryFilter !== "all"
        ? (categoryFilter as Id<"categories">)
        : undefined,
    vendor_id:
      vendorFilter !== "all" ? (vendorFilter as Id<"vendors">) : undefined,
    vendor_ids:
      assignedVendorIds &&
      assignedVendorIds.length > 0 &&
      vendorFilter === "all"
        ? assignedVendorIds
        : undefined,
  });
  const isLoading = !paged;

  // Fetch vendors for the product form
  const vendors = useQuery(api.data.vendors.getActiveVendors, {
    limit: 100,
    cursor: null,
  });

  const createProduct = useMutation(api.data.products.createProduct);
  const updateProduct = useMutation(api.data.products.updateProduct);
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const backfillProductsSearchText = useMutation(
    api.data.products.backfillProductsSearchText,
  );
  const updateSingleProductStatus = useMutation(
    api.data.products.updateSingleProductStatus,
  );
  const bulkUpdateProductStatus = useMutation(
    api.data.products.bulkUpdateProductStatus,
  );

  const categoryIdToName = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c._id, c.name));
    return map;
  }, [categories]);

  const productStats = useMemo(() => {
    const total = allProducts.length;
    const active = allProducts.filter((p) => p.status === "Active").length;
    const lowStock = allProducts.filter((p) => p.quantity < 10).length;
    const totalValue = allProducts.reduce(
      (sum, p) => sum + p.price * p.quantity,
      0,
    );

    return { total, active, lowStock, totalValue };
  }, [allProducts]);

  useEffect(() => {
    // Reset pagination when search or filters change
    setCursorStack([null]);
    setPage(1);
  }, [debouncedSearchQuery, statusFilter, categoryFilter, vendorFilter]);

  useEffect(() => {
    if (!paged || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      (paged.data as any[]).some((p) => !p.searchText) ||
      (debouncedSearchQuery.trim().length > 0 &&
        paged.pagination.total > 0 &&
        paged.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    backfillProductsSearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.success("Search index updated", {
            description: `Updated ${updatedCount} products for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill products searchText:", error);
      });
  }, [
    paged,
    hasTriggeredSearchBackfill,
    debouncedSearchQuery,
    backfillProductsSearchText,
  ]);

  const handlePageChange = (nextPage: number) => {
    const safe = Math.max(1, nextPage);
    if (safe === 1) {
      setCursorStack([null]);
      setPage(1);
    } else if (safe === page + 1 && paged?.pagination.cursor) {
      setCursorStack((prev) => [...prev, paged.pagination.cursor as string]);
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

  const handleCreateProduct = async (values: any) => {
    try {
      await createProduct(values);
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Failed to create product:", error);
    }
  };

  const handleEditProduct = async (values: any) => {
    try {
      await updateProduct(values);
    } catch (error) {
      console.error("Failed to update product:", error);
      throw error; // Re-throw to let the form handle the error
    }
  };

  const handleFileUpload = async (files: File[]): Promise<string[]> => {
    try {
      const uploadPromises = files.map(async (file) => {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadResult.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const { storageId } = await uploadResult.json();
        return storageId;
      });

      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error("File upload failed:", error);
      throw error;
    }
  };

  const handleBulkStatusUpdate = async (
    status: "Active" | "Inactive" | "Archived",
  ) => {
    if (selectedProductIds.length === 0) {
      console.error("No products selected for bulk update");
      return;
    }

    // Filter out any undefined or invalid values
    const validIds = selectedProductIds.filter(
      (id): id is Id<"products"> =>
        id != null && typeof id === "string" && id.trim() !== "",
    );

    if (validIds.length === 0) {
      console.error("No valid product IDs to update");
      return;
    }

    console.log("Bulk updating products:", {
      status,
      productIds: validIds,
    });

    try {
      await bulkUpdateProductStatus({
        productIds: validIds,
        status,
      });
      setSelectedProductIds([]);
    } catch (error) {
      console.error("Failed to update product status:", error);
    }
  };

  const handleSelectedIdsChange = (ids: Id<"products">[]) => {
    // Filter out any undefined or invalid values
    const validIds = ids.filter(
      (id): id is Id<"products"> =>
        id != null && typeof id === "string" && id.trim() !== "",
    );

    console.log("Selected IDs changed:", {
      received: ids.map((id) => id as string),
      valid: validIds.map((id) => id as string),
    });

    setSelectedProductIds(validIds);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Products</h1>
              <p className="text-muted-foreground">
                Manage your product catalog and inventory
              </p>
            </div>

            <div className="flex gap-2">
              {isAdminUser && (
                <Link href="/products/insights">
                  <Button variant="outline" size="sm">
                    <HugeiconsIcon icon={BarChart3} className="w-4 h-4 mr-2" />
                    View Insights
                  </Button>
                </Link>
              )}
              <Dialog
                open={isImportDialogOpen}
                onOpenChange={setIsImportDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <HugeiconsIcon icon={FileUp} className="w-4 h-4 mr-2" />
                    Import Excel
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold">
                      Import Products from Excel
                    </DialogTitle>
                  </DialogHeader>
                  {vendors?.data && vendors.data.length > 0 ? (
                    <ProductImport
                      categories={categories}
                      vendors={vendors.data}
                      onClose={() => setIsImportDialogOpen(false)}
                    />
                  ) : (
                    <div className="p-4 text-center text-gray-500">
                      Loading vendors...
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              <Dialog
                open={isBulkImageDialogOpen}
                onOpenChange={setIsBulkImageDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <HugeiconsIcon icon={Images} className="w-4 h-4 mr-2" />
                    Bulk Images
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold">
                      Bulk Image Upload
                    </DialogTitle>
                  </DialogHeader>
                  <BulkImageUpload
                    products={allProducts.map((p: any) => ({
                      _id: p._id,
                      name: p.name,
                      sku: p.sku,
                    }))}
                    onClose={() => setIsBulkImageDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gray-900 text-yellow-400 font-medium">
                    <HugeiconsIcon icon={PlusIcon} className="w-4 h-4 mr-2" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold">
                      Add New Product
                    </DialogTitle>
                  </DialogHeader>
                  {vendors?.data && vendors.data.length > 0 ? (
                    <ProductForm
                      categories={categories}
                      vendors={vendors.data}
                      onSubmit={handleCreateProduct}
                      onCancel={() => setIsDialogOpen(false)}
                      onFileUpload={handleFileUpload}
                    />
                  ) : (
                    <div className="p-4 text-center text-gray-500">
                      Loading vendors...
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Products
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {productStats.total}
                  </p>
                </div>
                <HugeiconsIcon icon={Package} className="w-8 h-8 text-accent" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Active Products
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {productStats.active}
                  </p>
                </div>
                <HugeiconsIcon icon={TrendingUp} className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Low Stock</p>
                  <p className="text-2xl font-bold text-foreground">
                    {productStats.lowStock}
                  </p>
                </div>
                <HugeiconsIcon icon={AlertCircle} className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Value</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatKES(productStats.totalValue)}
                  </p>
                </div>
                <HugeiconsIcon icon={Package} className="w-8 h-8 text-accent" />
              </div>
            </CardContent>
          </Card>
        </div>

        {selectedProductIds.length > 0 && (
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {selectedProductIds.length} product
                  {selectedProductIds.length > 1 ? "s" : ""} selected
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusUpdate("Active")}
                    className="text-green-600 border-green-200 hover:bg-green-50"
                  >
                    Mark Active
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusUpdate("Inactive")}
                    className="text-orange-600 border-orange-200 hover:bg-orange-50"
                  >
                    Mark Inactive
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusUpdate("Archived")}
                    className="text-gray-600 border-gray-200 hover:bg-gray-50"
                  >
                    Archive
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <ProductTable
              products={paged?.data ?? []}
              categoryIdToName={categoryIdToName}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              vendorFilter={vendorFilter}
              onVendorFilterChange={setVendorFilter}
              categories={categories}
              vendors={
                assignedVendorIds && assignedVendorIds.length > 0
                  ? (vendors?.data ?? []).filter((v: any) =>
                      assignedVendorIds.includes(v._id),
                    )
                  : (vendors?.data ?? [])
              }
              onUpdateProduct={handleEditProduct}
              selectedIds={selectedProductIds}
              onSelectedIdsChange={handleSelectedIdsChange}
              updateSingleProductStatus={async (productId, status) => {
                await updateSingleProductStatus({ productId, status });
              }}
              bulkUpdateProductStatus={async (productIds, status) => {
                await bulkUpdateProductStatus({ productIds, status });
              }}
              industries={industries?.data ?? []}
              canMoveToClearance={canMoveToClearance}
              onFileUpload={handleFileUpload}
              paginationMeta={{
                page,
                limit,
                total: paged?.pagination.total ?? 0,
                totalPages: paged?.pagination.totalPages ?? 1,
                hasNext: paged?.pagination.hasNext ?? false,
                hasPrevious: page > 1,
              }}
              onPageChange={handlePageChange}
              onPageSizeChange={handleLimitChange}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
