"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon as Plus, Search01Icon as Search } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { getConvexErrorMessage } from "@/lib/utils";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
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
import { toast } from "sonner";
import { BrandRow } from "./BrandRow";
import { BrandsForm } from "./BrandsForm";
import type { Brand, BrandFormValues } from "./types";

type StatusFilter = "all" | "active" | "inactive";

export function BrandsTable() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);

  const paged = useQuery(api.data.brands.getBrands, {
    limit: 200,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  // Counts come from the catalogue rather than a per-brand query: the point of
  // the column is to warn before a delete that will be refused, and the admin
  // already loads this list for its own dropdowns.
  const products = useQuery(api.data.products.getAllProducts);

  const createBrand = useMutation(api.data.brands.createBrand);
  const updateBrand = useMutation(api.data.brands.updateBrand);
  const deleteBrand = useMutation(api.data.brands.deleteBrand);
  const toggleBrandStatus = useMutation(api.data.brands.toggleBrandStatus);

  const brands = (paged?.data ?? []) as Brand[];
  const isLoading = paged === undefined;

  const productCountByBrand = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products ?? []) {
      if (!product.brand_id) continue;
      counts.set(product.brand_id, (counts.get(product.brand_id) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return brands;
    return brands.filter(
      (brand) =>
        brand.name.toLowerCase().includes(term) ||
        brand.slug.toLowerCase().includes(term),
    );
  }, [brands, search]);

  const handleCreate = async (values: BrandFormValues) => {
    try {
      await createBrand(values);
      toast.success("Brand created successfully");
      setShowCreateDialog(false);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to create brand"));
    }
  };

  const handleUpdate = async (values: BrandFormValues) => {
    if (!editingBrand) return;
    try {
      await updateBrand({ id: editingBrand._id, ...values });
      toast.success("Brand updated successfully");
      setEditingBrand(null);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to update brand"));
    }
  };

  const handleDelete = async () => {
    if (!brandToDelete) return;
    try {
      await deleteBrand({ id: brandToDelete._id });
      toast.success("Brand deleted");
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to delete brand"));
    } finally {
      setBrandToDelete(null);
    }
  };

  const handleToggleStatus = async (brand: Brand) => {
    try {
      const result = await toggleBrandStatus({ id: brand._id });
      toast.success(
        result.status === "active" ? "Brand activated" : "Brand deactivated",
      );
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to update brand"));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-56 flex-1">
            <HugeiconsIcon
              icon={Search}
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands..."
              className="pl-9"
            />
          </div>
          {(["all", "active", "inactive"] as const).map((value) => (
            <Button
              key={value}
              variant={statusFilter === value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(value)}
            >
              {value === "all"
                ? "All"
                : value === "active"
                  ? "Active"
                  : "Inactive"}
            </Button>
          ))}
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <HugeiconsIcon icon={Plus} className="mr-2 h-4 w-4" />
            New Brand
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    Loading brands...
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    No brands yet. Create one to link products and banners to
                    it.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((brand) => (
                  <BrandRow
                    key={brand._id}
                    brand={brand}
                    productCount={productCountByBrand.get(brand._id) ?? 0}
                    onEdit={setEditingBrand}
                    onDelete={setBrandToDelete}
                    onToggleStatus={handleToggleStatus}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Brand</DialogTitle>
            <DialogDescription>
              Products and banners can be linked to this brand once it exists.
            </DialogDescription>
          </DialogHeader>
          <BrandsForm
            mode="create"
            onSubmit={handleCreate}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingBrand}
        onOpenChange={(open) => !open && setEditingBrand(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
            <DialogDescription>
              Renaming a brand also moves its page in the shop app.
            </DialogDescription>
          </DialogHeader>
          {editingBrand && (
            <BrandsForm
              mode="edit"
              initialBrand={editingBrand}
              onSubmit={handleUpdate}
              onCancel={() => setEditingBrand(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!brandToDelete}
        onOpenChange={(open) => !open && setBrandToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand</AlertDialogTitle>
            <AlertDialogDescription>
              {brandToDelete &&
              (productCountByBrand.get(brandToDelete._id) ?? 0) > 0
                ? `"${brandToDelete.name}" is assigned to ${productCountByBrand.get(brandToDelete._id)} product(s). Reassign them first — this delete will be refused.`
                : `Are you sure you want to delete "${brandToDelete?.name}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Brand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
