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
  const [selectedLevel1, setSelectedLevel1] = useState<string>("");
  const [selectedLevel2, setSelectedLevel2] = useState<string>("");

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

      // Set the cascading selection based on the parent
      if (initialCategory.parent_category_id) {
        const parent = categories.find(
          (cat) => cat._id === initialCategory.parent_category_id
        );
        if (parent) {
          if (parent.parent_category_id) {
            // Parent has a parent, so this is level 3, parent is level 2
            const grandParent = categories.find(
              (cat) => cat._id === parent.parent_category_id
            );
            if (grandParent) {
              setSelectedLevel1(grandParent._id);
              setSelectedLevel2(parent._id);
            }
          } else {
            setSelectedLevel1(parent._id);
            setSelectedLevel2("stay-level1");
          }
        }
      } else {
        // No parent, so this is level 1
        setSelectedLevel1("root");
        setSelectedLevel2("stay-level1");
      }
    }
  }, [mode, initialCategory, categories]);

  useEffect(() => {
    const newLevel = getNewCategoryLevel();
    const parentId = getParentCategoryId();

    setFormData((prev) => ({
      ...prev,
      sort_order: newLevel,
      parent_category_id: parentId,
    }));
  }, [selectedLevel1, selectedLevel2]);

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

  const getCategoryDepth = (categoryId: string): number => {
    const category = categories.find((cat) => cat._id === categoryId);
    if (!category) return 0;

    let depth = 1;
    let current = category;

    while (current.parent_category_id) {
      const parent = categories.find(
        (cat) => cat._id === current.parent_category_id
      );
      if (!parent) break;
      current = parent;
      depth++;
    }

    return depth;
  };

  // Get level 1 categories (root categories)
  const level1Categories = useMemo(() => {
    return categories.filter(
      (cat) => !cat.parent_category_id && cat.status === "active"
    );
  }, [categories]);

  // Get level 2 categories (children of selected level 1)
  const level2Categories = useMemo(() => {
    if (!selectedLevel1 || selectedLevel1 === "root") return [];
    return categories.filter(
      (cat) =>
        cat.parent_category_id === selectedLevel1 && cat.status === "active"
    );
  }, [categories, selectedLevel1]);

  // Determine what parent should be set based on selection
  const getParentCategoryId = (): Id<"categories"> | undefined => {
    if (selectedLevel2 && selectedLevel2 !== "stay-level1") {
      // If level 2 is selected, the new category will be level 3
      return selectedLevel2 as Id<"categories">;
    } else if (selectedLevel1 && selectedLevel1 !== "root") {
      // If only level 1 is selected, the new category will be level 2
      return selectedLevel1 as Id<"categories">;
    }
    // If no selection or "root" selected, the new category will be level 1
    return undefined;
  };

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      parent_category_id: getParentCategoryId(),
    }));
  }, [selectedLevel1, selectedLevel2]);

  const getSelectedPath = (): string => {
    const parts: string[] = [];

    if (selectedLevel1) {
      const level1Cat = categories.find((cat) => cat._id === selectedLevel1);
      if (level1Cat) parts.push(level1Cat.name);
    }

    if (selectedLevel2) {
      const level2Cat = categories.find((cat) => cat._id === selectedLevel2);
      if (level2Cat) parts.push(level2Cat.name);
    }

    return parts.join(" > ");
  };

  // Determine what level the new category will be
  const getNewCategoryLevel = (): number => {
    if (selectedLevel2 && selectedLevel2 !== "stay-level1") return 3; // Third level
    if (selectedLevel1 && selectedLevel1 !== "root") return 2; // Second level
    return 1; // First level (root)
  };

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

    // Validate that we're not creating a category beyond level 3
    const newLevel = getNewCategoryLevel();
    if (newLevel > 3) {
      toast.error("Cannot create categories beyond level 3");
      return;
    }

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
        sort_order: formData.sort_order || getNewCategoryLevel(),
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
        setSelectedLevel1("root");
        setSelectedLevel2("stay-level1");
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
            <Label>Category Hierarchy</Label>

            {/* Show current selection path */}
            {getSelectedPath() && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md border">
                <span className="font-medium">Selected Path: </span>
                <span className="text-foreground">{getSelectedPath()}</span>
              </div>
            )}

            {/* Level 1 Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                Level 1 Category
              </Label>
              <Select
                value={selectedLevel1 || "root"}
                onValueChange={(value) => {
                  setSelectedLevel1(value);
                  setSelectedLevel2("stay-level1"); // Reset level 2 when level 1 changes
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level 1 category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">
                    No parent (root category)
                  </SelectItem>
                  {level1Categories.map((cat) => (
                    <SelectItem
                      key={cat._id}
                      value={cat._id}
                      disabled={
                        mode === "edit" &&
                        initialCategory &&
                        cat._id === initialCategory._id
                      }
                    >
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Level 2 Selection - Only show if Level 1 is selected */}
            {selectedLevel1 &&
              selectedLevel1 !== "root" &&
              level2Categories.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <HugeiconsIcon icon={ChevronRight} className="h-3 w-3 text-muted-foreground" />
                    Level 2 Category
                  </Label>
                  <Select
                    value={selectedLevel2 || "stay-level1"}
                    onValueChange={setSelectedLevel2}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select level 2 category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stay-level1">
                        Stop at level 1
                      </SelectItem>
                      {level2Categories.map((cat) => (
                        <SelectItem
                          key={cat._id}
                          value={cat._id}
                          disabled={
                            mode === "edit" &&
                            initialCategory &&
                            cat._id === initialCategory._id
                          }
                        >
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            {/* Show what level the new category will be */}
            <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-md border border-blue-200">
              <div className="space-y-1">
                <div>
                  <span className="font-medium">New category will be: </span>
                  <span>
                    Level {getNewCategoryLevel()}
                    {getNewCategoryLevel() === 3 &&
                      " (Final level - can hold products)"}
                    {getNewCategoryLevel() === 2 && " (Can have subcategories)"}
                    {getNewCategoryLevel() === 1 && " (Root category)"}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Sort Order: </span>
                  <span>{getNewCategoryLevel()} (Auto-assigned)</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Categories can be nested up to 3 levels. Level 3 categories are
              the final level that hold products. You can only create categories
              up to level 2, and when you add a category to level 2, it becomes
              a level 3 category.
            </p>
          </div>

          <FormField
            name="description"
            label="Description"
            required
            placeholder="Enter category description"
            defaultValue={mode === "edit" ? initialCategory?.description : ""}
          />

          <div className="space-y-2">
            <Label>Sort Order (Auto-generated)</Label>
            <Input
              value={`Level ${formData.sort_order || getNewCategoryLevel()}`}
              readOnly
              className="bg-muted text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Sort order is automatically assigned based on category level:
              Level 1 (Root) = 1, Level 2 = 2, Level 3 = 3
            </p>
          </div>

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
