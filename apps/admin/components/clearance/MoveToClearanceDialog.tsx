"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@repo/ui/components/ui/dialog";
import { ClearanceForm } from "./ClearanceForm";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";

interface SourceProduct {
  _id: Id<"products">;
  name: string;
  sku: string;
  brand?: string;
  description?: string;
  category_id: Id<"categories">;
  vendor_id?: Id<"vendors">;
  price: number;
  quantity: number;
  unit_value?: number;
  unit_type?: string;
  images?: (string | null)[];
  image_storage_ids?: string[];
  upc?: number;
}

interface Category {
  _id: string;
  name: string;
  parent_category_id?: string;
}

interface Vendor {
  _id: string;
  name: string;
  status: string;
}

interface Industry {
  _id: string;
  name: string;
}

interface MoveToClearanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: SourceProduct;
  categories: Category[];
  vendors: Vendor[];
  industries: Industry[];
  onFileUpload: (files: File[]) => Promise<string[]>;
}

export function MoveToClearanceDialog({
  open,
  onOpenChange,
  product,
  categories,
  vendors,
  industries,
  onFileUpload,
}: MoveToClearanceDialogProps) {
  const createClearanceProduct = useMutation(api.data.clearance_products.create);
  const deactivateOriginal = useMutation(
    api.data.products.updateSingleProductStatus,
  );

  const handleSubmit = async (values: any) => {
    try {
      // If no new images were uploaded, forward the original product's storage IDs
      if (!values.images && product.image_storage_ids?.length) {
        values.images = product.image_storage_ids;
      }

      // 1. Create the clearance product
      await createClearanceProduct(values);

      // 2. Auto-deactivate the original product
      await deactivateOriginal({
        productId: product._id,
        status: "Inactive",
      });

      toast.success("Product moved to clearance", {
        description: `"${product.name}" is now a clearance product and the original has been deactivated.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast.error(
        getConvexErrorMessage(error, "Failed to move product to clearance"),
      );
      throw error;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Move to Clearance</DialogTitle>
          <DialogDescription>
            Create a clearance listing from &quot;{product.name}&quot;. The
            original product will be automatically deactivated.
          </DialogDescription>
        </DialogHeader>
        <ClearanceForm
          categories={categories}
          vendors={vendors}
          industries={industries}
          initialValues={{
            name: product.name,
            sku: product.sku,
            brand: product.brand || "",
            description: product.description || "",
            category_id: product.category_id as string,
            vendor_id: (product.vendor_id as string) || "",
            original_price: String(product.price),
            clearance_price: "",
            quantity: String(product.quantity),
            expiry_date: "",
            unit_type: product.unit_type || "",
            unit_value: product.unit_value ? String(product.unit_value) : "",
            images: product.images ?? [],
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          onFileUpload={onFileUpload}
        />
      </DialogContent>
    </Dialog>
  );
}
