"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon as AlertCircle,
  Loading03Icon as Loader2,
  Location01Icon as MapPin,
  RefreshIcon as RefreshCw,
} from "@hugeicons/core-free-icons";
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@repo/backend";
import { haversineMeters } from "@/lib/validators";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { Switch } from "@repo/ui/components/ui/switch";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

// Golden angle in degrees for maximum color separation
const GOLDEN_ANGLE = 137.508;

interface VendorData {
  _id: string;
  name: string;
  industry_id?: string;
  coordinates: { lat: number; lng: number };
  service_center?: { lat: number; lng: number } | null;
  service_radius: number;
  commission: number;
  commission_type: "percentage" | "fixed";
  status: "Active" | "Inactive";
}

interface VendorRadiusMapProps {
  vendors: VendorData[];
  clearanceVendorIds: Set<string>;
  clearanceRadius: number;
}

/** Generate a unique HSL color for a vendor based on index using golden angle distribution. */
function getVendorColor(index: number): string {
  const hue = (index * GOLDEN_ANGLE) % 360;
  return `hsl(${hue}, 70%, 45%)`;
}

/** Convert HSL string to hex for Google Maps. */
function hslToHex(index: number): string {
  const hue = (index * GOLDEN_ANGLE) % 360;
  const s = 0.7;
  const l = 0.45;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;
  if (hue < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hue < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hue < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hue < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function VendorRadiusMap({
  vendors,
  clearanceVendorIds,
  clearanceRadius,
}: VendorRadiusMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toggle states
  const [showServiceRadius, setShowServiceRadius] = useState(true);
  const [showClearanceRadius, setShowClearanceRadius] = useState(true);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "Active" | "Inactive"
  >("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");

  // Edit mode: drag-and-drop service center placement
  const [editMode, setEditMode] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{
    vendorId: string;
    vendorName: string;
    mode: "move" | "create";
    lat: number;
    lng: number;
    originalPosition: { lat: number; lng: number } | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const updateVendor = useMutation(api.data.vendors.updateVendor);

  // Fetch industries for the filter dropdown
  const industries = useQuery(api.data.industry.getAllIndustries);

  // Map elements refs
  const serviceCirclesRef = useRef<google.maps.Circle[]>([]);
  const clearanceCirclesRef = useRef<google.maps.Circle[]>([]);
  const vendorMarkersRef = useRef<google.maps.Marker[]>([]);
  const serviceCenterMarkersRef = useRef<
    (google.maps.Marker & { __vendorId?: string })[]
  >([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const pendingMarkerRef = useRef<google.maps.Marker | null>(null);
  const placementBoundaryRef = useRef<google.maps.Circle | null>(null);
  const pendingEditRef = useRef<typeof pendingEdit>(null);

  useEffect(() => {
    pendingEditRef.current = pendingEdit;
  }, [pendingEdit]);

  // Vendor color mapping (stable as long as vendor list doesn't change)
  const vendorColorMap = useMemo(() => {
    const map = new Map<string, { hex: string; index: number }>();
    vendors.forEach((v, i) => {
      map.set(v._id, { hex: hslToHex(i), index: i });
    });
    return map;
  }, [vendors]);

  // Filter vendors by status and industry
  const filteredVendors = useMemo(() => {
    return vendors.filter((v) => {
      const statusMatch = statusFilter === "all" || v.status === statusFilter;
      const industryMatch =
        industryFilter === "all" || v.industry_id === industryFilter;
      return statusMatch && industryMatch;
    });
  }, [vendors, statusFilter, industryFilter]);

  // Get circle center for a vendor
  const getCircleCenter = (vendor: VendorData) => {
    if (
      vendor.service_center &&
      vendor.service_center.lat &&
      vendor.service_center.lng
    ) {
      return { lat: vendor.service_center.lat, lng: vendor.service_center.lng };
    }
    return { lat: vendor.coordinates.lat, lng: vendor.coordinates.lng };
  };

  // Initialize Google Maps
  useEffect(() => {
    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
          throw new Error("Google Maps API key is not configured");
        }

        // Load Google Maps API if not already loaded
        if (!window.google) {
          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
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

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: -1.2921, lng: 36.8219 },
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
        setIsLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to initialize map",
        );
        setIsLoading(false);
      }
    };

    initializeMap();
  }, []);

  // Clear all map elements
  const clearAllElements = useCallback(() => {
    serviceCirclesRef.current.forEach((c) => c.setMap(null));
    clearanceCirclesRef.current.forEach((c) => c.setMap(null));
    vendorMarkersRef.current.forEach((m) => m.setMap(null));
    serviceCenterMarkersRef.current.forEach((m) => m.setMap(null));
    if (infoWindowRef.current) infoWindowRef.current.close();
    if (pendingMarkerRef.current) pendingMarkerRef.current.setMap(null);
    if (placementBoundaryRef.current) placementBoundaryRef.current.setMap(null);

    serviceCirclesRef.current = [];
    clearanceCirclesRef.current = [];
    vendorMarkersRef.current = [];
    serviceCenterMarkersRef.current = [];
    pendingMarkerRef.current = null;
    placementBoundaryRef.current = null;
    setPendingEdit(null);
    setSaveError(null);
  }, []);

  // Build info window content for a single vendor
  const buildVendorInfoContent = (vendor: VendorData) => {
    const commissionDisplay =
      vendor.commission_type === "percentage"
        ? `${vendor.commission}%`
        : `KES ${vendor.commission.toLocaleString()}`;

    const statusColor = vendor.status === "Active" ? "#16a34a" : "#dc2626";
    const radiusKm = (vendor.service_radius / 1000).toFixed(1);

    return `
      <div style="padding: 8px; min-width: 180px;">
        <h3 style="margin: 0 0 6px 0; font-weight: 600; font-size: 14px;">${vendor.name}</h3>
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; color: white; background: ${statusColor};">${vendor.status}</span>
        </div>
        <p style="margin: 4px 0; font-size: 12px; color: #555;">Commission: <strong>${commissionDisplay}</strong></p>
        <p style="margin: 4px 0; font-size: 12px; color: #555;">Service Radius: <strong>${radiusKm} km</strong></p>
      </div>
    `;
  };

  // Build info content for multiple overlapping vendors
  const buildMultiVendorInfoContent = (vendorsAtPoint: VendorData[]) => {
    const only = vendorsAtPoint[0];
    if (vendorsAtPoint.length === 1 && only) {
      return buildVendorInfoContent(only);
    }

    const items = vendorsAtPoint
      .map((v) => {
        const commissionDisplay =
          v.commission_type === "percentage"
            ? `${v.commission}%`
            : `KES ${v.commission.toLocaleString()}`;
        const statusColor = v.status === "Active" ? "#16a34a" : "#dc2626";
        const color = vendorColorMap.get(v._id)?.hex ?? "#666";
        const radiusKm = (v.service_radius / 1000).toFixed(1);

        return `
          <div style="padding: 6px 0; border-bottom: 1px solid #eee;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color};"></span>
              <strong style="font-size: 13px;">${v.name}</strong>
              <span style="display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 10px; color: white; background: ${statusColor};">${v.status}</span>
            </div>
            <p style="margin: 2px 0 0 16px; font-size: 11px; color: #555;">Commission: ${commissionDisplay} · Radius: ${radiusKm} km</p>
          </div>
        `;
      })
      .join("");

    return `
      <div style="padding: 8px; min-width: 220px; max-height: 300px; overflow-y: auto;">
        <h3 style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px;">${vendorsAtPoint.length} Overlapping Vendors</h3>
        ${items}
      </div>
    `;
  };

  // Find all vendors whose service circle contains a given point
  const findVendorsAtPoint = useCallback(
    (latLng: google.maps.LatLng) => {
      return filteredVendors.filter((vendor) => {
        const center = getCircleCenter(vendor);
        const centerLatLng = new google.maps.LatLng(center.lat, center.lng);
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
          latLng,
          centerLatLng,
        );
        return distance <= vendor.service_radius;
      });
    },
    [filteredVendors],
  );

  // Render all map elements when filtered vendors or map changes
  const renderMap = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    clearAllElements();

    const bounds = new google.maps.LatLngBounds();
    let hasElements = false;

    // 1. Render clearance circles FIRST (underneath)
    filteredVendors.forEach((vendor) => {
      if (!clearanceVendorIds.has(vendor._id)) return;

      const center = getCircleCenter(vendor);
      const circle = new google.maps.Circle({
        center,
        radius: clearanceRadius,
        map: showClearanceRadius ? map : null,
        fillColor: "#F59E0B",
        fillOpacity: 0.06,
        strokeColor: "#F59E0B",
        strokeOpacity: 0.4,
        strokeWeight: 1.5,
        clickable: false,
        zIndex: 1,
      });

      clearanceCirclesRef.current.push(circle);
      bounds.extend(center);
      hasElements = true;
    });

    // 2. Render service radius circles
    filteredVendors.forEach((vendor) => {
      const center = getCircleCenter(vendor);
      const colorHex = vendorColorMap.get(vendor._id)?.hex ?? "#3B82F6";

      const circle = new google.maps.Circle({
        center,
        radius: vendor.service_radius,
        map: showServiceRadius ? map : null,
        fillColor: colorHex,
        fillOpacity: 0.12,
        strokeColor: colorHex,
        strokeOpacity: 0.7,
        strokeWeight: 2,
        clickable: true,
        zIndex: 2,
      });

      // Click handler — in edit mode with no service center yet, create one; otherwise show info
      circle.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;

        if (editMode && !vendor.service_center) {
          if (pendingEditRef.current) return; // another edit already in progress

          const lat = e.latLng.lat();
          const lng = e.latLng.lng();

          const newMarker = new google.maps.Marker({
            position: { lat, lng },
            map,
            draggable: true,
            title: `${vendor.name} (New Service Center)`,
            icon: {
              path: "M-4,-4 L4,-4 L4,4 L-4,4 Z",
              scale: 1.5,
              fillColor: colorHex,
              fillOpacity: 1,
              strokeColor: "#FFFFFF",
              strokeWeight: 2,
            },
            zIndex: 12,
          });

          const updateFromEvent = (evt: google.maps.MapMouseEvent) => {
            if (!evt.latLng) return;
            setPendingEdit({
              vendorId: vendor._id,
              vendorName: vendor.name,
              mode: "create",
              lat: evt.latLng.lat(),
              lng: evt.latLng.lng(),
              originalPosition: null,
            });
          };

          newMarker.addListener("drag", updateFromEvent);
          newMarker.addListener("dragend", updateFromEvent);

          pendingMarkerRef.current = newMarker;
          setPendingEdit({
            vendorId: vendor._id,
            vendorName: vendor.name,
            mode: "create",
            lat,
            lng,
            originalPosition: null,
          });
          return;
        }

        const vendorsAtClick = findVendorsAtPoint(e.latLng);
        const content =
          vendorsAtClick.length > 0
            ? buildMultiVendorInfoContent(vendorsAtClick)
            : buildVendorInfoContent(vendor);

        if (infoWindowRef.current) infoWindowRef.current.close();
        const infoWindow = new google.maps.InfoWindow({
          content,
          position: e.latLng,
        });
        infoWindow.open(map);
        infoWindowRef.current = infoWindow;
      });

      serviceCirclesRef.current.push(circle);
      bounds.extend(center);
      hasElements = true;
    });

    // 3. Render vendor location markers
    filteredVendors.forEach((vendor) => {
      const colorHex = vendorColorMap.get(vendor._id)?.hex ?? "#3B82F6";

      const marker = new google.maps.Marker({
        position: vendor.coordinates,
        map: showServiceRadius ? map : null,
        title: vendor.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: colorHex,
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 2,
        },
        zIndex: 10,
      });

      marker.addListener("click", () => {
        if (infoWindowRef.current) infoWindowRef.current.close();
        const infoWindow = new google.maps.InfoWindow({
          content: buildVendorInfoContent(vendor),
        });
        infoWindow.open(map, marker);
        infoWindowRef.current = infoWindow;
      });

      vendorMarkersRef.current.push(marker);
      bounds.extend(vendor.coordinates);
      hasElements = true;

      // 4. Render service center marker (different shape) if present
      if (
        vendor.service_center &&
        vendor.service_center.lat &&
        vendor.service_center.lng
      ) {
        const scMarker: google.maps.Marker & { __vendorId?: string } =
          new google.maps.Marker({
            position: vendor.service_center,
            map: showServiceRadius ? map : null,
            draggable: editMode,
            title: editMode
              ? `${vendor.name} (drag to reposition)`
              : `${vendor.name} (Service Center)`,
            icon: {
              path: "M-4,-4 L4,-4 L4,4 L-4,4 Z", // Square
              scale: 1.5,
              fillColor: colorHex,
              fillOpacity: 1,
              strokeColor: "#FFFFFF",
              strokeWeight: 2,
            },
            zIndex: 11,
          });
        scMarker.__vendorId = vendor._id;

        scMarker.addListener("click", () => {
          if (editMode) return;
          if (infoWindowRef.current) infoWindowRef.current.close();
          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="padding: 8px;">
                <h3 style="margin: 0 0 4px 0; font-weight: 600; font-size: 14px;">${vendor.name}</h3>
                <p style="margin: 0; font-size: 12px; color: #555;">Service Center Location</p>
              </div>
            `,
          });
          infoWindow.open(map, scMarker);
          infoWindowRef.current = infoWindow;
        });

        const handleServiceCenterDrag = (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          if (
            pendingEditRef.current &&
            pendingEditRef.current.vendorId !== vendor._id
          ) {
            return;
          }
          setPendingEdit({
            vendorId: vendor._id,
            vendorName: vendor.name,
            mode: "move",
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
            originalPosition: vendor.service_center ?? null,
          });
        };

        scMarker.addListener("dragstart", handleServiceCenterDrag);
        scMarker.addListener("drag", handleServiceCenterDrag);
        scMarker.addListener("dragend", handleServiceCenterDrag);

        serviceCenterMarkersRef.current.push(scMarker);
        bounds.extend(vendor.service_center);
      }
    });

    // Fit bounds to show all elements
    if (hasElements) {
      map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
    }
  }, [
    filteredVendors,
    clearanceVendorIds,
    clearanceRadius,
    showServiceRadius,
    showClearanceRadius,
    editMode,
    vendorColorMap,
    clearAllElements,
    findVendorsAtPoint,
  ]);

  // Re-render when map is ready and dependencies change
  useEffect(() => {
    if (!isLoading && mapInstanceRef.current) {
      renderMap();
    }
  }, [isLoading, renderMap]);

  // Lock other markers while one pending edit is in progress
  useEffect(() => {
    serviceCenterMarkersRef.current.forEach((m) => {
      if (!editMode) return;
      const isBeingEdited =
        !pendingEdit || m.__vendorId === pendingEdit.vendorId;
      m.setDraggable(isBeingEdited);
    });
  }, [pendingEdit, editMode]);

  // Draw the "allowed placement zone" boundary circle (radius around the
  // vendor's main coordinates) while a service-center edit is in progress
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (placementBoundaryRef.current) {
      placementBoundaryRef.current.setMap(null);
      placementBoundaryRef.current = null;
    }
    if (!map || !pendingEdit) return;

    const vendor = vendors.find((v) => v._id === pendingEdit.vendorId);
    if (!vendor) return;

    const distance = haversineMeters(
      pendingEdit.lat,
      pendingEdit.lng,
      vendor.coordinates.lat,
      vendor.coordinates.lng,
    );
    const withinRadius = distance <= vendor.service_radius;

    placementBoundaryRef.current = new google.maps.Circle({
      center: vendor.coordinates,
      radius: vendor.service_radius,
      map,
      fillOpacity: 0,
      strokeColor: withinRadius ? "#3B82F6" : "#DC2626",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      clickable: false,
      zIndex: 20,
    });
  }, [pendingEdit, vendors]);

  // Save / cancel handlers for the pending service-center edit
  const handleSavePendingEdit = async () => {
    if (!pendingEdit) return;

    setSaving(true);
    setSaveError(null);
    try {
      await updateVendor({
        id: pendingEdit.vendorId as Parameters<
          typeof updateVendor
        >[0]["id"],
        service_center: { lat: pendingEdit.lat, lng: pendingEdit.lng },
      });
      pendingMarkerRef.current?.setMap(null);
      pendingMarkerRef.current = null;
      setPendingEdit(null);
    } catch (err) {
      setSaveError(
        err instanceof ConvexError
          ? String(err.data)
          : "Failed to save service center",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPendingEdit = () => {
    if (!pendingEdit) return;

    if (pendingEdit.mode === "create") {
      pendingMarkerRef.current?.setMap(null);
      pendingMarkerRef.current = null;
    } else if (pendingEdit.originalPosition) {
      const marker = serviceCenterMarkersRef.current.find(
        (m) => m.__vendorId === pendingEdit.vendorId,
      );
      marker?.setPosition(pendingEdit.originalPosition);
    }

    setPendingEdit(null);
    setSaveError(null);
  };

  // Toggle visibility without re-rendering
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    serviceCirclesRef.current.forEach((c) =>
      c.setMap(showServiceRadius ? map : null),
    );
    vendorMarkersRef.current.forEach((m) =>
      m.setMap(showServiceRadius ? map : null),
    );
    serviceCenterMarkersRef.current.forEach((m) =>
      m.setMap(showServiceRadius ? map : null),
    );
  }, [showServiceRadius]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    clearanceCirclesRef.current.forEach((c) =>
      c.setMap(showClearanceRadius ? map : null),
    );
  }, [showClearanceRadius]);

  if (error) {
    return (
      <Card>
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
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HugeiconsIcon icon={MapPin} className="h-5 w-5" />
            Map Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-6">
            {/* Service Radius Toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="service-radius"
                checked={showServiceRadius}
                onCheckedChange={setShowServiceRadius}
              />
              <Label htmlFor="service-radius" className="text-sm font-medium">
                Service Radiuses
              </Label>
            </div>

            {/* Clearance Radius Toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="clearance-radius"
                checked={showClearanceRadius}
                onCheckedChange={setShowClearanceRadius}
              />
              <Label htmlFor="clearance-radius" className="text-sm font-medium">
                Clearance Radiuses
              </Label>
            </div>

            {/* Edit Mode Toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-mode"
                checked={editMode}
                onCheckedChange={(checked) => {
                  setEditMode(checked);
                  if (!checked) handleCancelPendingEdit();
                }}
              />
              <Label htmlFor="edit-mode" className="text-sm font-medium">
                Edit Service Centers
              </Label>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <Label className="text-sm font-medium">Status:</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as "all" | "Active" | "Inactive")
                }
              >
                <SelectTrigger className="w-[130px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Industry Filter */}
            <div className="flex items-center space-x-2">
              <Label className="text-sm font-medium">Industry:</Label>
              <Select
                value={industryFilter}
                onValueChange={(v) => setIndustryFilter(v)}
              >
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries</SelectItem>
                  {(industries ?? []).map((industry) => (
                    <SelectItem key={industry._id} value={industry._id}>
                      {industry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stats */}
            <div className="ml-auto flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">
                {filteredVendors.length} vendor
                {filteredVendors.length !== 1 ? "s" : ""}
              </Badge>
              {clearanceVendorIds.size > 0 && (
                <Badge variant="outline" className="text-xs">
                  {
                    [...clearanceVendorIds].filter((id) =>
                      filteredVendors.some((v) => v._id === id),
                    ).length
                  }{" "}
                  with clearance
                </Badge>
              )}
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
              className="w-full h-[650px] rounded-lg"
              style={{ minHeight: "650px" }}
            />

            {isLoading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                <div className="flex items-center gap-3">
                  <HugeiconsIcon icon={Loader2} className="h-6 w-6 animate-spin text-blue-600" />
                  <p className="text-lg font-medium">Loading map...</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pending service-center edit — kept out of the map's own box so it
          never covers the pin/radius the admin is dragging */}
      {pendingEdit &&
        (() => {
          const vendor = vendors.find((v) => v._id === pendingEdit.vendorId);
          const distance = vendor
            ? haversineMeters(
                pendingEdit.lat,
                pendingEdit.lng,
                vendor.coordinates.lat,
                vendor.coordinates.lng,
              )
            : 0;
          const withinRadius = vendor ? distance <= vendor.service_radius : true;

          return (
            <Card className="border-2 border-blue-500/50">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {pendingEdit.mode === "create"
                      ? "New service center"
                      : "Moving service center"}{" "}
                    — {pendingEdit.vendorName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Lat: {pendingEdit.lat.toFixed(6)} · Lng:{" "}
                    {pendingEdit.lng.toFixed(6)}
                  </p>
                  <Badge
                    variant={withinRadius ? "secondary" : "destructive"}
                    className="text-xs"
                  >
                    {Math.round(distance)}m from main location
                    {!withinRadius && " — outside service radius"}
                  </Badge>
                  {saveError && (
                    <p className="text-xs text-red-600">{saveError}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelPendingEdit}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSavePendingEdit}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <HugeiconsIcon icon={Loader2} className="h-3 w-3 mr-1 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()}

      {/* Legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500/20"></div>
              <span>Service Radius (unique color per vendor)</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-amber-500/50 bg-amber-500/10"
                style={{ borderStyle: "dashed" }}
              ></div>
              <span>
                Clearance Radius ({(clearanceRadius / 1000).toFixed(0)} km)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-600 border-2 border-white"></div>
              <span>Vendor Location</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gray-600 border-2 border-white"></div>
              <span>Service Center</span>
            </div>
            {editMode && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-blue-500"></div>
                <span>Allowed placement zone (while editing)</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
