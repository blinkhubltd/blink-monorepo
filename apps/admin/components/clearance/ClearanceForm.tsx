"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon as AlertCircle,
  InformationCircleIcon as Info,
  Loading03Icon as Loader2,
} from "@hugeicons/core-free-icons";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CascadingSelect } from "@/components/ui/cascading-select";
import { useCascadingCategories } from "@/lib/hooks/useCascadingCategories";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";

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

interface ClearanceFormData {
  name: string;
  sku: string;
  description: string;
  barcode: string;
  brand: string;
  category_id: string;
  industry_id: string;
  vendor_id: string;
  original_price: string;
  clearance_price: string;
  quantity: string;
  expiry_date: string;
  unit_type: string;
  unit_value: string;
  tags: ("Featured" | "Offer")[];
}

interface ValidationErrors {
  name?: string;
  sku?: string;
  category_id?: string;
  vendor_id?: string;
  original_price?: string;
  clearance_price?: string;
  quantity?: string;
  expiry_date?: string;
  image?: string;
  form?: string;
}

interface ClearanceFormProps {
  categories: Category[];
  vendors: Vendor[];
  industries: Industry[];
  onSubmit: (values: any) => Promise<void>;
  onCancel?: () => void;
  initialValues?: Partial<ClearanceFormData> & {
    images?: (string | null)[];
    tags?: ("Featured" | "Offer")[];
  };
  isEditMode?: boolean;
  onFileUpload?: (files: File[]) => Promise<string[]>;
}

const DAY_MS = 86400000;

export function ClearanceForm({
  categories,
  vendors,
  industries,
  onSubmit,
  onCancel,
  initialValues,
  isEditMode = false,
  onFileUpload,
}: ClearanceFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ClearanceFormData>({
    name: initialValues?.name || "",
    sku: initialValues?.sku || "",
    description: initialValues?.description || "",
    barcode: initialValues?.barcode || "",
    brand: initialValues?.brand || "",
    category_id: initialValues?.category_id || "",
    industry_id: initialValues?.industry_id || "",
    vendor_id: initialValues?.vendor_id || "",
    original_price: initialValues?.original_price || "",
    clearance_price: initialValues?.clearance_price || "",
    quantity: initialValues?.quantity || "",
    expiry_date: initialValues?.expiry_date || "",
    unit_type: initialValues?.unit_type || "",
    unit_value: initialValues?.unit_value || "",
    tags: initialValues?.tags || [],
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Fetch buffer days from platform settings
  const bufferSetting = useQuery(api.data.platform_settings.get, {
    key: "clearance_expiry_buffer_days",
  });
  const bufferDays = bufferSetting ? parseInt(bufferSetting.value, 10) : 1;

  const {
    rootCategories: hookRootCategories,
    loadChildCategories: hookLoadChildCategories,
  } = useCascadingCategories();

  // Show existing image previews in edit mode
  useEffect(() => {
    if (isEditMode && initialValues?.images) {
      const existingUrls = initialValues.images.filter(
        (url): url is string => url !== null && url !== undefined,
      );
      if (existingUrls.length > 0) {
        setImagePreviews(existingUrls);
      }
    }
  }, [isEditMode, initialValues?.images]);

  // Auto-calculated fields
  const discountPercentage = useMemo(() => {
    const original = parseFloat(formData.original_price);
    const clearance = parseFloat(formData.clearance_price);
    if (
      !original ||
      !clearance ||
      original <= 0 ||
      clearance <= 0 ||
      clearance >= original
    ) {
      return null;
    }
    return Math.round(((original - clearance) / original) * 100 * 100) / 100;
  }, [formData.original_price, formData.clearance_price]);

  const displayEndDate = useMemo(() => {
    if (!formData.expiry_date) return null;
    const expiryTs = new Date(formData.expiry_date).getTime();
    if (isNaN(expiryTs)) return null;
    return expiryTs - bufferDays * DAY_MS;
  }, [formData.expiry_date, bufferDays]);

  const displayEndDateWarning = useMemo(() => {
    if (!displayEndDate) return null;
    if (displayEndDate <= Date.now()) {
      return "Display end date is in the past. Product will not be shown.";
    }
    return null;
  }, [displayEndDate]);

  const handleInputChange = (field: keyof ClearanceFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
    // Clear error for the field
    if (errors[field as keyof ValidationErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof ValidationErrors];
        return next;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.image;
      return next;
    });

    if (files.length > 0) {
      const maxSize = 5 * 1024 * 1024;
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];

      for (const file of files) {
        if (file.size > maxSize) {
          setErrors((prev) => ({
            ...prev,
            image: "All images must be less than 5MB",
          }));
          return;
        }
        if (!allowedTypes.includes(file.type)) {
          setErrors((prev) => ({
            ...prev,
            image: "All images must be JPEG, PNG, WebP, or GIF",
          }));
          return;
        }
      }

      setSelectedFiles(files);

      const previewPromises = files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          }),
      );

      Promise.all(previewPromises).then(setImagePreviews);
    } else {
      setSelectedFiles([]);
      setImagePreviews([]);
    }
  };

  const validate = (): ValidationErrors => {
    const errs: ValidationErrors = {};
    if (!formData.name.trim()) errs.name = "Name is required";
    if (!formData.sku.trim()) errs.sku = "SKU is required";
    if (!formData.category_id) errs.category_id = "Category is required";
    if (!formData.vendor_id) errs.vendor_id = "Vendor is required";

    const original = parseFloat(formData.original_price);
    const clearance = parseFloat(formData.clearance_price);
    if (!original || original <= 0)
      errs.original_price = "Valid original price is required";
    if (!clearance || clearance <= 0)
      errs.clearance_price = "Valid clearance price is required";
    if (original && clearance && clearance >= original) {
      errs.clearance_price = "Clearance price must be less than original price";
    }

    const qty = parseInt(formData.quantity, 10);
    if (!qty || qty < 1) errs.quantity = "Quantity must be at least 1";

    if (!formData.expiry_date) {
      errs.expiry_date = "Expiry date is required";
    } else {
      const expiryTs = new Date(formData.expiry_date).getTime();
      if (expiryTs <= Date.now()) {
        errs.expiry_date = "Expiry date must be in the future";
      }
      const endDate = expiryTs - bufferDays * DAY_MS;
      if (endDate <= Date.now()) {
        errs.expiry_date =
          "Expiry date minus buffer days must be in the future";
      }
    }

    return errs;
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    // Mark all fields as touched
    const allTouched: Record<string, boolean> = {};
    Object.keys(formData).forEach((k) => (allTouched[k] = true));
    setTouched(allTouched);

    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      let imageStorageIds: string[] | undefined;

      // Upload new files if provided
      if (selectedFiles.length > 0 && onFileUpload) {
        imageStorageIds = await onFileUpload(selectedFiles);
      }

      const payload: any = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        category_id: formData.category_id,
        vendor_id: formData.vendor_id,
        original_price: parseFloat(formData.original_price),
        clearance_price: parseFloat(formData.clearance_price),
        quantity: parseInt(formData.quantity, 10),
        expiry_date: new Date(formData.expiry_date).getTime(),
      };

      if (formData.description.trim())
        payload.description = formData.description.trim();
      if (formData.barcode.trim()) payload.barcode = formData.barcode.trim();
      if (formData.brand.trim()) payload.brand = formData.brand.trim();
      if (formData.industry_id) payload.industry_id = formData.industry_id;
      if (formData.unit_type.trim())
        payload.unit_type = formData.unit_type.trim();
      if (formData.unit_value)
        payload.unit_value = parseFloat(formData.unit_value);
      if (imageStorageIds) payload.images = imageStorageIds;
      if (formData.tags.length > 0) payload.tags = formData.tags;

      await onSubmit(payload);
    } catch (error: any) {
      setErrors({ form: getConvexErrorMessage(error, "Failed to save") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const ErrorMessage = ({ error }: { error?: string }) =>
    error ? <p className="text-sm text-red-500 mt-1">{error}</p> : null;

  return (
    <div className="space-y-6">
      {errors.form && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
          <HugeiconsIcon icon={AlertCircle} className="w-4 h-4 shrink-0" />
          {errors.form}
        </div>
      )}

      {/* Name & SKU */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder="Product name"
            className={touched.name && errors.name ? "border-red-300" : ""}
          />
          <ErrorMessage error={touched.name ? errors.name : undefined} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sku">SKU *</Label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => handleInputChange("sku", e.target.value)}
            placeholder="Stock keeping unit"
            className={touched.sku && errors.sku ? "border-red-300" : ""}
          />
          <ErrorMessage error={touched.sku ? errors.sku : undefined} />
        </div>
      </div>

      {/* Category & Vendor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Category *</Label>
          <CascadingSelect
            options={hookRootCategories}
            value={formData.category_id}
            onValueChange={(value) => handleInputChange("category_id", value)}
            loadChildren={hookLoadChildCategories}
            placeholder="Select category"
            className={
              touched.category_id && errors.category_id ? "border-red-300" : ""
            }
          />
          <ErrorMessage
            error={touched.category_id ? errors.category_id : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Vendor *</Label>
          <SearchableSelect
            options={vendors.map((v) => ({
              value: v._id,
              label: v.name,
            }))}
            value={formData.vendor_id}
            onValueChange={(value) => handleInputChange("vendor_id", value)}
            placeholder="Select vendor"
            searchPlaceholder="Search vendors..."
            className={
              touched.vendor_id && errors.vendor_id ? "border-red-300" : ""
            }
          />
          <ErrorMessage
            error={touched.vendor_id ? errors.vendor_id : undefined}
          />
        </div>
      </div>

      {/* Industry & Brand */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Industry</Label>
          <SearchableSelect
            options={industries.map((i) => ({
              value: i._id,
              label: i.name,
            }))}
            value={formData.industry_id}
            onValueChange={(value) => handleInputChange("industry_id", value)}
            placeholder="Select industry"
            searchPlaceholder="Search industries..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            value={formData.brand}
            onChange={(e) => handleInputChange("brand", e.target.value)}
            placeholder="Product brand"
          />
        </div>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="original_price">Original Price (KES) *</Label>
          <Input
            id="original_price"
            type="number"
            min="0"
            step="0.01"
            value={formData.original_price}
            onChange={(e) =>
              handleInputChange("original_price", e.target.value)
            }
            placeholder="0.00"
            className={
              touched.original_price && errors.original_price
                ? "border-red-300"
                : ""
            }
          />
          <ErrorMessage
            error={touched.original_price ? errors.original_price : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clearance_price">Clearance Price (KES) *</Label>
          <Input
            id="clearance_price"
            type="number"
            min="0"
            step="0.01"
            value={formData.clearance_price}
            onChange={(e) =>
              handleInputChange("clearance_price", e.target.value)
            }
            placeholder="0.00"
            className={
              touched.clearance_price && errors.clearance_price
                ? "border-red-300"
                : ""
            }
          />
          <ErrorMessage
            error={touched.clearance_price ? errors.clearance_price : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Discount</Label>
          <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm">
            {discountPercentage !== null ? `${discountPercentage}%` : "—"}
          </div>
        </div>
      </div>

      {/* Quantity & Expiry */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="quantity">Quantity *</Label>
          <Input
            id="quantity"
            type="number"
            min="1"
            value={formData.quantity}
            onChange={(e) => handleInputChange("quantity", e.target.value)}
            placeholder="1"
            className={
              touched.quantity && errors.quantity ? "border-red-300" : ""
            }
          />
          <ErrorMessage
            error={touched.quantity ? errors.quantity : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expiry_date">Expiry Date *</Label>
          <Input
            id="expiry_date"
            type="date"
            value={formData.expiry_date}
            onChange={(e) => handleInputChange("expiry_date", e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className={
              touched.expiry_date && errors.expiry_date ? "border-red-300" : ""
            }
          />
          <ErrorMessage
            error={touched.expiry_date ? errors.expiry_date : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Display Until</Label>
          <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm">
            {displayEndDate
              ? new Date(displayEndDate).toLocaleDateString()
              : "—"}
          </div>
          {displayEndDateWarning && (
            <p className="text-sm text-orange-600 flex items-center gap-1">
              <HugeiconsIcon icon={AlertCircle} className="w-3 h-3" />
              {displayEndDateWarning}
            </p>
          )}
        </div>
      </div>

      {/* Barcode */}
      <div className="space-y-1.5">
        <Label htmlFor="barcode">Barcode</Label>
        <Input
          id="barcode"
          value={formData.barcode}
          onChange={(e) => handleInputChange("barcode", e.target.value)}
          placeholder="Product barcode"
        />
      </div>

      {/* Unit fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="unit_type">Unit Type</Label>
          <Input
            id="unit_type"
            value={formData.unit_type}
            onChange={(e) => handleInputChange("unit_type", e.target.value)}
            placeholder='e.g. "kg", "liter"'
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit_value">Unit Value</Label>
          <Input
            id="unit_value"
            type="number"
            min="0"
            step="any"
            value={formData.unit_value}
            onChange={(e) => handleInputChange("unit_value", e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          placeholder="Product description"
          rows={3}
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex items-center gap-6">
          {(["Featured", "Offer"] as const).map((tag) => (
            <div key={tag} className="flex items-center gap-2">
              <Checkbox
                id={`tag-${tag}`}
                checked={formData.tags.includes(tag)}
                onCheckedChange={(checked) => {
                  setFormData((prev) => ({
                    ...prev,
                    tags: checked
                      ? [...prev.tags, tag]
                      : prev.tags.filter((t) => t !== tag),
                  }));
                }}
              />
              <label
                htmlFor={`tag-${tag}`}
                className="text-sm font-medium leading-none cursor-pointer"
              >
                {tag}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Images */}
      {onFileUpload && (
        <div className="space-y-2">
          <Label htmlFor="image">Product Images</Label>
          <Input
            id="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileChange}
            className={`cursor-pointer ${errors.image ? "border-red-300" : ""}`}
          />
          <p className="text-sm text-muted-foreground">
            Upload product images (optional) — Max 5MB each, JPEG/PNG/WebP/GIF
          </p>
          <ErrorMessage error={errors.image} />
        </div>
      )}

      {imagePreviews.length > 0 && (
        <div className="space-y-2">
          <Label>Image Previews</Label>
          <div className="flex items-center gap-2 flex-wrap">
            {imagePreviews.map((preview, index) => (
              <div
                key={index}
                className="relative w-24 h-24 border border-gray-200 rounded-lg overflow-hidden"
              >
                <img
                  src={preview}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {selectedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFiles((prev) =>
                        prev.filter((_, i) => i !== index),
                      );
                      setImagePreviews((prev) =>
                        prev.filter((_, i) => i !== index),
                      );
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buffer info */}
      <div className="p-3 rounded-md bg-blue-50 border border-blue-200 flex items-start gap-2 text-blue-700 text-sm">
        <HugeiconsIcon icon={Info} className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Products will stop displaying{" "}
          <strong>
            {bufferDays} day{bufferDays !== 1 ? "s" : ""}
          </strong>{" "}
          before expiry. This buffer is configurable in Platform Settings.
        </span>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting && <HugeiconsIcon icon={Loader2} className="w-4 h-4 mr-2 animate-spin" />}
          {isEditMode ? "Update" : "Create"} Clearance Product
        </Button>
      </div>
    </div>
  );
}
