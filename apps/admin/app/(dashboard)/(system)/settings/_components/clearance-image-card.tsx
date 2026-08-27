"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  ImageIcon,
  Loading03Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { PlainSection } from "./settings-ui";

const KEY = "clearance_card_image";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The image on the clearance card on the app home screen.
 *
 * Its own component because it owns real behaviour — upload to Convex storage,
 * then point the setting at the resulting id — which has nothing in common with
 * the string/number settings the save bar covers. Folding it into that draft
 * would mean "unsaved changes: 1" for a file that has not been uploaded yet.
 *
 * ── Fixes from the previous version ──────────────────────────────────────
 *
 *  - `bg-yellow-500 text-white` on both buttons: not the brand colour, bypasses
 *    the theme, and about 1.9:1 contrast. Now `bg-primary` / `outline`.
 *  - A bare `<img>`, so the preview was unoptimised and shifted layout as it
 *    loaded. Now `next/image` with explicit dimensions.
 *  - Removing the image and clearing a *pending selection* were the same
 *    button, so clicking the X after choosing a file wiped the SAVED image too.
 *    They are now separate: cancel the selection, or remove what is saved.
 *  - The object URL from `URL.createObjectURL` was never revoked, leaking a blob
 *    per file chosen for as long as the page stayed open.
 */
export function ClearanceImageCard() {
  const setting = useQuery(api.data.platform_settings.get, { key: KEY });
  const upsert = useMutation(api.data.platform_settings.upsert);
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);

  const storageId = (setting?.value || undefined) as Id<"_storage"> | undefined;
  const savedUrl = useQuery(
    api.data.files.getImageUrl,
    storageId ? { storageId } : "skip",
  );

  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Revoke the previous object URL whenever the selection changes or the
  // component unmounts. Without this every file chosen leaks a blob.
  useEffect(() => {
    if (!file) {
      setLocalUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const preview = localUrl ?? savedUrl ?? null;
  const loading = setting === undefined;

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    // Reset the input so choosing the same file twice still fires onChange.
    e.target.value = "";
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      toast.error("Image must be under 5MB.");
      return;
    }
    setFile(picked);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error("Upload failed.");
      const { storageId: uploaded } = await result.json();
      await upsert({
        key: KEY,
        value: uploaded,
        description: "Image displayed on the clearance card on the home page",
      });
      setFile(null);
      toast.success("Clearance card image updated");
    } catch (err) {
      toast.error(getConvexErrorMessage(err, "Could not upload the image."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await upsert({
        key: KEY,
        value: "",
        description: "Image displayed on the clearance card on the home page",
      });
      setFile(null);
      toast.success("Clearance card image removed");
    } catch (err) {
      toast.error(getConvexErrorMessage(err, "Could not remove the image."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PlainSection
      title="Clearance card image"
      blurb="Shown on the clearance card on the app home screen. 800×400 or larger, JPEG, PNG or WebP, under 5MB."
    >
      <div className="space-y-4">
        {loading ? (
          <Skeleton className="h-48 w-full max-w-md rounded-lg" />
        ) : preview ? (
          <div className="relative w-full max-w-md overflow-hidden rounded-lg border">
            <Image
              src={preview}
              alt="Clearance card"
              width={800}
              height={400}
              // Unoptimised: the source is either a Convex storage URL or a
              // local blob, neither of which the Next image optimiser can
              // fetch at build time.
              unoptimized
              className="h-48 w-full object-cover"
            />
            {file ? (
              <span className="bg-primary text-primary-foreground absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium">
                Not uploaded yet
              </span>
            ) : null}
          </div>
        ) : (
          <div className="text-muted-foreground flex h-48 w-full max-w-md flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed">
            <HugeiconsIcon icon={ImageIcon} className="size-8" />
            <p className="text-sm">No image set</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" disabled={busy}>
            <label htmlFor="clearance-image" className="cursor-pointer">
              <HugeiconsIcon icon={Upload01Icon} className="size-4" />
              {preview ? "Replace image" : "Choose image"}
            </label>
          </Button>
          <input
            id="clearance-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={choose}
          />

          {/* Uploading and removing are separate actions on separate objects:
              the pending file, and the saved setting. The old single X did both,
              so cancelling a selection also deleted the saved image. */}
          {file ? (
            <>
              <Button size="sm" onClick={upload} disabled={busy}>
                {busy ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    className="size-4 animate-spin"
                  />
                ) : null}
                Upload
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
                disabled={busy}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                Cancel
              </Button>
            </>
          ) : storageId ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </PlainSection>
  );
}
