"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon as ChevronRight,
  Cancel01Icon as X,
  ImageIcon,
  Upload01Icon as Upload,
} from "@hugeicons/core-free-icons";
import { useState, useEffect, useMemo } from "react";
import type React from "react";
import type { Id } from "@repo/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { ParentCategoryPicker } from "@/components/categories/CategoryPickers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Category = {
  _id: Id<"categories">;
  name: string;
  slug: string;
  parent_category_id?: Id<"categories">;
  description?: string;
  image?: Id<"_storage">;
  status: "active" | "inactive";
  sort_order: number;
};

type CategoryFormValues = {
  name: string;
  slug: string;
  parent_category_id?: Id<"categories">;
  description: string;
  image?: Id<"_storage">;
  status: "active" | "inactive";
  sort_order: number;
};

export function CategoryForm({
  categories,
  onSubmit,
  onCancel,
  initialCategory,
  mode = "create",
}: {
  categories: Category[];
  onSubmit: (values: CategoryFormValues) => Promise<void>;
  onCancel?: () => void;
  initialCategory?: Category;
  mode?: "create" | "edit";
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<CategoryFormValues>>({
    status: "active",
    sort_order: 1,
  });
  const [categoryName, setCategoryName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentImageId, setCurrentImageId] = useState<Id<"_storage"> | null>(
    null
  );

  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const getImageUrl = useQuery(
    api.data.files.getImageUrl,
    currentImageId ? { storageId: currentImageId } : "skip"
  );

  // Initialize form with initial data if in edit mode
  useEffect(() => {
    if (mode === "edit" && initialCategory) {
      setFormData({
        status: initialCategory.status,
        sort_order: initialCategory.sort_order,
        parent_category_id: initialCategory.parent_category_id,
        description: initialCategory.description || "",
      });
      setCategoryName(initialCategory.name);
      setCurrentImageId(initialCategory.image || null);
    }
  }, [mode, initialCategory, categories]);

  useEffect(() => {
    if (getImageUrl && !selectedFile) {
      setImagePreview(getImageUrl);
    }
  }, [getImageUrl, selectedFile]);

  const generateUniqueSlug = (name: string): string => {
    if (!name.trim()) return "";

    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const existingSlugs = categories
      .filter((cat) =>
        mode === "edit" ? cat._id !== initialCategory?._id : true
      )
      .map((cat) => cat.slug);

    let uniqueSlug = baseSlug;
    let counter = 1;

    while (existingSlugs.includes(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    return uniqueSlug;
  };


  /**
   * The path this category will sit at, given the chosen parent.
   *
   * Shown rather than the old "New category will be: Level N" box, because a
   * breadcrumb answers the same question and one more: whether the parent
   * chosen is the intended branch. "Level 3" alone does not distinguish
   * Supermarkets › Groceries › Bread from Pharmacies › Wellness › Bread.
   *
   * Depth comes from walking the parent chain over the same list the picker was
   * built from, bounded because a pre-existing cycle in the data would
   * otherwise spin here.
   */
  const plannedBreadcrumb = useMemo(() => {
    const name = categoryName.trim() || "This category";
    const parts: string[] = [];

    let current = formData.parent_category_id as string | undefined;
    const seen = new Set<string>();
    while (current && !seen.has(current) && seen.size < 64) {
      seen.add(current);
      const node = categories.find((c) => c._id === current);
      if (!node) break;
      parts.unshift(node.name);
      current = node.parent_category_id as string | undefined;
    }

    parts.push(name);
    const level = parts.length;
    const suffix =
      level === 3
        ? " — holds products"
        : level === 2
          ? " — can have subcategories"
          : " — top level";

    return `${parts.join(" › ")}  (level ${level}${suffix})`;
  }, [categories, categoryName, formData.parent_category_id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);

    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      // If no new file selected, revert to current image if in edit mode
      if (mode === "edit" && getImageUrl) {
        setImagePreview(getImageUrl);
      } else {
        setImagePreview(null);
      }
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setCurrentImageId(null);
    // Reset the file input
    const fileInput = document.getElementById("image") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    const generatedSlug = generateUniqueSlug(categoryName);

    // The depth limit is not re-checked here. The picker cannot offer a level-3
    // parent, and `createCategory`/`updateCategory` enforce the rule server-side
    // with the full tree in hand — including the cycle and descendant cases a
    // client-side check cannot see. A third copy of the rule here would be the
    // one most likely to drift.

    setLoading(true);
    try {
      let image: Id<"_storage"> | undefined = undefined;

      // Handle image upload/update
      if (selectedFile) {
        // Upload new file
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });
        if (!uploadResult.ok) {
          throw new Error("Category image upload failed");
        }
        const { storageId } = await uploadResult.json();
        image = storageId as Id<"_storage">;
      } else if (currentImageId && mode === "edit") {
        // Keep existing image
        image = currentImageId;
      }

      const values: CategoryFormValues = {
        name: String(fd.get("name") || ""),
        slug: generatedSlug,
        parent_category_id: formData.parent_category_id,
        description: String(fd.get("description") || ""),
        image,
        status: formData.status!,
        // Sibling display order, NOT the depth. This field used to be assigned
        // the category's level, which made every level-3 category sort_order 3
        // and the ordering meaningless. Left at whatever the record already had,
        // or 0 for a new one, until there is a UI for reordering siblings.
        sort_order: formData.sort_order ?? 0,
      };

      await onSubmit(values);

      // Reset form only in create mode
      if (mode === "create") {
        formEl.reset();
        setFormData({ status: "active", sort_order: 1 });
        setCategoryName("");
        setSelectedFile(null);
        setImagePreview(null);
        setCurrentImageId(null);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "edit" ? "Edit Category" : "Category Information"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image">Category Image</Label>
            <div className="space-y-3">
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Upload category image (optional). Supported formats: JPG, PNG,
                GIF
              </p>
            </div>
          </div>

          {imagePreview && (
            <div className="space-y-2">
              <Label>Image Preview</Label>
              <div className="relative w-32 h-32 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <img
                  src={imagePreview}
                  alt="Category preview"
                  className="w-full h-full object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-1 right-1 h-6 w-6 p-0"
                  onClick={handleRemoveImage}
                  title="Remove image"
                >
                  <HugeiconsIcon icon={X} className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {!imagePreview && (
            <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <HugeiconsIcon icon={ImageIcon} className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No image</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">
              Category Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Enter category name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
          </div>

          {categoryName && (
            <div className="space-y-2">
              <Label>URL Slug (auto-generated)</Label>
              <Input
                value={generateUniqueSlug(categoryName)}
                readOnly
                className="bg-muted text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                This will be automatically generated from the category name
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Parent category</Label>
            {/*
              One searchable picker, following sydia's category form, instead of
              the two chained "Level 1" / "Level 2" dropdowns this replaced.

              Those dropdowns encoded the depth rule in the UI only — sentinel
              values ("root", "stay-level1") stood in for "no parent", and
              nothing on the server enforced anything, so a fourth level was one
              API call away. The rule now lives in
              `packages/backend/convex/lib/category_tree.ts` and is enforced by
              `createCategory`/`updateCategory`; this picker simply never offers
              a choice that would be rejected, and shows the resulting path so
              the level is visible rather than inferred.
            */}
            <ParentCategoryPicker
              value={formData.parent_category_id}
              onValueChange={(parentId: string | undefined) =>
                setFormData((prev) => ({
                  ...prev,
                  parent_category_id: parentId as Id<"categories"> | undefined,
                }))
              }
              excludeId={mode === "edit" ? initialCategory?._id : undefined}
            />

            <div className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
              <span className="font-medium">This category will be: </span>
              <span className="text-foreground">
                {plannedBreadcrumb}
              </span>
            </div>
          </div>

          <FormField
            name="description"
            label="Description"
            required
            placeholder="Enter category description"
            defaultValue={mode === "edit" ? initialCategory?.description : ""}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: value as "active" | "inactive",
                  }))
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
            </div>
          </div>
        </CardContent>
      </Card>

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
              ? "Update Category"
              : "Create Category"}
        </Button>
      </div>
    </form>
  );
}

function FormField({
  name,
  label,
  type = "text",
  required,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </div>
  );
}
