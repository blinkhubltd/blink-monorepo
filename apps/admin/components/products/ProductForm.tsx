"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon as AlertCircle,
  FlameIcon as Flame,
  StarIcon as Star,
  TagIcon as Tag,
} from "@hugeicons/core-free-icons";
import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Textarea } from "@repo/ui/components/ui/textarea";
import {
  SearchableSelect,
  SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { CascadingSelect } from "@/components/ui/cascading-select";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { useCascadingCategories } from "@/lib/hooks/useCascadingCategories";
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

interface CategoryHierarchy {
  _id: string;
  name: string;
  parent_category_id?: string;
}

interface ProductFormProps {
  categories: Category[];
  vendors: Vendor[];
  onSubmit: (values: any) => Promise<void>;
  onCancel?: () => void;
  initialValues?: Partial<FormData> & {
    images?: (string | null)[];
    requires_prescription?: boolean;
  };
  isEditMode?: boolean;
  productId?: string;
  rootCategories?: { value: string; label: string }[];
  loadChildCategories?: (
    parentId: string,
  ) => Promise<{ value: string; label: string }[]>;
  getCategoryHierarchy?: (categoryId: string) => Promise<CategoryHierarchy[]>;
  onFileUpload?: (files: File[]) => Promise<string[]>;
}

interface ValidationErrors {
  name?: string;
  slug?: string;
  sku?: string;
  brand?: string;
  category_id?: string;
  vendor_id?: string;
  price?: string;
  quantity?: string;
  unit_value?: string;
  unit_type?: string;
  description?: string;
  image?: string;
  status?: string;
  tags?: string;
  upc?: string;
  external_id?: string;
  item_number?: string;
  requires_prescription?: string;
  form?: string;
}

interface FormData {
  name: string;
  slug: string;
  sku: string;
  brand?: string;
  category_id: string;
  vendor_id: string;
  price: string;
  quantity: string;
  unit_value?: string;
  unit_type?: string;
  description: string;
  status: "Active" | "Inactive" | "Archived";
  tags: string[];
  upc?: string;
  external_id?: string;
  item_number?: string;
  requires_prescription?: boolean;
}

export function ProductForm({
  categories,
  vendors,
  onSubmit,
  onCancel,
  initialValues,
  isEditMode = false,
  productId,
  rootCategories,
  loadChildCategories,
  getCategoryHierarchy,
  onFileUpload,
}: ProductFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPrescriptionField, setShowPrescriptionField] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: initialValues?.name || "",
    slug: initialValues?.slug || "",
    sku: initialValues?.sku || "",
    brand: initialValues?.brand || "",
    category_id: initialValues?.category_id || "",
    vendor_id: initialValues?.vendor_id || "",
    price: initialValues?.price || "",
    quantity: initialValues?.quantity || "",
    unit_value: initialValues?.unit_value || "",
    unit_type: initialValues?.unit_type || "",
    description: initialValues?.description || "",
    status: initialValues?.status || "Active",
    tags: initialValues?.tags || [],
    upc: initialValues?.upc || "",
    external_id: initialValues?.external_id || "",
    item_number: initialValues?.item_number || "",
    requires_prescription: initialValues?.requires_prescription || false,
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const {
    rootCategories: hookRootCategories,
    loadChildCategories: hookLoadChildCategories,
    allCategories,
  } = useCascadingCategories();

  // Check if the first selected category in the cascade is pharmaceuticals
  const checkIfPharmaceuticals = (
    categoryId: string,
    categoryPath?: string[],
  ) => {
    if (!categoryId) {
      setShowPrescriptionField(false);
      return;
    }

    // If we have a category path from CascadingSelect, check the first (root) category
    if (categoryPath && categoryPath.length > 0) {
      const firstCategoryId = categoryPath[0];
      const rootCategory = allCategories.find(
        (cat: any) => cat._id === firstCategoryId,
      );
      const isPharmaceuticals =
        rootCategory?.name?.toLowerCase() === "pharmaceuticals";
      setShowPrescriptionField(isPharmaceuticals);

      if (!isPharmaceuticals) {
        setFormData((prev) => ({ ...prev, requires_prescription: false }));
      }
      return;
    }

    // Fallback: find the root category by traversing up the hierarchy
    const findRootCategory = (catId: string): Category | null => {
      const category = allCategories.find((cat: any) => cat._id === catId);
      if (!category) return null;

      // If no parent, this is the root
      if (!category.parent_category_id) {
        return category;
      }

      // Traverse up to find root
      return findRootCategory(category.parent_category_id);
    };

    const rootCategory = findRootCategory(categoryId);
    const isPharmaceuticals =
      rootCategory?.name?.toLowerCase() === "pharmaceuticals";
    setShowPrescriptionField(isPharmaceuticals);

    if (!isPharmaceuticals) {
      setFormData((prev) => ({ ...prev, requires_prescription: false }));
    }
  };

  const getCurrentCategoryName = () => {
    if (!isEditMode || !formData.category_id) return null;
    const category = allCategories.find(
      (cat: any) => cat._id === formData.category_id,
    );
    return category?.name || null;
  };

  const getCurrentVendorName = () => {
    if (!isEditMode || !formData.vendor_id) return null;
    const vendor = vendors.find((v) => v._id === formData.vendor_id);
    return vendor?.name || null;
  };

  // Check category on mount and when category changes
  useEffect(() => {
    if (formData.category_id) {
      checkIfPharmaceuticals(formData.category_id);
    }
  }, [formData.category_id]);

  // Check initial category on mount in edit mode
  useEffect(() => {
    if (isEditMode && initialValues?.category_id) {
      checkIfPharmaceuticals(initialValues.category_id);
    }
  }, [isEditMode, initialValues?.category_id]);

  const availableTags = [
    {
      name: "Hot",
      icon: Flame,
      color: "bg-red-50 border-red-200 text-red-700",
      selectedColor: "bg-red-100 border-red-300",
    },
    {
      name: "Featured",
      icon: Star,
      color: "bg-yellow-50 border-yellow-200 text-yellow-700",
      selectedColor: "bg-yellow-100 border-yellow-300",
    },
    {
      name: "Offer",
      icon: Tag,
      color: "bg-green-50 border-green-200 text-green-700",
      selectedColor: "bg-green-100 border-green-300",
    },
  ];

  // Validation functions
  const validateField = (
    field: keyof FormData,
    value: string | string[] | boolean,
  ) => {
    const fieldErrors: ValidationErrors = {};

    switch (field) {
      case "name":
        if (
          !value ||
          (typeof value === "string" && value.trim().length === 0)
        ) {
          fieldErrors.name = "Product name is required";
        } else if (typeof value === "string" && value.trim().length < 2) {
          fieldErrors.name = "Product name must be at least 2 characters";
        } else if (typeof value === "string" && value.trim().length > 100) {
          fieldErrors.name = "Product name must be less than 100 characters";
        }
        break;

      case "slug":
        if (
          !value ||
          (typeof value === "string" && value.trim().length === 0)
        ) {
          fieldErrors.slug = "Product slug is required";
        } else if (typeof value === "string" && !/^[a-z0-9-]+$/.test(value)) {
          fieldErrors.slug =
            "Slug can only contain lowercase letters, numbers, and hyphens";
        }
        break;

      case "sku":
        if (
          !value ||
          (typeof value === "string" && value.trim().length === 0)
        ) {
          fieldErrors.sku = "SKU is required";
        } else if (typeof value === "string" && value.trim().length < 3) {
          fieldErrors.sku = "SKU must be at least 3 characters";
        } else if (typeof value === "string" && value.trim().length > 50) {
          fieldErrors.sku = "SKU must be less than 50 characters";
        }
        break;

      case "brand":
        if (typeof value === "string" && value.trim().length > 100) {
          fieldErrors.brand = "Brand name must be less than 100 characters";
        }
        break;

      case "category_id":
        if (
          !value ||
          (typeof value === "string" && value.trim().length === 0)
        ) {
          fieldErrors.category_id = "Please select a category";
        }
        break;

      case "vendor_id":
        if (
          !value ||
          (typeof value === "string" && value.trim().length === 0)
        ) {
          fieldErrors.vendor_id = "Please select a vendor";
        }
        break;

      case "price":
        if (
          !value ||
          (typeof value === "string" && value.trim().length === 0)
        ) {
          fieldErrors.price = "Price is required";
        } else if (typeof value === "string") {
          const numValue = Number.parseFloat(value);
          if (Number.isNaN(numValue)) {
            fieldErrors.price = "Price must be a valid number";
          } else if (numValue < 0) {
            fieldErrors.price = "Price cannot be negative";
          } else if (numValue > 999999.99) {
            fieldErrors.price = "Price cannot exceed 999,999.99";
          }
        }
        break;

      case "quantity":
        if (
          !value ||
          (typeof value === "string" && value.trim().length === 0)
        ) {
          fieldErrors.quantity = "Quantity is required";
        } else if (typeof value === "string") {
          const numValue = Number.parseInt(value);
          if (Number.isNaN(numValue)) {
            fieldErrors.quantity = "Quantity must be a valid number";
          } else if (numValue < 0) {
            fieldErrors.quantity = "Quantity cannot be negative";
          } else if (numValue > 999999) {
            fieldErrors.quantity = "Quantity cannot exceed 999,999";
          }
        }
        break;

      case "unit_value":
        if (typeof value === "string" && value.trim() !== "") {
          const numValue = Number.parseFloat(value);
          if (Number.isNaN(numValue)) {
            fieldErrors.unit_value = "Unit value must be a valid number";
          } else if (numValue <= 0) {
            fieldErrors.unit_value = "Unit value must be greater than 0";
          } else if (numValue > 999999.99) {
            fieldErrors.unit_value = "Unit value cannot exceed 999,999.99";
          }
        }
        break;

      case "unit_type":
        if (typeof value === "string" && value.length > 20) {
          fieldErrors.unit_type = "Unit type must be less than 20 characters";
        }
        break;

      case "description":
        if (typeof value === "string" && value.length > 1000) {
          fieldErrors.description =
            "Description must be less than 1000 characters";
        }
        break;

      case "upc":
        if (typeof value === "string" && value.trim() !== "") {
          const numValue = Number.parseInt(value);
          if (Number.isNaN(numValue)) {
            fieldErrors.upc = "UPC must be a valid number";
          } else if (numValue < 0) {
            fieldErrors.upc = "UPC cannot be negative";
          }
        }
        break;

      case "external_id":
        if (typeof value === "string" && value.length > 100) {
          fieldErrors.external_id =
            "External ID must be less than 100 characters";
        }
        break;
    }

    return fieldErrors;
  };

  const validateForm = (): ValidationErrors => {
    const formErrors: ValidationErrors = {};

    Object.keys(formData).forEach((key) => {
      const field = key as keyof FormData;
      const value = formData[field];
      if (value !== undefined && typeof value !== "boolean") {
        const fieldErrors = validateField(field, value);
        Object.assign(formErrors, fieldErrors);
      }
    });

    if (selectedFiles.length > 0) {
      const maxSize = 5 * 1024 * 1024; // 5MB
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];

      for (const file of selectedFiles) {
        if (file.size > maxSize) {
          formErrors.image = "All images must be less than 5MB";
          break;
        } else if (!allowedTypes.includes(file.type)) {
          formErrors.image =
            "All images must be JPEG, PNG, WebP, or GIF format";
          break;
        }
      }
    }

    return formErrors;
  };

  const handleBlur = (field: keyof FormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }));

    const value = formData[field];
    if (value !== undefined) {
      const fieldErrors = validateField(field, value);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));

      if (!fieldErrors[field]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      const allFields = Object.keys(formData).reduce(
        (acc, key) => {
          acc[key] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      );
      setTouched(allFields);

      const formErrors = validateForm();

      if (Object.keys(formErrors).length > 0) {
        setErrors(formErrors);
        setIsSubmitting(false);
        return;
      }

      let images: string[] = [];

      if (selectedFiles.length > 0 && onFileUpload) {
        try {
          images = await onFileUpload(selectedFiles);
        } catch (uploadError) {
          setErrors({ image: "Failed to upload images. Please try again." });
          setIsSubmitting(false);
          return;
        }
      }

      const submitData = {
        ...formData,
        brand: formData.brand?.trim() || undefined,
        price: Number.parseFloat(formData.price),
        quantity: Number.parseInt(formData.quantity),
        unit_value:
          formData.unit_value && formData.unit_value.trim()
            ? Number.parseFloat(formData.unit_value)
            : undefined,
        unit_type:
          formData.unit_type && formData.unit_type.trim()
            ? formData.unit_type
            : undefined,
        upc: formData.upc ? Number.parseInt(formData.upc) : undefined,
        item_number: formData.item_number?.trim() || undefined,
        images: images.length > 0 ? images : undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        requires_prescription: showPrescriptionField
          ? formData.requires_prescription
          : undefined,
        ...(isEditMode && productId && { id: productId }),
      };

      await onSubmit(submitData);

      toast.success(
        isEditMode
          ? "Product updated successfully"
          : "Product created successfully",
      );

      if (!isEditMode) {
        // Reset form on success (only for create mode)
        setFormData({
          name: "",
          slug: "",
          sku: "",
          brand: "",
          category_id: "",
          vendor_id: "",
          price: "",
          quantity: "",
          unit_value: "",
          unit_type: "",
          description: "",
          status: "Active",
          tags: [],
          upc: "",
          external_id: "",
          item_number: "",
          requires_prescription: false,
        });
        setShowPrescriptionField(false);
        setSelectedFiles([]);
        setImagePreviews([]);
        setErrors({});
        setTouched({});
      }

      onCancel?.();
    } catch (error) {
      console.error(
        `Error ${isEditMode ? "updating" : "creating"} product:`,
        error,
      );
      const errorMessage = getConvexErrorMessage(
        error,
        isEditMode
          ? "Failed to update product. Please try again."
          : "Failed to create product. Please try again.",
      );
      setErrors({ form: errorMessage });
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Auto-generate slug from name
    if (field === "name") {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      setFormData((prev) => ({ ...prev, slug }));
    }

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }

    // Real-time validation for touched fields
    if (touched[field]) {
      const fieldErrors = validateField(field, value);
      if (fieldErrors[field]) {
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
      }
    }
  };

  const toggleTag = (tagName: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagName)
        ? prev.tags.filter((tag) => tag !== tagName)
        : [...prev.tags, tagName],
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    // Clear previous errors
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.image;
      return newErrors;
    });

    if (files.length > 0) {
      const maxSize = 5 * 1024 * 1024;
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];

      // Validate all files
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
            image: "All images must be JPEG, PNG, WebP, or GIF format",
          }));
          return;
        }
      }

      setSelectedFiles(files);

      // Generate previews for all files
      const previewPromises = files.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve(e.target?.result as string);
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(previewPromises).then((previews) => {
        setImagePreviews(previews);
      });
    } else {
      setSelectedFiles([]);
      setImagePreviews([]);
    }
  };

  const ErrorMessage: React.FC<{ error?: string }> = ({ error }) => {
    if (!error) return null;

    return (
      <div className="flex items-center gap-1 text-sm text-red-600 mt-1">
        <HugeiconsIcon icon={AlertCircle} size={14} />
        <span>{error}</span>
      </div>
    );
  };

  const getInputClasses = (field: keyof FormData) => {
    const baseClasses = "transition-colors";
    const hasError = errors[field] && touched[field];

    if (hasError) {
      return `${baseClasses} border-red-300 focus:border-red-500 focus:ring-red-200`;
    }

    return baseClasses;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <HugeiconsIcon icon={AlertCircle} size={16} />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-red-600 text-sm mt-1">{errors.form}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
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
                Upload product images (optional) - Max 5MB each,
                JPEG/PNG/WebP/GIF
              </p>
              <ErrorMessage error={errors.image} />
            </div>
          )}

          {imagePreviews.length > 0 && (
            <div className="space-y-2">
              <Label>Image Previews</Label>
              <div className="flex items-center justify-center gap-2">
                {imagePreviews.map((preview, index) => (
                  <div
                    key={index}
                    className="relative w-32 h-32 border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <img
                      src={preview}
                      alt={`Product preview ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newFiles = selectedFiles.filter(
                          (_, i) => i !== index,
                        );
                        const newPreviews = imagePreviews.filter(
                          (_, i) => i !== index,
                        );
                        setSelectedFiles(newFiles);
                        setImagePreviews(newPreviews);
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">
            Product Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            onBlur={() => handleBlur("name")}
            placeholder="Enter product name"
            className={getInputClasses("name")}
            maxLength={100}
            required
          />
          <ErrorMessage error={touched.name ? errors.name : undefined} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">
            Product Slug <span className="text-red-500">*</span>
          </Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => handleInputChange("slug", e.target.value)}
            onBlur={() => handleBlur("slug")}
            placeholder="product-slug (auto-generated)"
            className={getInputClasses("slug")}
            required
          />
          <p className="text-sm text-muted-foreground">
            Auto-generated from product name.
          </p>
          <ErrorMessage error={touched.slug ? errors.slug : undefined} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sku">
            SKU <span className="text-red-500">*</span>
          </Label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => handleInputChange("sku", e.target.value)}
            onBlur={() => handleBlur("sku")}
            placeholder="Enter SKU"
            className={getInputClasses("sku")}
            maxLength={50}
            required
          />
          <ErrorMessage error={touched.sku ? errors.sku : undefined} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            value={formData.brand || ""}
            onChange={(e) => handleInputChange("brand", e.target.value)}
            onBlur={() => handleBlur("brand")}
            placeholder="Enter product brand"
            className={getInputClasses("brand")}
            maxLength={100}
          />
          <p className="text-sm text-muted-foreground">
            Optional brand information for the product.
          </p>
          <ErrorMessage error={touched.brand ? errors.brand : undefined} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">
            Price <span className="text-red-500">*</span>
          </Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            min="0"
            max="999999.99"
            value={formData.price}
            onChange={(e) => handleInputChange("price", e.target.value)}
            onBlur={() => handleBlur("price")}
            placeholder="0.00"
            className={getInputClasses("price")}
            required
          />
          <ErrorMessage error={touched.price ? errors.price : undefined} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity">
            Quantity <span className="text-red-500">*</span>
          </Label>
          <Input
            id="quantity"
            type="number"
            step="1"
            min="0"
            max="999999"
            value={formData.quantity}
            onChange={(e) => handleInputChange("quantity", e.target.value)}
            onBlur={() => handleBlur("quantity")}
            placeholder="0"
            className={getInputClasses("quantity")}
            required
          />
          <ErrorMessage
            error={touched.quantity ? errors.quantity : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="unit_value">Unit Value</Label>
          <Input
            id="unit_value"
            type="number"
            step="0.01"
            min="0"
            max="999999.99"
            value={formData.unit_value || ""}
            onChange={(e) => handleInputChange("unit_value", e.target.value)}
            onBlur={() => handleBlur("unit_value")}
            placeholder="e.g., 500"
            className={getInputClasses("unit_value")}
          />
          <p className="text-sm text-muted-foreground">
            Optional: Numeric value for the unit (e.g., 500 for 500ml)
          </p>
          <ErrorMessage
            error={touched.unit_value ? errors.unit_value : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit_type">Unit Type</Label>
          <Select
            value={formData.unit_type || "none"}
            onValueChange={(value) => {
              const actualValue = value === "none" ? "" : value;
              handleInputChange("unit_type", actualValue);
              setTouched((prev) => ({ ...prev, unit_type: true }));
            }}
          >
            <SelectTrigger className={getInputClasses("unit_type")}>
              <SelectValue placeholder="Select unit type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No unit</SelectItem>
              <SelectItem value="ml">Milliliters (ml)</SelectItem>
              <SelectItem value="l">Liters (l)</SelectItem>
              <SelectItem value="g">Grams (g)</SelectItem>
              <SelectItem value="kg">Kilograms (kg)</SelectItem>
              <SelectItem value="oz">Ounces (oz)</SelectItem>
              <SelectItem value="lb">Pounds (lb)</SelectItem>
              <SelectItem value="piece">Piece</SelectItem>
              <SelectItem value="pack">Pack</SelectItem>
              <SelectItem value="box">Box</SelectItem>
              <SelectItem value="bottle">Bottle</SelectItem>
              <SelectItem value="can">Can</SelectItem>
              <SelectItem value="bag">Bag</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Optional: Unit of measurement (e.g., ml, g, kg, piece)
          </p>
          <ErrorMessage
            error={touched.unit_type ? errors.unit_type : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {isEditMode && getCurrentCategoryName() && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-md border">
              <span className="font-medium">Current Category: </span>
              <span className="text-foreground">
                {getCurrentCategoryName()}
              </span>
            </div>
          )}
          <CascadingSelect
            options={rootCategories || hookRootCategories}
            value={formData.category_id}
            onValueChange={(value, path) => {
              handleInputChange("category_id", value);
              setTouched((prev) => ({ ...prev, category_id: true }));
              // Check if pharmaceuticals with the full category path
              // Convert CascadingOption[] to string[] if path exists
              const pathValues = path
                ? path.map((option) => option.value)
                : undefined;
              checkIfPharmaceuticals(value, pathValues);
            }}
            loadChildren={loadChildCategories || hookLoadChildCategories}
            placeholder="Select category"
            className={
              touched.category_id && errors.category_id ? "border-red-300" : ""
            }
          />
          <ErrorMessage
            error={touched.category_id ? errors.category_id : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="vendor">
            Vendor <span className="text-red-500">*</span>
          </Label>
          {isEditMode && getCurrentVendorName() && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded-md border">
              <span className="font-medium">Current Vendor: </span>
              <span className="text-foreground">{getCurrentVendorName()}</span>
            </div>
          )}
          <SearchableSelect
            options={vendors.map((vendor) => ({
              value: vendor._id,
              label: vendor.name,
            }))}
            value={formData.vendor_id}
            onValueChange={(value) => {
              handleInputChange("vendor_id", value);
              setTouched((prev) => ({ ...prev, vendor_id: true }));
            }}
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

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select
          value={formData.status}
          onValueChange={(value: "Active" | "Inactive" | "Archived") =>
            handleInputChange("status", value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
            <SelectItem value="Archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          onBlur={() => handleBlur("description")}
          placeholder="Enter product description (optional)"
          rows={3}
          className={getInputClasses("description")}
          maxLength={1000}
        />
        <div className="flex justify-between text-sm text-muted-foreground">
          <ErrorMessage
            error={touched.description ? errors.description : undefined}
          />
          <span>{formData.description.length}/1000</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="upc">UPC</Label>
          <Input
            id="upc"
            type="number"
            value={formData.upc || ""}
            onChange={(e) => handleInputChange("upc", e.target.value)}
            onBlur={() => handleBlur("upc")}
            placeholder="Enter UPC (optional)"
            className={getInputClasses("upc")}
          />
          <ErrorMessage error={touched.upc ? errors.upc : undefined} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="external_id">External ID</Label>
          <Input
            id="external_id"
            value={formData.external_id || ""}
            onChange={(e) => handleInputChange("external_id", e.target.value)}
            onBlur={() => handleBlur("external_id")}
            placeholder="Enter external ID (optional)"
            className={getInputClasses("external_id")}
          />
          <ErrorMessage
            error={touched.external_id ? errors.external_id : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="item_number">Item Number</Label>
          <Input
            id="item_number"
            value={formData.item_number || ""}
            onChange={(e) => handleInputChange("item_number", e.target.value)}
            onBlur={() => handleBlur("item_number")}
            placeholder="Enter item number (optional)"
            className={getInputClasses("item_number")}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Product Tags</Label>
        <div className="flex flex-wrap gap-3">
          {availableTags.map((tag) => {
            const Icon = tag.icon;
            const isSelected = formData.tags.includes(tag.name);

            return (
              <button
                key={tag.name}
                type="button"
                onClick={() => toggleTag(tag.name)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all duration-200 hover:scale-105
                  ${isSelected ? tag.selectedColor : tag.color}
                  ${isSelected ? "shadow-md" : "hover:shadow-sm"}
                `}
              >
                <HugeiconsIcon icon={Icon} size={16} aria-hidden="true" />
                <span className="font-medium">{tag.name}</span>
                {isSelected && (
                  <div className="w-2 h-2 rounded-full bg-current opacity-60" />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          Select multiple tags to highlight special features of your product
        </p>
      </div>

      {showPrescriptionField && (
        <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={AlertCircle} size={16} className="text-blue-600" />
            <Label className="text-blue-900 font-medium">
              Pharmaceutical Product
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="requires_prescription"
              checked={formData.requires_prescription}
              onCheckedChange={(checked) => {
                setFormData((prev) => ({
                  ...prev,
                  requires_prescription: checked as boolean,
                }));
                setTouched((prev) => ({
                  ...prev,
                  requires_prescription: true,
                }));
              }}
              className="border-blue-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
            <Label
              htmlFor="requires_prescription"
              className="text-sm font-medium text-blue-900 cursor-pointer"
            >
              This product requires a prescription
            </Label>
          </div>
          <p className="text-xs text-blue-700">
            Check this box if customers need a valid prescription to purchase
            this pharmaceutical product.
          </p>
          <ErrorMessage
            error={
              touched.requires_prescription
                ? errors.requires_prescription
                : undefined
            }
          />
        </div>
      )}

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting || Object.keys(errors).length > 0}
          className="bg-gray-900 text-yellow-400 hover:bg-gray-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Creating..." : "Create Product"}
        </Button>
      </div>
    </form>
  );
}
