"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon as X, ImageIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import type React from "react";
import type { Id } from "@repo/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
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
import { toast } from "sonner";
import type { Brand, BrandFormValues } from "./types";

/** Mirrors `slugifyBrandName` in convex/data/brands.ts. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BrandsForm({
  onSubmit,
  onCancel,
  initialBrand,
  mode = "create",
}: {
  onSubmit: (values: BrandFormValues) => Promise<void>;
  onCancel?: () => void;
  initialBrand?: Brand;
  mode?: "create" | "edit";
}) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [currentLogoId, setCurrentLogoId] = useState<Id<"_storage"> | null>(
    null,
  );

  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const existingLogoUrl = useQuery(
    api.data.files.getImageUrl,
    initialBrand?.logo ? { storageId: initialBrand.logo } : "skip",
  );

  useEffect(() => {
    if (mode === "edit" && initialBrand) {
      setName(initialBrand.name);
      setDescription(initialBrand.description ?? "");
      setStatus(initialBrand.status);
      setCurrentLogoId(initialBrand.logo ?? null);
    }
  }, [mode, initialBrand]);

  useEffect(() => {
    if (existingLogoUrl && !selectedFile) setLogoPreview(existingLogoUrl);
  }, [existingLogoUrl, selectedFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setSelectedFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const clearLogo = () => {
    setSelectedFile(null);
    setLogoPreview(null);
    setCurrentLogoId(null);
  };

  const validateForm = () => {
    if (name.trim().length < 2) {
      toast.error("Brand name must be at least 2 characters long");
      return false;
    }
    if (!slugify(name)) {
      toast.error("Brand name must contain at least one letter or number");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) return;

    const formEl = event.currentTarget;
    setLoading(true);
    try {
      let logo = currentLogoId ?? undefined;

      if (selectedFile) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });
        if (!uploadResult.ok) throw new Error("Brand logo upload failed");
        const { storageId } = await uploadResult.json();
        logo = storageId as Id<"_storage">;
      }

      await onSubmit({
        name: name.trim(),
        slug: slugify(name),
        description: description.trim() || undefined,
        logo,
        status,
      });

      if (mode === "create") {
        formEl.reset();
        setName("");
        setDescription("");
        setStatus("active");
        clearLogo();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save brand",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-base font-medium">
          Brand Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Coca-Cola"
          maxLength={100}
          required
        />
        <p className="text-xs text-muted-foreground">
          {/*
            The slug is what the shop's /brand/[slug] route and every banner
            link resolve against, so it is shown rather than hidden — renaming
            a brand moves its page, and that should not be a surprise.
          */}
          Shop URL: /brand/{slugify(name) || "…"}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-base font-medium">
          Description
        </Label>
        <Textarea
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Shown on the brand's page in the shop app"
          rows={3}
          maxLength={500}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-base font-medium">Logo</Label>
        {logoPreview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoPreview}
              alt="Brand logo preview"
              className="h-24 w-24 rounded-lg border object-contain"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -right-2 -top-2 h-6 w-6"
              onClick={clearLogo}
            >
              <HugeiconsIcon icon={X} className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground hover:bg-accent">
            <HugeiconsIcon icon={ImageIcon} className="h-5 w-5" />
            <span className="text-xs">Upload</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Square works best — it is shown as a circle on the brand page.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-base font-medium">Status</Label>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as "active" | "inactive")}
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
          Inactive brands stay linked to their products but are hidden from the
          shop.
        </p>
      </div>

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
              ? "Update Brand"
              : "Create Brand"}
        </Button>
      </div>
    </form>
  );
}
