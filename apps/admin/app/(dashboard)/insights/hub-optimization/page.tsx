"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeftIcon as ArrowLeft } from "@hugeicons/core-free-icons";
import React from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Button } from "@repo/ui/components/ui/button";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Dynamically import the Google Maps component to avoid SSR issues
const VendorRadiusMap = dynamic(
  () => import("@/components/insights/VendorRadiusMap"),
  { ssr: false },
);

export default function HubOptimizationPage() {
  const router = useRouter();

  // Fetch all vendors (includes coordinates, service_center, service_radius, commission, status)
  const vendors = useQuery(api.data.vendors.getAllVendors);

  // Fetch global clearance service radius from platform settings
  const clearanceRadiusSetting = useQuery(api.data.platform_settings.get, {
    key: "clearance_service_radius",
  });

  // Fetch vendor IDs that have clearance products
  const clearanceVendorIds = useQuery(
    api.data.clearance_products.getVendorIdsWithClearanceProducts,
  );

  const isLoading =
    vendors === undefined ||
    clearanceRadiusSetting === undefined ||
    clearanceVendorIds === undefined;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const clearanceRadius = clearanceRadiusSetting?.value
    ? Number(clearanceRadiusSetting.value)
    : 5000;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center space-x-2"
            >
              <HugeiconsIcon icon={ArrowLeft} className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Vendor Service Coverage
              </h1>
              <p className="text-muted-foreground">
                Visualize vendor service radiuses and clearance coverage areas
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Google Maps API Key Warning */}
        {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
          <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-yellow-800 font-medium">
              ⚠️ Google Maps API key is not configured. Add
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local file.
            </p>
          </div>
        )}

        <ErrorBoundary>
          <VendorRadiusMap
            vendors={vendors}
            clearanceVendorIds={new Set(clearanceVendorIds)}
            clearanceRadius={clearanceRadius}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
