"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon as AlertTriangle,
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle2,
  ImageIcon,
  Loading03Icon as Loader2,
  Upload01Icon as Upload,
} from "@hugeicons/core-free-icons";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { useState, useRef } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { Progress } from "@repo/ui/components/ui/progress";
import { toast } from "sonner";

interface Product {
  _id: Id<"products">;
  name: string;
  sku: string;
}

interface BulkImageUploadProps {
  products: Product[];
  onClose: () => void;
}

interface FileMatch {
  file: File;
  sku: string;
  baseSku: string;
  variantIndex: number; // 1 = primary (unsuffixed), 2+ = "{sku}_2", "{sku}_3", ...
  product: Product | null;
}

// "PROD-0001_3.jpg" → base "PROD-0001", variant 3. Unsuffixed → variant 1 (primary).
const SUFFIX_RE = /^(.*)_(\d+)$/;
function parseSkuVariant(rawName: string): { baseSku: string; variantIndex: number } {
  const name = rawName.trim();
  const m = SUFFIX_RE.exec(name);
  // Capture groups are typed as possibly-undefined regardless of the pattern.
  // Reading them once and checking beats a cast: if SUFFIX_RE is ever edited to
  // drop a group, this falls back instead of yielding baseSku: undefined.
  const base = m?.[1];
  const index = m?.[2];
  if (base && index && Number(index) >= 2) {
    return { baseSku: base, variantIndex: Number(index) };
  }
  return { baseSku: name, variantIndex: 1 };
}

type Stage = "idle" | "preview" | "uploading" | "done";

export function BulkImageUpload({ products, onClose }: BulkImageUploadProps) {
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const addProductImages = useMutation(api.data.products.addProductImages);

  const [stage, setStage] = useState<Stage>("idle");
  const [matches, setMatches] = useState<FileMatch[]>([]);
  const [progress, setProgress] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build SKU → product map (lowercase for matching)
  const skuMap = new Map<string, Product>();
  for (const p of products) {
    if (p.sku) skuMap.set(p.sku.trim().toLowerCase(), p);
  }

  const analyseFiles = (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("No image files found. Please select image files (jpg, png, webp, etc.)");
      return;
    }

    const result: FileMatch[] = imageFiles.map((file) => {
      const rawName = file.name.replace(/\.[^.]+$/, "");
      const { baseSku, variantIndex } = parseSkuVariant(rawName);
      const product = skuMap.get(baseSku.toLowerCase()) ?? null;
      return { file, sku: rawName.trim(), baseSku, variantIndex, product };
    });

    setMatches(result);
    setStage("preview");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    analyseFiles(Array.from(e.dataTransfer.files));
  };

  const matchedFiles = matches.filter((m) => m.product !== null);
  const unmatchedFiles = matches.filter((m) => m.product === null);

  const handleUpload = async () => {
    if (matchedFiles.length === 0) return;
    setStage("uploading");
    setProgress(0);
    setUploadedCount(0);
    setFailedCount(0);

    // Group matched files by product, ordering each group so the
    // unsuffixed (primary) file uploads first, then "_2", "_3", ...
    const groups = new Map<Id<"products">, FileMatch[]>();
    for (const match of matchedFiles) {
      const list = groups.get(match.product!._id) ?? [];
      list.push(match);
      groups.set(match.product!._id, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.variantIndex - b.variantIndex);
    }

    let done = 0;
    let failed = 0;
    const total = matchedFiles.length;

    for (const [productId, files] of groups) {
      const storageIds: Id<"_storage">[] = [];

      for (const match of files) {
        try {
          const uploadUrl = await generateUploadUrl();
          const resp = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": match.file.type },
            body: match.file,
          });
          if (!resp.ok) throw new Error("Upload failed");
          const { storageId } = await resp.json();
          storageIds.push(storageId as Id<"_storage">);
          done++;
        } catch {
          failed++;
        }
        setProgress(Math.round(((done + failed) / total) * 100));
        setUploadedCount(done);
        setFailedCount(failed);
      }

      if (storageIds.length > 0) {
        try {
          await addProductImages({ product_id: productId, storage_ids: storageIds });
        } catch {
          // Uploads succeeded but linking them to the product failed —
          // move those files from "done" to "failed".
          done -= storageIds.length;
          failed += storageIds.length;
          setUploadedCount(done);
          setFailedCount(failed);
        }
      }
    }

    setStage("done");
    if (done > 0) toast.success(`${done} image${done > 1 ? "s" : ""} uploaded`);
    if (failed > 0) toast.error(`${failed} image${failed > 1 ? "s" : ""} failed`);
  };

  // ── Done ────────────────────────────────────────────────────
  if (stage === "done") {
    return (
      <div className="space-y-4 py-4 text-center">
        <HugeiconsIcon icon={CheckCircle2} className="w-12 h-12 text-green-500 mx-auto" />
        <div>
          <p className="font-semibold text-lg">Upload complete</p>
          <p className="text-muted-foreground text-sm mt-1">
            {uploadedCount} images linked successfully
            {failedCount > 0 && `, ${failedCount} failed`}
          </p>
        </div>
        <Button onClick={onClose}>Close</Button>
      </div>
    );
  }

  // ── Uploading ───────────────────────────────────────────────
  if (stage === "uploading") {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-3">
          <HugeiconsIcon icon={Loader2} className="w-6 h-6 animate-spin text-blue-500" />
          <p className="font-medium">
            Uploading {uploadedCount + failedCount} / {matchedFiles.length}…
          </p>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="flex gap-4 text-sm">
          <span className="text-green-600">{uploadedCount} done</span>
          {failedCount > 0 && (
            <span className="text-red-600">{failedCount} failed</span>
          )}
        </div>
      </div>
    );
  }

  // ── Preview ─────────────────────────────────────────────────
  if (stage === "preview") {
    return (
      <div className="space-y-4 py-2">
        <div className="flex gap-4 text-sm">
          <Badge variant="secondary" className="gap-1">
            <HugeiconsIcon icon={CheckCircle2} className="w-3 h-3 text-green-500" />
            {matchedFiles.length} matched
          </Badge>
          {unmatchedFiles.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <HugeiconsIcon icon={XCircle} className="w-3 h-3 text-red-500" />
              {unmatchedFiles.length} unmatched (will be skipped)
            </Badge>
          )}
        </div>

        <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
          {matches.map((m, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
              <HugeiconsIcon icon={ImageIcon} className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate font-mono text-xs">
                {m.file.name}
              </span>
              {m.product && m.variantIndex === 1 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  primary
                </Badge>
              )}
              {m.product ? (
                <span className="text-green-600 truncate max-w-[160px]">
                  {m.product.name}
                </span>
              ) : (
                <span className="text-red-500 text-xs">No match</span>
              )}
            </div>
          ))}
        </div>

        {unmatchedFiles.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <HugeiconsIcon icon={AlertTriangle} className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Unmatched files are skipped. Rename image files to match the
              product SKU (e.g. <strong>PROD-0001.jpg</strong>), or{" "}
              <strong>PROD-0001_2.jpg</strong> for an additional image on the
              same product.
            </span>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => setStage("idle")}>
            Change Files
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={matchedFiles.length === 0}
            >
              <HugeiconsIcon icon={Upload} className="w-4 h-4 mr-2" />
              Upload {matchedFiles.length} Image
              {matchedFiles.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Idle ────────────────────────────────────────────────────
  return (
    <div className="space-y-4 py-2">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-blue-400 bg-blue-50"
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
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => analyseFiles(Array.from(e.target.files ?? []))}
        />
        <div className="flex flex-col items-center gap-2">
          <HugeiconsIcon icon={ImageIcon} className="w-10 h-10 text-gray-400" />
          <p className="font-medium">Drop product images here</p>
          <p className="text-sm text-muted-foreground">
            or click to browse — select multiple images
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
        <p>
          <strong>Naming convention:</strong> each image filename (without
          extension) must match a product SKU.
        </p>
        <p>
          <code className="bg-muted px-1 rounded">PROD-0001.jpg</code> is
          linked as the <strong>primary</strong> image for SKU{" "}
          <code className="bg-muted px-1 rounded">PROD-0001</code>. To add
          more images to the same product, suffix with{" "}
          <code className="bg-muted px-1 rounded">_2</code>,{" "}
          <code className="bg-muted px-1 rounded">_3</code>, etc — e.g.{" "}
          <code className="bg-muted px-1 rounded">PROD-0001_2.jpg</code>.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
