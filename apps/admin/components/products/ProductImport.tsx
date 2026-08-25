"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon as AlertTriangle,
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle2,
  Download01Icon as Download,
  FileSpreadsheetIcon as FileSpreadsheet,
  Loading03Icon as Loader2,
  Upload01Icon as Upload,
} from "@hugeicons/core-free-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id, Doc } from "@repo/backend/dataModel";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Progress } from "@repo/ui/components/ui/progress";
import { Badge } from "@repo/ui/components/ui/badge";
import { findCategoryPath } from "@/lib/category-utils";
import type { Category } from "@/lib/category-utils";
import { Label } from "@repo/ui/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface ProductImportProps {
  categories: Doc<"categories">[];
  vendors: { _id: Id<"vendors">; name: string }[];
  onClose: () => void;
}

type Stage = "idle" | "file-ready" | "uploading" | "processing" | "done";

export function ProductImport({
  categories,
  vendors,
  onClose,
}: ProductImportProps) {
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const createImportJob = useMutation(api.data.import_jobs.createImportJob);
  const processJob = useAction(api.actions.import_jobs_action.processProductImportJob);

  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [categoryPreview, setCategoryPreview] = useState<{
    matched: number;
    total: number;
  } | null>(null);
  const [activeJobId, setActiveJobId] = useState<Id<"import_jobs"> | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [vendorId, setVendorId] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const vendorOptions = vendors.map((v) => ({
    value: v._id,
    label: v.name,
  }));

  const job = useQuery(
    api.data.import_jobs.getImportJob,
    activeJobId ? { id: activeJobId } : "skip",
  );

  // Build category lookup map for client-side preview validation
  const categoryMap = new Map<string, Id<"categories">>();
  for (const cat of categories) {
    if (cat.name) categoryMap.set(cat.name.trim().toLowerCase(), cat._id);
    if (cat.slug) categoryMap.set(cat.slug.trim().toLowerCase(), cat._id);

    const path = findCategoryPath(categories as Category[], cat._id)
      .map((c) => c.name.trim().toLowerCase());
    if (path.length > 1) {
      categoryMap.set(path.join("/"), cat._id);
      categoryMap.set(path.join(" / "), cat._id);
      categoryMap.set(path.join(" > "), cat._id);
    }
  }

  const REQUIRED_COLUMNS = ["name", "category", "price", "quantity"];

  const analyseFile = (f: File) => {
    setFile(f);
    setHeaderError(null);
    setCategoryPreview(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        // A workbook with no sheets is a real upload — an empty file, or one
        // saved by a tool that wrote only metadata. Indexing Sheets with
        // undefined yields undefined, and sheet_to_json throws on that.
        const firstSheetName = wb.SheetNames[0];
        const sheet = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
        if (!sheet) {
          setHeaderError("That file has no worksheets.");
          setStage("file-ready");
          return;
        }
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        });

        if (rows.length === 0) {
          setHeaderError("The file has no data rows.");
          setStage("file-ready");
          return;
        }

        // rows.length is checked above, so this is present — read once rather
        // than asserted, so a change to that check cannot silently break it.
        const firstRow = rows[0];
        const headers = Object.keys(firstRow ?? {}).map((h) =>
          h.trim().toLowerCase(),
        );
        const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
        if (missing.length > 0) {
          setHeaderError(
            `Missing required columns: ${missing.join(", ")}. Download the template to see the expected format.`,
          );
          setStage("file-ready");
          return;
        }

        setRowCount(rows.length);

        // Quick category resolution preview
        let matched = 0;
        for (const row of rows) {
          const key = row["category"] ? String(row["category"]).trim().toLowerCase() : "";
          if (categoryMap.has(key)) matched++;
        }
        setCategoryPreview({ matched, total: rows.length });
        setStage("file-ready");
      } catch {
        setHeaderError("Could not read the file. Make sure it is a valid Excel (.xlsx) file.");
        setStage("file-ready");
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const handleFileChange = (f: File | null) => {
    if (!f) return;
    analyseFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  };

  const handleStartImport = async () => {
    if (!file || !vendorId) return;
    setStage("uploading");

    try {
      // 1. Get upload URL
      const uploadUrl = await generateUploadUrl();

      // 2. Upload the raw file to Convex storage
      const uploadResp = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResp.ok) throw new Error("File upload failed");
      const { storageId } = await uploadResp.json();

      // 3. Create the import job
      const jobId = await createImportJob({
        file_storage_id: storageId as Id<"_storage">,
        vendor_id: vendorId as Id<"vendors">,
      });
      setActiveJobId(jobId);
      setStage("processing");

      // 4. Trigger server-side processing (fire-and-forget — progress via reactive query)
      processJob({ jobId }).catch((err: any) => {
        toast.error(`Import error: ${err.message}`);
      });
    } catch (err: any) {
      toast.error(`Failed to start import: ${err.message}`);
      setStage("file-ready");
    }
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: product template row
    const templateData = [
      {
        name: "Example Product",
        sku: "PROD-0001",
        category: categories[0]?.name ?? "Category Name",
        price: 100,
        quantity: 50,
        description: "Product description here",
        brand: "Brand Name",
        status: "Active",
        unit_value: 500,
        unit_type: "ml",
        barcode: "1234567890",
        tags: "Featured,Hot",
        upc: "",
        external_id: "",
        requires_prescription: "no",
      },
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(templateData),
      "Products",
    );

    // Sheet 2: valid categories reference
    const catRows = categories.map((cat) => {
      const path = findCategoryPath(categories as Category[], cat._id);
      return {
        name: cat.name,
        slug: cat.slug,
        breadcrumb_path: path.map((c) => c.name).join(" > "),
        status: cat.status,
      };
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(catRows),
      "Valid Categories",
    );

    XLSX.writeFile(wb, "products_import_template.xlsx");
  };

  const progressPct =
    job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  const isDone = job?.status === "done" || job?.status === "failed";

  // ── Stage: processing / done ────────────────────────────────
  if (stage === "processing" || stage === "uploading") {
    return (
      <div className="space-y-6 py-4">
        <div className="flex items-center gap-3">
          <HugeiconsIcon icon={FileSpreadsheet} className="w-8 h-8 text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{file?.name}</p>
            <p className="text-sm text-muted-foreground">
              {stage === "uploading"
                ? "Uploading file…"
                : job
                  ? `${job.processed} / ${job.total} rows processed`
                  : "Starting…"}
            </p>
          </div>
          {isDone ? (
            job?.status === "done" ? (
              <HugeiconsIcon icon={CheckCircle2} className="w-6 h-6 text-green-500 shrink-0" />
            ) : (
              <HugeiconsIcon icon={XCircle} className="w-6 h-6 text-red-500 shrink-0" />
            )
          ) : (
            <HugeiconsIcon icon={Loader2} className="w-6 h-6 animate-spin text-blue-500 shrink-0" />
          )}
        </div>

        <Progress value={stage === "uploading" ? 0 : progressPct} className="h-2" />

        {job && (
          <div className="flex gap-4 text-sm">
            <span className="text-green-600 font-medium">
              {job.success} succeeded
            </span>
            {job.failed > 0 && (
              <span className="text-red-600 font-medium">
                {job.failed} failed
              </span>
            )}
          </div>
        )}

        {job && job.errors.length > 0 && (
          <div className="border rounded-md p-3 space-y-1 max-h-48 overflow-y-auto bg-muted/40">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Errors (first {Math.min(job.errors.length, 100)} shown)
            </p>
            {job.errors.map((e, i) => (
              <p key={i} className="text-xs text-red-600">
                {e}
              </p>
            ))}
          </div>
        )}

        {isDone && (
          <div className="flex gap-2 justify-end pt-2">
            <Button onClick={onClose}>Close</Button>
          </div>
        )}

        {!isDone && (
          <p className="text-xs text-muted-foreground text-center">
            Import is running server-side — you can close this dialog and it
            will continue in the background.
          </p>
        )}
      </div>
    );
  }

  // ── Stage: idle / file-ready ────────────────────────────────
  return (
    <div className="space-y-4 py-2">
      {/* Vendor selection */}
      <div className="space-y-1.5">
        <Label>
          Vendor <span className="text-red-500">*</span>
        </Label>
        <SearchableSelect
          options={vendorOptions}
          value={vendorId}
          onValueChange={setVendorId}
          placeholder="Select a vendor..."
          searchPlaceholder="Search vendors..."
          emptyText="No vendor found."
        />
        <p className="text-xs text-muted-foreground">
          All imported products will be associated with this vendor.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-blue-400 bg-blue-50"
            : file
              ? "border-green-400 bg-green-50"
              : "border-gray-300 hover:border-gray-400"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <HugeiconsIcon icon={FileSpreadsheet} className="w-10 h-10 text-green-500" />
            <p className="font-medium text-green-700">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              Click or drop to replace
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <HugeiconsIcon icon={Upload} className="w-10 h-10 text-gray-400" />
            <p className="font-medium">Drop your Excel file here</p>
            <p className="text-sm text-muted-foreground">
              or click to browse (.xlsx, .xls)
            </p>
          </div>
        )}
      </div>

      {/* File analysis results */}
      {stage === "file-ready" && (
        <div className="space-y-2">
          {headerError ? (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
              <HugeiconsIcon icon={AlertTriangle} className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{headerError}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-700">
                <HugeiconsIcon icon={CheckCircle2} className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{rowCount.toLocaleString()}</strong> product rows
                  detected
                </span>
              </div>
              {categoryPreview && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-md border text-sm ${
                    categoryPreview.matched === categoryPreview.total
                      ? "bg-green-50 border-green-200 text-green-700"
                      : "bg-amber-50 border-amber-200 text-amber-700"
                  }`}
                >
                  {categoryPreview.matched === categoryPreview.total ? (
                    <HugeiconsIcon icon={CheckCircle2} className="w-4 h-4 shrink-0" />
                  ) : (
                    <HugeiconsIcon icon={AlertTriangle} className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    <strong>{categoryPreview.matched}</strong> /{" "}
                    <strong>{categoryPreview.total}</strong> rows have a
                    recognised category
                    {categoryPreview.matched < categoryPreview.total && (
                      <> — unrecognised rows will be skipped</>
                    )}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-between pt-2">
        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
          <HugeiconsIcon icon={Download} className="w-4 h-4 mr-2" />
          Download Template
        </Button>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleStartImport}
            disabled={
              !file ||
              !vendorId ||
              stage !== "file-ready" ||
              headerError !== null
            }
          >
            <HugeiconsIcon icon={Upload} className="w-4 h-4 mr-2" />
            Start Import
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
        <p>
          <strong>Category column:</strong> use the exact category name, slug,
          or full path like{" "}
          <code className="bg-muted px-1 rounded">
            Pharmaceuticals / OTC Medicines / Analgesics
          </code>
          . Download the template to see all valid categories.
        </p>
        <p>
          <strong>No row limit</strong> — large files are processed
          server-side. You can close this dialog once the import starts.
        </p>
      </div>
    </div>
  );
}
