import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

/**
 * Upload a prescription photo for one shop.
 *
 * ── Three steps, and the middle one is the one that gets skipped ──────────
 *
 * Convex storage uploads are: mint a URL, POST the bytes to it, then hand the
 * returned storage id to a mutation that records what it means. The app this
 * replaces did the first two in `PrescriptionUploadModal` and left the third to
 * whoever mounted it — and only `checkout.tsx` wired it. An upload from anywhere
 * else produced a blob in storage with no `prescriptions` row: paid for, stored,
 * and invisible to every picker queue.
 *
 * Here the three steps are one function, so there is no way to do two of them.
 *
 * ── Failure is reported, including "nobody to review it" ─────────────────
 *
 * `uploadMyPrescription` returns `assigned: false` when no picker is available
 * for that shop. That is not success: the customer would be waiting on a review
 * nobody had been asked for. It is surfaced as its own state.
 */

export type UploadState =
  | { kind: "idle" }
  | { kind: "picking" }
  | { kind: "uploading" }
  | { kind: "done"; prescriptionId: Id<"prescriptions">; assigned: boolean }
  | { kind: "error"; message: string };


export function usePrescriptionUpload() {
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const uploadMyPrescription = useMutation(
    api.data.prescriptions.uploadMyPrescription,
  );

  const [state, setState] = useState<UploadState>({ kind: "idle" });

  const upload = useCallback(
    async (vendorId: Id<"vendors">, source: "camera" | "library") => {
      setState({ kind: "picking" });

      try {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setState({
              kind: "error",
              message:
                "Camera access is off. Allow it in Settings, or choose a photo instead.",
            });
            return;
          }
        }

        const picked =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({
                quality: 0.7,
                // A prescription is a document, so the whole page matters —
                // cropping is left to the customer rather than forced.
                allowsEditing: false,
                exif: false,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                quality: 0.7,
                allowsEditing: false,
                exif: false,
              });

        // Cancelling is not an error. Returning to idle rather than leaving a
        // spinner is the whole point of distinguishing them.
        if (picked.canceled) {
          setState({ kind: "idle" });
          return;
        }

        const asset = picked.assets[0];
        if (!asset) {
          setState({ kind: "error", message: "No photo was returned." });
          return;
        }

        setState({ kind: "uploading" });

        const uploadUrl = await generateUploadUrl({});

        // Fetched as a blob rather than sent as a file path: `fetch` on a local
        // uri works on both platforms, and it keeps the content type the picker
        // reported instead of guessing one.
        const file = await fetch(asset.uri);
        const blob = await file.blob();

        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": asset.mimeType ?? blob.type ?? "image/jpeg" },
          body: blob,
        });

        if (!response.ok) {
          setState({
            kind: "error",
            message: `Upload failed (${response.status}). Check your connection and try again.`,
          });
          return;
        }

        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };

        const result = await uploadMyPrescription({ storageId, vendorId });

        setState({
          kind: "done",
          prescriptionId: result.prescriptionId,
          assigned: result.assigned,
        });
      } catch (caught) {
        setState({
          kind: "error",
          message:
            caught instanceof Error
              ? caught.message
              : "Could not upload that. Try again.",
        });
      }
    },
    [generateUploadUrl, uploadMyPrescription],
  );

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, upload, reset };
}
