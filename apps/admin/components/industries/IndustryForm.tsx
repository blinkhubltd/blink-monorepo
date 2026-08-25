"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon as X,
  ImageIcon,
  Loading03Icon as Loader2,
} from "@hugeicons/core-free-icons";
import { useState, useEffect } from "react";
import type React from "react";
import type { Id } from "@repo/backend/dataModel";
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
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { ProtectedField } from "@/components/shared/ProtectedField";

type Industry = {
  _id: Id<"industry">;
  name: string;
  description?: string;
  status: "Active" | "Inactive";
  image?: string;
  imageUrl?: string | null;
  bank_details?: {
    business_name: string;
    bank_code: string;
    account_number: string;
    kra_pin?: string;
  };
};

type IndustryFormValues = {
  name: string;
  description?: string;
  status: "Active" | "Inactive";
  image?: string;
  bank_details?: {
    business_name: string;
    bank_code: string;
    account_number: string;
    kra_pin?: string;
  };
};

export function IndustryForm({
  onSubmit,
  onCancel,
  initialIndustry,
  mode = "create",
  onFileUpload,
}: {
  onSubmit: (values: IndustryFormValues) => Promise<void>;
  onCancel?: () => void;
  initialIndustry?: Industry;
  mode?: "create" | "edit";
  onFileUpload?: (file: File) => Promise<string>;
}) {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [formData, setFormData] = useState<IndustryFormValues>({
    name: "",
    description: "",
    status: "Active",
    bank_details: {
      business_name: "",
      bank_code: "",
      account_number: "",
      kra_pin: "",
    },
  });
  const [hasInitialBankDetails, setHasInitialBankDetails] = useState({
    bank_code: false,
    account_number: false,
  });

  // Initialize form with initial data if in edit mode
  useEffect(() => {
    if (mode === "edit" && initialIndustry) {
      setFormData({
        name: initialIndustry.name,
        description: initialIndustry.description || "",
        status: initialIndustry.status,
        image: initialIndustry.image,
        bank_details: initialIndustry.bank_details || {
          business_name: "",
          bank_code: "",
          account_number: "",
          kra_pin: "",
        },
      });
      // Track if bank details already exist
      setHasInitialBankDetails({
        bank_code: !!initialIndustry.bank_details?.bank_code,
        account_number: !!initialIndustry.bank_details?.account_number,
      });
      // Show existing image preview
      if (initialIndustry.imageUrl) {
        setImagePreview(initialIndustry.imageUrl);
      }
    }
  }, [mode, initialIndustry]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImageError(null);
    if (!file) {
      setSelectedFile(null);
      setImagePreview(
        mode === "edit" ? (initialIndustry?.imageUrl ?? null) : null,
      );
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (file.size > maxSize) {
      setImageError("Image must be less than 5MB");
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      setImageError("Image must be JPEG, PNG, WebP, or GIF");
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, image: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Industry name is required");
      return;
    }

    setLoading(true);
    try {
      let imageStorageId = formData.image;
      if (selectedFile && onFileUpload) {
        imageStorageId = await onFileUpload(selectedFile);
      }
      await onSubmit({ ...formData, image: imageStorageId });
      toast.success(
        mode === "edit"
          ? "Industry updated successfully"
          : "Industry created successfully",
      );
      if (mode === "create") {
        setFormData({
          name: "",
          description: "",
          status: "Active",
          bank_details: {
            business_name: "",
            bank_code: "",
            account_number: "",
            kra_pin: "",
          },
        });
        setSelectedFile(null);
        setImagePreview(null);
      }
    } catch (error) {
      toast.error(
        getConvexErrorMessage(
          error,
          mode === "edit"
            ? "Failed to update industry"
            : "Failed to create industry",
        ),
      );
      console.error("Error submitting industry:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === "edit" ? "Edit Industry" : "Add New Industry"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">
              Industry Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Pharmacy, Supermarket, Restaurant"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of the industry..."
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              disabled={loading}
              rows={4}
            />
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <Label htmlFor="industry-image">Industry Image</Label>
            {imagePreview ? (
              <div className="relative w-32 h-32 border border-gray-200 rounded-lg overflow-hidden">
                <img
                  src={imagePreview}
                  alt="Industry image"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                  disabled={loading}
                >
                  <HugeiconsIcon icon={X} className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center w-32 h-32 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                <HugeiconsIcon icon={ImageIcon} className="w-8 h-8 text-gray-300" />
              </div>
            )}
            <Input
              id="industry-image"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              disabled={loading || !onFileUpload}
              className="cursor-pointer"
            />
            {!onFileUpload && (
              <p className="text-xs text-muted-foreground">
                Image upload is not available in this context.
              </p>
            )}
            {imageError && <p className="text-sm text-red-500">{imageError}</p>}
            <p className="text-xs text-muted-foreground">
              Max 5MB — JPEG, PNG, WebP, or GIF
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value: "Active" | "Inactive") =>
                setFormData((prev) => ({ ...prev, status: value }))
              }
              disabled={loading}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 border-t pt-6">
            <h3 className="text-lg font-semibold">Bank Details</h3>

            <div className="space-y-2">
              <Label htmlFor="business_name">Business Name</Label>
              <Input
                id="business_name"
                placeholder="Enter registered business name, e.g, Blink Ltd - FMCG"
                value={formData.bank_details?.business_name || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    bank_details: {
                      ...prev.bank_details!,
                      business_name: e.target.value,
                    },
                  }))
                }
                disabled={loading}
              />
            </div>

            <ProtectedField
              id="bank_code"
              label="Bank Code"
              placeholder="Enter bank code (e.g., 01 for KCB)"
              value={formData.bank_details?.bank_code || ""}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  bank_details: {
                    ...prev.bank_details!,
                    bank_code: value,
                  },
                }))
              }
              hasValue={hasInitialBankDetails.bank_code}
              disabled={loading}
            />

            <ProtectedField
              id="account_number"
              label="Account Number"
              placeholder="Enter account number"
              value={formData.bank_details?.account_number || ""}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  bank_details: {
                    ...prev.bank_details!,
                    account_number: value,
                  },
                }))
              }
              hasValue={hasInitialBankDetails.account_number}
              disabled={loading}
            />

            <div className="space-y-2">
              <Label htmlFor="kra_pin">KRA PIN (Optional)</Label>
              <Input
                id="kra_pin"
                placeholder="Enter KRA PIN"
                value={formData.bank_details?.kra_pin || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    bank_details: {
                      ...prev.bank_details!,
                      kra_pin: e.target.value,
                    },
                  }))
                }
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={loading}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading && <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "edit" ? "Update Industry" : "Create Industry"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
