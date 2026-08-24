"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import * as XLSX from "xlsx";

export const processProductImportJob = action({
  args: { jobId: v.id("import_jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.data.importJobs.getJobForAction, {
      id: args.jobId,
    });
    if (!job) throw new Error("Import job not found");

    await ctx.runMutation(internal.data.importJobs.updateJobProgress, {
      id: args.jobId,
      processed: 0,
      success: 0,
      failed: 0,
      errors: [],
      status: "processing",
    });

    try {
      const blob = await ctx.storage.get(job.file_storage_id);
      if (!blob) throw new Error("Import file not found in storage");

      const arrayBuffer = await blob.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      });

      if (rows.length === 0) {
        await ctx.runMutation(internal.data.importJobs.updateJobProgress, {
          id: args.jobId,
          processed: 0,
          success: 0,
          failed: 0,
          errors: ["No data rows found in the file"],
          status: "done",
          total: 0,
        });
        return;
      }

      // Normalise header keys to lowercase
      const normalised = rows.map((row) => {
        const out: Record<string, any> = {};
        for (const [k, val] of Object.entries(row)) {
          out[k.trim().toLowerCase()] = val;
        }
        return out;
      });

      await ctx.runMutation(internal.data.importJobs.updateJobProgress, {
        id: args.jobId,
        processed: 0,
        success: 0,
        failed: 0,
        errors: [],
        total: normalised.length,
      });

      // Build lookup maps from DB
      const allCategories = await ctx.runQuery(
        internal.data.importJobs.getAllCategoriesForAction,
        {},
      );

      // category name / slug / breadcrumb → id
      const catById = new Map(allCategories.map((c) => [c._id as string, c]));
      const categoryMap = new Map<string, Id<"categories">>();
      for (const cat of allCategories) {
        if (cat.name) categoryMap.set(cat.name.trim().toLowerCase(), cat._id);
        if (cat.slug) categoryMap.set(cat.slug.trim().toLowerCase(), cat._id);

        const path: string[] = [];
        let cur: typeof cat | undefined = cat;
        while (cur) {
          path.unshift(cur.name.trim().toLowerCase());
          cur = cur.parent_category_id
            ? catById.get(cur.parent_category_id as string)
            : undefined;
        }
        if (path.length > 1) {
          categoryMap.set(path.join("/"), cat._id);
          categoryMap.set(path.join(" / "), cat._id);
          categoryMap.set(path.join(" > "), cat._id);
        }
      }

      // Helpers
      const generateSlug = (name: string) =>
        name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

      const generateSKU = (name: string, index: number) => {
        const prefix = name
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 4);
        return `${prefix}-${String(index).padStart(4, "0")}`;
      };

      // Row → product object
      const existingSlugs = new Set<string>();
      const existingSKUs = new Set<string>();
      const rowErrors: string[] = [];
      const validProducts: any[] = [];

      for (let i = 0; i < normalised.length; i++) {
        const row = normalised[i];
        const rowNum = i + 2;

        const name = row["name"] ? String(row["name"]).trim() : "";
        if (!name) {
          rowErrors.push(`Row ${rowNum}: Name is required`);
          continue;
        }

        const catKey = row["category"]
          ? String(row["category"]).trim().toLowerCase()
          : "";
        const categoryId = categoryMap.get(catKey);
        if (!categoryId) {
          rowErrors.push(
            `Row ${rowNum} "${name}": Category "${row["category"]}" not found`,
          );
          continue;
        }

        const price = Number(row["price"]);
        if (isNaN(price) || price < 0) {
          rowErrors.push(`Row ${rowNum} "${name}": Invalid price`);
          continue;
        }

        const quantity = Math.floor(Number(row["quantity"]));
        if (isNaN(quantity) || quantity < 0) {
          rowErrors.push(`Row ${rowNum} "${name}": Invalid quantity`);
          continue;
        }

        let slug = row["slug"] ? String(row["slug"]).trim() : generateSlug(name);
        const slugBase = slug;
        let slugCtr = 1;
        while (existingSlugs.has(slug)) slug = `${slugBase}-${slugCtr++}`;
        existingSlugs.add(slug);

        let sku = row["sku"] ? String(row["sku"]).trim() : generateSKU(name, i + 1);
        const skuBase = sku;
        let skuCtr = 1;
        while (existingSKUs.has(sku)) sku = `${skuBase}-${skuCtr++}`;
        existingSKUs.add(sku);

        const rawStatus = row["status"]
          ? String(row["status"]).trim().toLowerCase()
          : "active";
        const statusMap: Record<string, string> = {
          active: "Active",
          inactive: "Inactive",
          archived: "Archived",
        };
        const status = statusMap[rawStatus] ?? "Active";

        const validTags = ["Featured", "Offer", "Hot"];
        const rawTags: string[] = row["tags"]
          ? String(row["tags"])
              .split(",")
              .map((t: string) => t.trim())
          : [];
        const tags =
          rawTags.length > 0
            ? rawTags
                .map((t) =>
                  validTags.find((vt) => vt.toLowerCase() === t.toLowerCase()),
                )
                .filter((t): t is string => Boolean(t))
            : undefined;

        let requires_prescription: boolean | undefined;
        if (row["requires_prescription"] !== "" && row["requires_prescription"] !== undefined) {
          const rp = String(row["requires_prescription"]).trim().toLowerCase();
          if (["true", "yes", "1", "y"].includes(rp)) requires_prescription = true;
          else if (["false", "no", "0", "n"].includes(rp)) requires_prescription = false;
        }

        const product: Record<string, any> = {
          name,
          slug,
          sku,
          category_id: categoryId,
          price,
          quantity,
          status,
          vendor_id: job.vendor_id,
        };
        if (row["description"]) product.description = String(row["description"]).trim();
        if (row["brand"]) product.brand = String(row["brand"]).trim();
        const unitValue = Number(row["unit_value"]);
        if (!isNaN(unitValue) && row["unit_value"] !== "") product.unit_value = unitValue;
        if (row["unit_type"]) product.unit_type = String(row["unit_type"]).trim();
        if (row["barcode"]) product.barcode = String(row["barcode"]).trim();
        if (tags && tags.length > 0) product.tags = tags;
        const upc = Number(row["upc"]);
        if (!isNaN(upc) && row["upc"] !== "") product.upc = upc;
        if (row["external_id"]) product.external_id = String(row["external_id"]).trim();
        if (requires_prescription !== undefined)
          product.requires_prescription = requires_prescription;

        validProducts.push(product);
      }

      // Process in batches of 50
      const BATCH_SIZE = 50;
      let totalProcessed = rowErrors.length;
      let totalSuccess = 0;
      let totalFailed = rowErrors.length;
      const allErrors = [...rowErrors];

      for (let i = 0; i < validProducts.length; i += BATCH_SIZE) {
        const batch = validProducts.slice(i, i + BATCH_SIZE);
        try {
          const result = await ctx.runMutation(
            internal.data.products.internalBulkCreateProducts,
            { products: batch },
          );
          totalSuccess += result.success;
          totalFailed += result.failed;
          totalProcessed += batch.length;
          allErrors.push(...result.errors);
        } catch (err: any) {
          totalFailed += batch.length;
          totalProcessed += batch.length;
          allErrors.push(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`,
          );
        }

        await ctx.runMutation(internal.data.importJobs.updateJobProgress, {
          id: args.jobId,
          processed: totalProcessed,
          success: totalSuccess,
          failed: totalFailed,
          errors: allErrors.slice(0, 100),
          total: normalised.length,
        });
      }

      await ctx.runMutation(internal.data.importJobs.updateJobProgress, {
        id: args.jobId,
        processed: normalised.length,
        success: totalSuccess,
        failed: totalFailed,
        errors: allErrors.slice(0, 100),
        status: "done",
        total: normalised.length,
      });
    } catch (err: any) {
      await ctx.runMutation(internal.data.importJobs.updateJobProgress, {
        id: args.jobId,
        processed: 0,
        success: 0,
        failed: 0,
        errors: [err.message ?? "Unknown error"],
        status: "failed",
      });
    }
  },
});
