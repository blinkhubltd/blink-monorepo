"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon as Calendar,
  Cancel01Icon as X,
  Clock01Icon as Clock,
  ImageIcon,
} from "@hugeicons/core-free-icons";
import { useState, useEffect } from "react";
import type React from "react";
import type { Id } from "@repo/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { getConvexErrorMessage } from "@/lib/utils";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  CascadingSelect,
  type CascadingOption,
} from "@/components/ui/cascading-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { toast } from "sonner";
import BannersDialogue from "./BannersDialogue";
import type { Banner, BannerFormValues } from "./types";

export function BannersForm({
  onSubmit,
  onCancel,
  initialBanner,
  mode = "create",
}: {
  onSubmit: (values: BannerFormValues) => Promise<void>;
  onCancel?: () => void;
  initialBanner?: Banner;
  mode?: "create" | "edit";
}) {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentImageId, setCurrentImageId] = useState<Id<"_storage"> | null>(
    null,
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<
    Id<"categories"> | undefined
  >();

  const [promoType, setPromoType] = useState<
    "product" | "brand" | "blink" | undefined
  >();
  const [selectedProductId, setSelectedProductId] = useState<
    Id<"products"> | undefined
  >();
  const [selectedVendorId, setSelectedVendorId] = useState<
    Id<"vendors"> | undefined
  >();
  const [selectedBrand, setSelectedBrand] = useState<string | undefined>();
  const [selectedOverlayPos, setSelectedOverlayPos] = useState<
    "top-left" | "top-right" | "bottom-left"
  >("bottom-left");

  const [formData, setFormData] = useState({
    header: "",
    sub_header: "",
    cta_text: "",
    status: "active" as "active" | "inactive",
  });

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  // Dialog states
  const [showRemoveImageDialog, setShowRemoveImageDialog] = useState(false);
  const [showPromoTypeChangeDialog, setShowPromoTypeChangeDialog] =
    useState(false);
  const [pendingPromoType, setPendingPromoType] = useState<
    "product" | "brand" | "blink" | undefined
  >();

  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const categories = useQuery(api.data.categories.getAllCategories);
  const products = useQuery(api.data.products.getAllProducts);
  const vendors = useQuery(api.data.vendors.getAllVendors);

  // Convert categories to options (first level only)
  const getCategoryOptions = (): CascadingOption[] => {
    if (!categories) return [];

    const topLevelCategories = categories.filter(
      (cat: any) => !cat.parent_category_id,
    );

    return topLevelCategories.map((category: any) => ({
      value: category._id,
      label: category.name,
      children: undefined,
    }));
  };

  useEffect(() => {
    if (mode === "edit" && initialBanner) {
      setFormData({
        header: initialBanner.header || "",
        sub_header: initialBanner.sub_header || "",
        cta_text: initialBanner.cta_text || "",
        status: initialBanner.status,
      });
      setStartDate(new Date(initialBanner.start_date));
      setEndDate(new Date(initialBanner.end_date));
      setCurrentImageId(initialBanner.image);
      setSelectedCategoryId(initialBanner.categoryId);
      setPromoType(initialBanner.promo_type);
      setSelectedProductId(initialBanner.product_id);
      setSelectedBrand(initialBanner.brand);
    } else {
      const now = new Date();
      const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      setStartDate(now);
      setEndDate(oneWeekLater);
    }
  }, [mode, initialBanner]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);

    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleRemoveImage = () => {
    if (mode === "edit" && currentImageId && !selectedFile) {
      setShowRemoveImageDialog(true);
    } else {
      confirmRemoveImage();
    }
  };

  const confirmRemoveImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setCurrentImageId(null);
    // Reset the file input
    const fileInput = document.getElementById("image") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const validateForm = () => {
    if (!selectedFile && !currentImageId) {
      toast.error("Banner image is required");
      return false;
    }

    if (!startDate) {
      toast.error("Start date is required");
      return false;
    }

    if (!endDate) {
      toast.error("End date is required");
      return false;
    }

    const startDateTime = startDate.getTime();
    const endDateTime = endDate.getTime();
    const now = Date.now();

    if (endDateTime <= startDateTime) {
      toast.error("End date must be after start date");
      return false;
    }

    if (mode === "create" && startDateTime < now - 60000) {
      // Allow 1 minute buffer
      toast.error("Start date cannot be in the past");
      return false;
    }

    // Validate promo type selection
    if (promoType === "product" && !selectedProductId) {
      toast.error("Please select a product for the product promotion");
      return false;
    }

    if (promoType === "brand" && !selectedBrand) {
      toast.error("Please enter a brand name for the brand promotion");
      return false;
    }

    if (
      promoType === "brand" &&
      selectedBrand &&
      selectedBrand.trim().length < 2
    ) {
      toast.error("Brand name must be at least 2 characters long");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      let image: Id<"_storage">;

      if (selectedFile) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });

        if (!uploadResult.ok) {
          throw new Error("Banner image upload failed");
        }

        const { storageId } = await uploadResult.json();
        image = storageId as Id<"_storage">;
      } else if (currentImageId && mode === "edit") {
        image = currentImageId;
      } else {
        throw new Error("No image provided");
      }

      const values: BannerFormValues = {
        image,
        header: formData.header.trim() || undefined,
        sub_header: formData.sub_header.trim() || undefined,
        cta_text: formData.cta_text.trim() || undefined,
        promo_type: promoType,
        product_id: promoType === "product" ? selectedProductId : undefined,
        brand: promoType === "brand" ? selectedBrand?.trim() : undefined,
        categoryId: selectedCategoryId,
        status: formData.status,
        start_date: startDate!.getTime(),
        end_date: endDate!.getTime(),
      };

      await onSubmit(values);

      // Reset form only in create mode
      if (mode === "create") {
        const now = new Date();
        const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        setFormData({
          header: "",
          sub_header: "",
          cta_text: "",
          status: "active",
        });
        setSelectedCategoryId(undefined);
        setPromoType(undefined);
        setSelectedProductId(undefined);
        setSelectedVendorId(undefined);
        setSelectedBrand(undefined);
        setStartDate(now);
        setEndDate(oneWeekLater);
        setSelectedFile(null);
        setImagePreview(null);
        setCurrentImageId(null);

        // Reset the file input
        const fileInput = document.getElementById("image") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      }
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to save banner"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-6">
        {/* Image Upload */}
        <div className="space-y-3">
          <Label htmlFor="image" className="text-base font-medium">
            Banner Image <span className="text-destructive">*</span>
          </Label>
          <div className="space-y-3">
            <Input
              id="image"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              Upload banner image (required). Supported formats: JPG, PNG, GIF.
              Max size: 5MB
            </p>
          </div>
        </div>

        {/* Image Preview */}
        {(imagePreview || currentImageId) && (
          <div className="space-y-3">
            <Label>Image Preview</Label>
            <div className="relative w-full max-w-md h-48 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Banner preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <span className="text-gray-500">Current Image</span>
                </div>
              )}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2 h-6 w-6 p-0"
                onClick={handleRemoveImage}
                title="Remove image"
              >
                <HugeiconsIcon icon={X} className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Category Selection */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Category</Label>
          <div className="space-y-2">
            <CascadingSelect
              options={getCategoryOptions()}
              value={selectedCategoryId}
              onValueChange={(value) => {
                setSelectedCategoryId(value as Id<"categories">);
              }}
              placeholder="Select category (leave empty for general banner)"
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              Select a first-level category to display this banner in a specific
              category screen, or leave empty to display on the home screen as a
              general banner.
            </p>
          </div>
        </div>

        {/* Banner Content */}
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="header" className="text-base font-medium">
              Header
            </Label>
            <Input
              id="header"
              type="text"
              placeholder="Enter banner header text (optional)"
              value={formData.header}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, header: e.target.value }))
              }
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Main heading text for the banner (optional, max 100 characters)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub_header" className="text-base font-medium">
              Sub-header
            </Label>
            <Textarea
              id="sub_header"
              placeholder="Enter banner sub-header text (optional)"
              value={formData.sub_header}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  sub_header: e.target.value,
                }))
              }
              maxLength={200}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Supporting text for the banner (optional, max 200 characters)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cta_text" className="text-base font-medium">
              CTA Button Text
            </Label>
            <Input
              id="cta_text"
              type="text"
              placeholder="e.g., Shop Now, Learn More, Get Started (optional)"
              value={formData.cta_text}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, cta_text: e.target.value }))
              }
              maxLength={30}
            />
            <p className="text-xs text-muted-foreground">
              Text for the call-to-action button (optional, max 30 characters)
            </p>
          </div>

          {/* Promo Type Selection */}
          <div className="space-y-2">
            <Label className="text-base font-medium">Promotion Type</Label>
            <Select
              value={promoType || "none"}
              onValueChange={(value: "product" | "brand" | "none") => {
                if (value === "none") {
                  setPromoType(undefined);
                  setSelectedProductId(undefined);
                  setSelectedBrand(undefined);
                } else if (promoType && promoType !== value) {
                  // Show confirmation dialog when switching between product and brand
                  setPendingPromoType(value);
                  setShowPromoTypeChangeDialog(true);
                } else {
                  setPromoType(value);
                  // Clear the other selections when switching types
                  if (value === "product") {
                    setSelectedBrand(undefined);
                  } else if (value === "brand") {
                    setSelectedProductId(undefined);
                  }
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select promotion type (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No promotion</SelectItem>
                <SelectItem value="product">Product promotion</SelectItem>
                <SelectItem value="brand">Brand promotion</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose what this banner promotes, or leave as "No promotion" for
              general banners
            </p>
          </div>

          {/* Product Selection */}
          {promoType === "product" && (
            <div className="space-y-2">
              <Label className="text-base font-medium">
                Select Product <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedProductId || ""}
                onValueChange={(value) =>
                  setSelectedProductId(value as Id<"products">)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a product to promote" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product: any) => (
                    <SelectItem key={product._id} value={product._id}>
                      {product.name}
                      {product.brand ? ` - ${product.brand}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select the specific product this banner will promote
              </p>
            </div>
          )}

          {/* Brand Input */}
          {promoType === "brand" && (
            <div className="space-y-2">
              <Label htmlFor="brand" className="text-base font-medium">
                Brand Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="brand"
                type="text"
                value={selectedBrand || ""}
                onChange={(e) => setSelectedBrand(e.target.value)}
                placeholder="Enter brand name to promote"
                className="w-full"
                maxLength={100}
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the brand name this banner will promote
              </p>
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className="space-y-4">
          <Label className="text-base font-medium flex items-center gap-2">
            <HugeiconsIcon icon={Calendar} className="h-4 w-4" />
            Banner Schedule
          </Label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateTimePicker
              label="Start Date & Time"
              value={startDate}
              onChange={setStartDate}
              placeholder="Select start date and time"
              required
              minDate={new Date()}
              className="w-full"
            />

            <DateTimePicker
              label="End Date & Time"
              value={endDate}
              onChange={setEndDate}
              placeholder="Select end date and time"
              required
              minDate={startDate || new Date()}
              className="w-full"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <HugeiconsIcon icon={Clock} className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Banner Display Schedule</p>
                <p className="mt-1">
                  The banner will be visible to mobile app users only during the
                  specified time period. Make sure to set appropriate start and
                  end times for your campaign.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Label htmlFor="status" className="text-base font-medium">
            Status
          </Label>
          <Select
            value={formData.status}
            onValueChange={(value: "active" | "inactive") =>
              setFormData((prev) => ({ ...prev, status: value }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Only active banners within their schedule will be shown to users
          </p>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading} className="min-w-32">
          {loading
            ? mode === "edit"
              ? "Updating..."
              : "Creating..."
            : mode === "edit"
              ? "Update Banner"
              : "Create Banner"}
        </Button>
      </div>

      {/* Dialog Components */}
      <BannersDialogue
        isOpen={showRemoveImageDialog}
        onClose={() => setShowRemoveImageDialog(false)}
        title="Remove Banner Image"
        description="Are you sure you want to remove this image? You'll need to upload a new image before saving the banner."
        variant="warning"
        primaryAction={{
          label: "Remove Image",
          onClick: confirmRemoveImage,
          variant: "destructive",
        }}
        secondaryAction={{
          label: "Keep Image",
          onClick: () => setShowRemoveImageDialog(false),
        }}
      />

      <BannersDialogue
        isOpen={showPromoTypeChangeDialog}
        onClose={() => {
          setShowPromoTypeChangeDialog(false);
          setPendingPromoType(undefined);
        }}
        title="Change Promotion Type"
        description={`Switching to ${pendingPromoType === "product" ? "Product" : "Brand"} promotion will clear your current ${promoType === "product" ? "product" : "brand"} selection. Do you want to continue?`}
        variant="info"
        primaryAction={{
          label: "Continue",
          onClick: () => {
            setPromoType(pendingPromoType);
            if (pendingPromoType === "product") {
              setSelectedBrand(undefined);
            } else if (pendingPromoType === "brand") {
              setSelectedProductId(undefined);
            }
            setShowPromoTypeChangeDialog(false);
            setPendingPromoType(undefined);
          },
        }}
        secondaryAction={{
          label: "Cancel",
          onClick: () => {
            setShowPromoTypeChangeDialog(false);
            setPendingPromoType(undefined);
          },
        }}
      />
    </form>
  );
}
