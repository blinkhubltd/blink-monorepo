"use client";

import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Banner } from "./types";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface BannerPreviewProps {
  banner: Banner;
}

export function BannerPreview({ banner }: BannerPreviewProps) {
  // Query image for the banner (undefined while loading, string when ready)
  const imageUrl = useQuery(
    api.data.files.getImageUrl,
    banner.image ? { storageId: banner.image } : "skip"
  );

  const isLoading = banner.image && imageUrl === undefined;
  const hasImage = !!imageUrl;

  // Determine overlay position (defaults to centered)
  const overlayPosition = (() => {
    switch (banner.textOverlayPos) {
      case "top-left":
        return "items-start justify-start text-left p-4";
      case "top-right":
        return "items-start justify-end text-right p-4";
      case "bottom-left":
        return "items-end justify-start text-left p-4";
      default:
        return "items-center justify-center text-center p-4";
    }
  })();

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Banner Preview</h3>
      <div className="w-full h-48 bg-gray-100 rounded-lg border overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200" />
        )}
        {hasImage ? (
          <Image
            src={imageUrl as string}
            alt={banner.header || "Banner"}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 600px"
            priority
          />
        ) : !isLoading ? (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-purple-600" />
        ) : null}
        {/* Overlay */}
        <div
          className={cn(
            "absolute inset-0 flex",
            overlayPosition,
            "text-white backdrop-brightness-75"
          )}
        >
          <div className="space-y-2 max-w-[70%]">
            <h2 className="text-xl font-bold drop-shadow-md truncate">
              {banner.header || "Banner"}
            </h2>
            <p className="text-sm opacity-90 drop-shadow-md line-clamp-3">
              {banner.sub_header || "No description"}
            </p>
            {banner.cta_text && (
              <div className="inline-flex items-center px-4 py-2 bg-white text-blue-600 rounded-md text-sm font-medium shadow-lg">
                {banner.cta_text}
              </div>
            )}
          </div>
        </div>
      </div>
      {!hasImage && !isLoading && (
        <p className="text-xs text-muted-foreground">
          No image uploaded for this banner. Showing fallback background.
        </p>
      )}
    </div>
  );
}
