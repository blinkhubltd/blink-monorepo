"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  FilterIcon as Filter,
  PlusSignIcon as Plus,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { Id } from "@repo/backend/dataModel";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { getConvexErrorMessage } from "@/lib/utils";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { BannersForm } from "./BannersForm";
import { BannerRow } from "./BannerRow";
import { BannerPreview } from "./BannerPreview";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/date-utils";
import type { Banner, BannerFormValues } from "./types";

export function BannersTable() {
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [viewingBanner, setViewingBanner] = useState<Banner | null>(null);
  const [bannerToDelete, setBannerToDelete] = useState<Banner | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  // Queries
  const bannersData = useQuery(api.data.banners.getBanners, {
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const categories = useQuery(api.data.categories.getAllCategories);
  const products = useQuery(api.data.products.getAllProducts);
  const vendors = useQuery(api.data.vendors.getAllVendors);

  const banners = bannersData || [];

  // Mutations
  const createBanner = useMutation(api.data.banners.createBanner);
  const updateBanner = useMutation(api.data.banners.updateBanner);
  const deleteBanner = useMutation(api.data.banners.deleteBanner);
  const toggleBannerStatus = useMutation(api.data.banners.toggleBannerStatus);

  const getCategoryName = (categoryId?: Id<"categories">) => {
    if (!categoryId || !categories) return "General";
    const category = categories.find((cat: any) => cat._id === categoryId);
    return category ? category.name : "Unknown Category";
  };

  const getProductName = (productId?: Id<"products">) => {
    if (!productId || !products) return null;
    const product = products.find((p: any) => p._id === productId);
    return product
      ? `${product.name}${product.brand ? ` - ${product.brand}` : ""}`
      : "Unknown Product";
  };

  const getBannerStatus = (banner: Banner) => {
    const now = Date.now();
    const isActive = banner.status === "active";
    const isLive = now >= banner.start_date && now <= banner.end_date;
    const isFuture = now < banner.start_date;
    const isExpired = now > banner.end_date;

    if (!isActive)
      return {
        label: "Inactive",
        variant: "secondary" as const,
        isLive: false,
      };
    if (isExpired)
      return {
        label: "Expired",
        variant: "destructive" as const,
        isLive: false,
      };
    if (isFuture)
      return { label: "Scheduled", variant: "outline" as const, isLive: false };
    if (isLive)
      return { label: "Live", variant: "default" as const, isLive: true };

    return { label: "Active", variant: "default" as const, isLive: false };
  };

  const handleCreateBanner = async (values: BannerFormValues) => {
    try {
      const bannerData = {
        image: values.image,
        header: values.header || undefined,
        sub_header: values.sub_header || undefined,
        cta_text: values.cta_text || undefined,
        status: values.status,
        start_date: values.start_date,
        end_date: values.end_date,
        ...(values.categoryId && { categoryId: values.categoryId }),
        ...(values.promo_type && { promo_type: values.promo_type }),
        ...(values.product_id && { product_id: values.product_id }),
        ...(values.brand && { brand: values.brand }),
      };

      await createBanner(bannerData);
      toast.success("Banner created successfully");
      setShowCreateDialog(false);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to create banner"));
    }
  };

  const handleUpdateBanner = async (values: BannerFormValues) => {
    if (!editingBanner) return;

    try {
      const bannerData = {
        id: editingBanner._id,
        image: values.image,
        header: values.header || undefined,
        sub_header: values.sub_header || undefined,
        cta_text: values.cta_text || undefined,
        status: values.status,
        start_date: values.start_date,
        end_date: values.end_date,
        ...(values.categoryId && { categoryId: values.categoryId }),
        ...(values.promo_type && { promo_type: values.promo_type }),
        ...(values.product_id && { product_id: values.product_id }),
        ...(values.brand && { brand: values.brand }),
      };

      await updateBanner(bannerData);
      toast.success("Banner updated successfully");
      setEditingBanner(null);
      setShowEditDialog(false);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to update banner"));
    }
  };

  const handleDeleteBanner = async () => {
    if (!bannerToDelete) return;

    try {
      await deleteBanner({ id: bannerToDelete._id });
      toast.success("Banner deleted successfully");
      setBannerToDelete(null);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to delete banner"));
    }
  };

  const handleEditBanner = (banner: Banner) => {
    setEditingBanner(banner);
    setShowEditDialog(true);
  };

  const handleToggleStatus = async (banner: Banner) => {
    try {
      const result = await toggleBannerStatus({ id: banner._id });
      toast.success(
        `Banner ${result.status === "active" ? "activated" : "deactivated"} successfully`,
      );
    } catch (error) {
      toast.error(
        getConvexErrorMessage(error, "Failed to toggle banner status"),
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Banners</h1>
          <p className="text-muted-foreground">
            Manage promotional banners for your mobile app
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <HugeiconsIcon icon={Plus} className="h-4 w-4" />
          Create Banner
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Filter} className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              All Banners
            </Button>
            <Button
              variant={statusFilter === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("active")}
            >
              Active
            </Button>
            <Button
              variant={statusFilter === "inactive" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("inactive")}
            >
              Inactive
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Banner</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Promotion</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="text-muted-foreground">
                      {statusFilter === "all"
                        ? "No banners found. Create your first banner to get started."
                        : `No ${statusFilter} banners found.`}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                banners.map((banner: any) => (
                  <BannerRow
                    key={banner._id}
                    banner={banner}
                    categories={categories}
                    products={products}
                    vendors={vendors}
                    onEdit={handleEditBanner}
                    onDelete={setBannerToDelete}
                    onView={setViewingBanner}
                    onToggleStatus={handleToggleStatus}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Banner Dialog */}
      <Dialog
        open={!!viewingBanner}
        onOpenChange={() => setViewingBanner(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Banner Details</DialogTitle>
            <DialogDescription>
              View complete banner information and schedule
            </DialogDescription>
          </DialogHeader>
          {viewingBanner && (
            <div className="space-y-6">
              {/* Banner Preview */}
              <BannerPreview banner={viewingBanner} />

              {/* Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Status:</span>
                  <Badge
                    variant={getBannerStatus(viewingBanner).variant}
                    className="ml-2"
                  >
                    {getBannerStatus(viewingBanner).label}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Category:</span>
                  <Badge
                    variant={viewingBanner.categoryId ? "secondary" : "outline"}
                    className="ml-2"
                  >
                    {getCategoryName(viewingBanner.categoryId)}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Promotion Type:</span>
                  {viewingBanner.promo_type ? (
                    <Badge
                      variant={
                        viewingBanner.promo_type === "product"
                          ? "default"
                          : "outline"
                      }
                      className="ml-2 capitalize"
                    >
                      {viewingBanner.promo_type}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="ml-2">
                      General
                    </Badge>
                  )}
                </div>
                <div>
                  <span className="font-medium">Promoted Item:</span>
                  <span className="ml-2">
                    {viewingBanner.promo_type === "product" &&
                    viewingBanner.product_id
                      ? getProductName(viewingBanner.product_id)
                      : viewingBanner.promo_type === "brand" &&
                          viewingBanner.brand
                        ? viewingBanner.brand
                        : "—"}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Start Date:</span>
                  <span className="ml-2">
                    {formatDateTime(viewingBanner.start_date)}
                  </span>
                </div>
                <div>
                  <span className="font-medium">End Date:</span>
                  <span className="ml-2">
                    {formatDateTime(viewingBanner.end_date)}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Created:</span>
                  <span className="ml-2">
                    {viewingBanner.created_at
                      ? formatDateTime(viewingBanner.created_at)
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Updated:</span>
                  <span className="ml-2">
                    {viewingBanner.updated_at
                      ? formatDateTime(viewingBanner.updated_at)
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!bannerToDelete}
        onOpenChange={() => setBannerToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Banner</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this banner? This action cannot be
              undone.
            </AlertDialogDescription>
            {bannerToDelete && (
              <div className="mt-2 p-3 bg-muted rounded-lg">
                <div className="font-medium">
                  {bannerToDelete.header || "Untitled Banner"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {bannerToDelete.sub_header || "No description"}
                </div>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBanner}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Banner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Banner Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Banner</DialogTitle>
            <DialogDescription>
              Add a new promotional banner for your mobile app
            </DialogDescription>
          </DialogHeader>
          <BannersForm
            onSubmit={handleCreateBanner}
            onCancel={() => setShowCreateDialog(false)}
            mode="create"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Banner Dialog */}
      <Dialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) {
            setEditingBanner(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Banner</DialogTitle>
            <DialogDescription>
              Update banner details and schedule
            </DialogDescription>
          </DialogHeader>
          {editingBanner && (
            <BannersForm
              onSubmit={handleUpdateBanner}
              onCancel={() => {
                setShowEditDialog(false);
                setEditingBanner(null);
              }}
              initialBanner={editingBanner}
              mode="edit"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
