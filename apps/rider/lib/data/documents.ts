import { useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

/**
 * Rider onboarding data: the signed-in rider's own submitted documents
 * (`user/rider_onboarding.ts`). Lives in `lib/data` with every other backend
 * call the crew app makes, so `tests/no-vendor-leak.test.ts` sees it.
 */
export function useMyRiderOnboarding() {
  return useQuery(api.user.rider_onboarding.getMyRiderOnboarding);
}

export function useSubmitMyRiderDocuments() {
  return useMutation(api.user.rider_onboarding.submitMyRiderDocuments);
}

export type PhotoSource = "camera" | "library";

export type PickedPhoto =
  | { kind: "picked"; storageId: Id<"_storage">; uri: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

/**
 * Take or choose one photo and upload it to Convex storage, returning the
 * storage id to attach. The same three-step dance as the shop's
 * prescription upload (`apps/shop/lib/use-prescription-upload.ts`): a
 * one-time upload URL, a POST of the image bytes, the id that comes back.
 *
 * Attaching the id to the rider is a separate call
 * (`submitMyRiderDocuments`), so a rider can re-take a blurry photo before
 * anything is saved against their account.
 */
export function useDocumentUpload() {
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);

  return useCallback(
    async (source: PhotoSource): Promise<PickedPhoto> => {
      try {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            return {
              kind: "error",
              message:
                "Camera access is off. Allow it in Settings, or choose a photo instead.",
            };
          }
        }

        const picked =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({ quality: 0.7, exif: false })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                quality: 0.7,
                exif: false,
              });
        if (picked.canceled) return { kind: "cancelled" };

        const asset = picked.assets[0];
        if (!asset) return { kind: "error", message: "No photo was returned." };

        const uploadUrl = await generateUploadUrl({});
        const blob = await (await fetch(asset.uri)).blob();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": asset.mimeType ?? blob.type ?? "image/jpeg" },
          body: blob,
        });
        if (!response.ok) {
          return {
            kind: "error",
            message: `Upload failed (${response.status}). Check your connection and try again.`,
          };
        }

        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        return { kind: "picked", storageId, uri: asset.uri };
      } catch {
        return {
          kind: "error",
          message: "Could not upload that photo. Check your connection and try again.",
        };
      }
    },
    [generateUploadUrl],
  );
}
