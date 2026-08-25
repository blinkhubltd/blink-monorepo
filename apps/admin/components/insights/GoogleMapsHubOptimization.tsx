"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon as AlertCircle,
  CheckmarkCircle02Icon as CheckCircle,
  Loading03Icon as Loader2,
  Location01Icon as MapPin,
  RefreshIcon as RefreshCw,
  ViewIcon as Eye,
  ViewOffIcon as EyeOff,
} from "@hugeicons/core-free-icons";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { Switch } from "@repo/ui/components/ui/switch";
import { Label } from "@repo/ui/components/ui/label";
import { fetchNairobiWards } from "@/lib/services/nairobi-wards";
import {
  calculateOptimalHubPositions,
  type HubOptimizationResult,
  type Vendor,
} from "@/lib/services/hub-optimization";

interface GoogleMapsHubOptimizationProps {
  vendors: Vendor[];
  onOptimizationComplete?: (results: HubOptimizationResult[]) => void;
}

export default function GoogleMapsHubOptimization({
  vendors,
  onOptimizationComplete,
}: GoogleMapsHubOptimizationProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optimizationResults, setOptimizationResults] = useState<
    HubOptimizationResult[]
  >([]);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Layer visibility states
  const [showWards, setShowWards] = useState(true);
  const [showCurrentHubs, setShowCurrentHubs] = useState(true);
  const [showRecommendedHubs, setShowRecommendedHubs] = useState(true);
  const [showCoverageCircles, setShowCoverageCircles] = useState(true);

  // Store map elements for layer management
  const mapElementsRef = useRef<{
    wardPolygons: google.maps.Polygon[];
    currentHubMarkers: google.maps.Marker[];
    recommendedHubMarkers: google.maps.Marker[];
    coverageCircles: google.maps.Circle[];
  }>({
    wardPolygons: [],
    currentHubMarkers: [],
    recommendedHubMarkers: [],
    coverageCircles: [],
  });

  // Initialize Google Maps
  useEffect(() => {
    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log("🗺️ Initializing Google Maps...");

        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
          throw new Error("Google Maps API key is not configured");
        }

        // Load Google Maps API if not already loaded
        if (!window.google) {
          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
          script.async = true;
          script.defer = true;

          await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = () =>
              reject(new Error("Failed to load Google Maps API"));
            document.head.appendChild(script);
          });
        }

        if (!mapRef.current) {
          throw new Error("Map container not found");
        }

        console.log("🗺️ Creating map instance...");
        const map = new google.maps.Map(mapRef.current, {
          center: { lat: -1.2921, lng: 36.8219 }, // Nairobi center
          zoom: 11,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
        });

        mapInstanceRef.current = map;
        console.log("✅ Google Maps initialized successfully");
        setIsLoading(false);
      } catch (error) {
        console.error("❌ Failed to initialize Google Maps:", error);
        setError(
          error instanceof Error ? error.message : "Failed to initialize map"
        );
        setIsLoading(false);
      }
    };

    initializeMap();
  }, []);

  // Clear all map elements
  const clearMapElements = useCallback(() => {
    const elements = mapElementsRef.current;

    elements.wardPolygons.forEach((polygon) => polygon.setMap(null));
    elements.currentHubMarkers.forEach((marker) => marker.setMap(null));
    elements.recommendedHubMarkers.forEach((marker) => marker.setMap(null));
    elements.coverageCircles.forEach((circle) => circle.setMap(null));

    mapElementsRef.current = {
      wardPolygons: [],
      currentHubMarkers: [],
      recommendedHubMarkers: [],
      coverageCircles: [],
    };
  }, []);

  // Run optimization analysis
  const runOptimization = useCallback(async () => {
    if (!mapInstanceRef.current) {
      setError("Map not initialized");
      return;
    }

    try {
      setIsOptimizing(true);
      setError(null);
      clearMapElements();

      console.log("🌍 Fetching Nairobi wards...");
      const wardData = await fetchNairobiWards();
      console.log(
        `📊 Fetched ${wardData.wards.length} wards:`,
        wardData.wards.slice(0, 3)
      );

      console.log("🎯 Running hub optimization...");
      console.log(
        `👥 Processing ${vendors.length} vendors:`,
        vendors.slice(0, 3)
      );

      const results = await calculateOptimalHubPositions(
        wardData.wards,
        vendors
      );
      console.log(
        `✅ Optimization complete - ${results.length} results:`,
        results.slice(0, 3)
      );

      setOptimizationResults(results);
      onOptimizationComplete?.(results);

      // Always render wards first to verify map is working
      console.log("🗺️ Rendering ward boundaries...");
      renderWards(wardData.wards);

      // Render current hubs if any exist
      if (vendors.length > 0) {
        console.log("🏢 Rendering current hubs...");
        renderCurrentHubs(vendors);
      } else {
        console.log("⚠️ No vendors to render");
      }

      // Render recommended hubs
      const totalRecommendedHubs = results.reduce(
        (total, result) =>
          total +
          result.recommendedHubs.filter((hub) => !hub.isExisting).length,
        0
      );

      if (totalRecommendedHubs > 0) {
        console.log(`💡 Rendering ${totalRecommendedHubs} recommended hubs...`);
        renderRecommendedHubs(results);
      } else {
        console.log("⚠️ No recommended hubs to render");
      }

      // Render coverage circles
      console.log("🎯 Rendering coverage circles...");
      renderCoverageCircles(vendors, results);

      console.log("✅ All rendering complete");
      setIsOptimizing(false);
    } catch (error) {
      console.error("❌ Optimization failed:", error);
      setError(error instanceof Error ? error.message : "Optimization failed");
      setIsOptimizing(false);
    }
  }, [vendors, onOptimizationComplete, clearMapElements]);

  // Render ward boundaries
  const renderWards = useCallback((wards: any[]) => {
    if (!mapInstanceRef.current) return;

    const wardPolygons: google.maps.Polygon[] = [];

    wards.forEach((ward) => {
      if (ward.geometry && ward.geometry.type === "Polygon") {
        const coordinates = ward.geometry.coordinates[0].map(
          (coord: [number, number]) => ({
            lat: coord[1],
            lng: coord[0],
          })
        );

        const polygon = new google.maps.Polygon({
          paths: coordinates,
          strokeColor: "#3B82F6",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#3B82F6",
          fillOpacity: 0, // Remove fill overlay
          map: mapInstanceRef.current,
        });

        // Add click event for ward info
        polygon.addListener("click", () => {
          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="padding: 8px;">
                <h3 style="margin: 0 0 4px 0; font-weight: bold;">${ward.name}</h3>
                <p style="margin: 0; color: #666;">${ward.constituency} Constituency</p>
              </div>
            `,
          });

          const bounds = new google.maps.LatLngBounds();
          coordinates.forEach((coord: { lat: number; lng: number }) =>
            bounds.extend(coord)
          );

          infoWindow.setPosition(bounds.getCenter());
          infoWindow.open(mapInstanceRef.current);
        });

        wardPolygons.push(polygon);
      }
    });

    mapElementsRef.current.wardPolygons = wardPolygons;
  }, []);

  // Render current hub locations
  const renderCurrentHubs = useCallback((vendors: Vendor[]) => {
    if (!mapInstanceRef.current) return;

    const currentHubMarkers: google.maps.Marker[] = [];

    vendors.forEach((vendor) => {
      if (
        vendor.coordinates &&
        vendor.coordinates.lat &&
        vendor.coordinates.lng
      ) {
        const marker = new google.maps.Marker({
          position: {
            lat: vendor.coordinates.lat,
            lng: vendor.coordinates.lng,
          },
          map: mapInstanceRef.current,
          title: vendor.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#10B981",
            fillOpacity: 1,
            strokeColor: "#FFFFFF",
            strokeWeight: 2,
          },
        });

        // Add info window for current hubs
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h3 style="margin: 0 0 4px 0; font-weight: bold;">${vendor.name}</h3>
              <p style="margin: 0; color: #666;">Current Hub</p>
              <p style="margin: 4px 0 0 0; font-size: 12px;">
                Radius: ${vendor.service_radius || 2.5}m
              </p>
            </div>
          `,
        });

        marker.addListener("click", () => {
          infoWindow.open(mapInstanceRef.current, marker);
        });

        currentHubMarkers.push(marker);
      }
    });

    mapElementsRef.current.currentHubMarkers = currentHubMarkers;
  }, []);

  // Render recommended hub locations
  const renderRecommendedHubs = useCallback(
    (results: HubOptimizationResult[]) => {
      if (!mapInstanceRef.current) return;

      const recommendedHubMarkers: google.maps.Marker[] = [];

      results.forEach((result) => {
        result.recommendedHubs.forEach((hub) => {
          if (!hub.isExisting) {
            const marker = new google.maps.Marker({
              position: {
                lat: hub.coordinates[1],
                lng: hub.coordinates[0],
              },
              map: mapInstanceRef.current,
              title: `Recommended Hub - ${result.wardName}`,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: "#F59E0B",
                fillOpacity: 1,
                strokeColor: "#FFFFFF",
                strokeWeight: 2,
              },
            });

            // Add info window for recommended hubs
            const infoWindow = new google.maps.InfoWindow({
              content: `
              <div style="padding: 8px;">
                <h3 style="margin: 0 0 4px 0; font-weight: bold;">Recommended Hub</h3>
                <p style="margin: 0; color: #666;">${result.wardName}, ${result.constituency}</p>
                <p style="margin: 4px 0 0 0; font-size: 12px;">
                  Coverage: ${Math.round(hub.coverage)}% | Radius: ${hub.radius}m
                </p>
              </div>
            `,
            });

            marker.addListener("click", () => {
              infoWindow.open(mapInstanceRef.current, marker);
            });

            recommendedHubMarkers.push(marker);
          }
        });
      });

      mapElementsRef.current.recommendedHubMarkers = recommendedHubMarkers;
    },
    []
  );

  // Render coverage circles
  const renderCoverageCircles = useCallback(
    (vendors: Vendor[], results: HubOptimizationResult[]) => {
      if (!mapInstanceRef.current) return;

      const coverageCircles: google.maps.Circle[] = [];

      // Current hub coverage circles
      vendors.forEach((vendor) => {
        if (
          vendor.coordinates &&
          vendor.coordinates.lat &&
          vendor.coordinates.lng
        ) {
          const circle = new google.maps.Circle({
            center: {
              lat: vendor.coordinates.lat,
              lng: vendor.coordinates.lng,
            },
            radius: (vendor.service_radius || 2.5) * 1000, // Convert km to meters
            map: mapInstanceRef.current,
            fillColor: "#10B981",
            fillOpacity: 0.0, // Much more transparent
            strokeColor: "#10B981",
            strokeOpacity: 0.6, // Make stroke more visible
            strokeWeight: 2, // Thicker stroke
          });

          coverageCircles.push(circle);
        }
      });

      // Recommended hub coverage circles
      results.forEach((result) => {
        result.recommendedHubs.forEach((hub) => {
          if (!hub.isExisting) {
            const circle = new google.maps.Circle({
              center: {
                lat: hub.coordinates[1],
                lng: hub.coordinates[0],
              },
              radius: hub.radius * 1000, // Convert km to meters
              map: mapInstanceRef.current,
              fillColor: "#F59E0B",
              fillOpacity: 0.05, // Much more transparent
              strokeColor: "#F59E0B",
              strokeOpacity: 0.6, // Make stroke more visible
              strokeWeight: 2, // Thicker stroke
            });

            coverageCircles.push(circle);
          }
        });
      });

      mapElementsRef.current.coverageCircles = coverageCircles;
    },
    []
  );

  // Update layer visibility
  useEffect(() => {
    const elements = mapElementsRef.current;

    elements.wardPolygons.forEach((polygon) => polygon.setVisible(showWards));
    elements.currentHubMarkers.forEach((marker) =>
      marker.setVisible(showCurrentHubs)
    );
    elements.recommendedHubMarkers.forEach((marker) =>
      marker.setVisible(showRecommendedHubs)
    );
    elements.coverageCircles.forEach((circle) =>
      circle.setVisible(showCoverageCircles)
    );
  }, [showWards, showCurrentHubs, showRecommendedHubs, showCoverageCircles]);

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-red-600">
            <HugeiconsIcon icon={AlertCircle} className="h-5 w-5" />
            <div>
              <p className="font-medium">Map Error</p>
              <p className="text-sm text-red-500">{error}</p>
            </div>
          </div>
          <Button
            onClick={() => window.location.reload()}
            className="mt-4"
            variant="outline"
            size="sm"
          >
            <HugeiconsIcon icon={RefreshCw} className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={MapPin} className="h-5 w-5" />
            Hub Optimization Map
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={runOptimization}
              disabled={isLoading || isOptimizing}
              className="flex items-center gap-2"
            >
              {isOptimizing ? (
                <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin" />
              ) : (
                <HugeiconsIcon icon={RefreshCw} className="h-4 w-4" />
              )}
              {isOptimizing ? "Optimizing..." : "Run Optimization"}
            </Button>

            {optimizationResults.length > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <HugeiconsIcon icon={CheckCircle} className="h-3 w-3" />
                {optimizationResults.length} wards analyzed
              </Badge>
            )}
          </div>

          {/* Layer Controls */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Switch
                id="wards"
                checked={showWards}
                onCheckedChange={setShowWards}
                className="text-orange-200"
              />
              <Label htmlFor="wards" className="text-sm">
                Ward Boundaries
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="current-hubs"
                checked={showCurrentHubs}
                onCheckedChange={setShowCurrentHubs}
              />
              <Label htmlFor="current-hubs" className="text-sm">
                Current Hubs
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="recommended-hubs"
                checked={showRecommendedHubs}
                onCheckedChange={setShowRecommendedHubs}
              />
              <Label htmlFor="recommended-hubs" className="text-sm">
                Recommended Hubs
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="coverage"
                checked={showCoverageCircles}
                onCheckedChange={setShowCoverageCircles}
              />
              <Label htmlFor="coverage" className="text-sm">
                Coverage Areas
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <div className="relative">
            <div
              ref={mapRef}
              className="w-full h-[600px] rounded-b-lg"
              style={{ minHeight: "600px" }}
            />

            {isLoading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-b-lg">
                <div className="flex items-center gap-3">
                  <HugeiconsIcon icon={Loader2} className="h-6 w-6 animate-spin text-blue-600" />
                  <p className="text-lg font-medium">Loading Google Maps...</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Map Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500/20 border-2 border-blue-500 rounded"></div>
              <span className="text-sm">Ward Boundaries</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
              <span className="text-sm">Current Hubs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded-full border-2 border-white"></div>
              <span className="text-sm">Recommended Hubs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-green-500/50 bg-green-500/10"></div>
              <span className="text-sm">Coverage Areas</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
