"use client";

import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import type { Id, Doc } from "@repo/backend/dataModel";
import {
  ExcelImport,
  type ImportConfig,
  type ColumnMapping,
} from "@/components/shared/ExcelImport";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface CategoryImportProps {
  categories: Doc<"categories">[];
  onClose: () => void;
}

export function CategoryImport({ categories, onClose }: CategoryImportProps) {
  const bulkCreate = useMutation(api.data.categories.bulkCreateCategories);

  // Build lookup maps for parent category name→ID resolution
  const categoryMap = new Map<string, Id<"categories">>();
  for (const cat of categories) {
    if (cat.name) categoryMap.set(cat.name.trim().toLowerCase(), cat._id);
    if (cat.slug) categoryMap.set(cat.slug.trim().toLowerCase(), cat._id);
  }

  const generateSlug = (name: string): string =>
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const columns: ColumnMapping[] = [
    {
      excelHeader: "name",
      field: "name",
      required: true,
      validate: (v) =>
        !v || String(v).trim() === "" ? "Name is required" : undefined,
    },
    {
      excelHeader: "description",
      field: "description",
      required: true,
      transform: (v) => (v ? String(v).trim() : ""),
      validate: (v) =>
        !v || String(v).trim() === "" ? "Description is required" : undefined,
    },
    {
      excelHeader: "parent_category",
      field: "parent_category_id",
      required: false,
      transform: (v) => {
        if (!v || String(v).trim() === "") return undefined;
        const key = String(v).trim().toLowerCase();
        return categoryMap.get(key) ?? undefined;
      },
    },
    {
      excelHeader: "status",
      field: "status",
      required: false,
      transform: (v) => {
        if (!v) return "active";
        const s = String(v).trim().toLowerCase();
        if (s === "active" || s === "inactive") return s;
        return "active";
      },
    },
    {
      excelHeader: "sort_order",
      field: "sort_order",
      required: false,
      transform: (v) => {
        if (!v || v === "") return 0;
        const num = Number(v);
        return isNaN(num) ? 0 : Math.floor(num);
      },
    },
  ];

  const config: ImportConfig = {
    entityName: "Categories",
    columns,
    maxRows: 200,
  };

  const handleImport = async (
    rows: Record<string, any>[],
  ): Promise<{ success: number; failed: number; errors: string[] }> => {
    const existingSlugs = new Set(categories.map((c) => c.slug));

    const mapped = rows.map((row, index) => {
      let slug = generateSlug(String(row.name));

      // Ensure unique slug
      let slugBase = slug;
      let counter = 1;
      while (existingSlugs.has(slug)) {
        slug = `${slugBase}-${counter}`;
        counter++;
      }
      existingSlugs.add(slug);

      const category: Record<string, any> = {
        name: String(row.name).trim(),
        slug,
        description: String(row.description || "").trim(),
        status: row.status || "active",
        sort_order: typeof row.sort_order === "number" ? row.sort_order : index,
      };

      if (row.parent_category_id) {
        category.parent_category_id = row.parent_category_id;
      }

      return category;
    });

    // Batch in chunks of 50
    const BATCH_SIZE = 50;
    let totalSuccess = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      try {
        const result = await bulkCreate({ categories: batch as any });
        totalSuccess += result.success;
        totalFailed += result.failed;
        allErrors.push(...result.errors);
      } catch (err: any) {
        totalFailed += batch.length;
        allErrors.push(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`,
        );
      }
    }

    if (totalSuccess > 0) {
      toast.success(`${totalSuccess} categories imported successfully`);
    }
    if (totalFailed > 0) {
      toast.error(`${totalFailed} categories failed to import`);
    }

    return { success: totalSuccess, failed: totalFailed, errors: allErrors };
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        name: "Example Category",
        description: "Description of the category",
        parent_category: "",
        status: "active",
        sort_order: 0,
      },
      {
        name: "Child Category",
        description: "A sub-category",
        parent_category: categories[0]?.name || "Parent Category Name",
        status: "active",
        sort_order: 1,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Categories");
    XLSX.writeFile(wb, "categories_import_template.xlsx");
  };

  return (
    <ExcelImport
      config={config}
      onImport={handleImport}
      onClose={onClose}
      onDownloadTemplate={handleDownloadTemplate}
    />
  );
}
