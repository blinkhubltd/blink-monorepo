"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon as X } from "@hugeicons/core-free-icons";
import React, { useCallback, useMemo, useState } from "react";
import { GoogleMap, Marker, Circle } from "@react-google-maps/api";
import { useGoogleMaps } from "@/lib/providers/GoogleMapsProvider";
import { haversineMeters } from "@/lib/validators";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";

interface LatLng {
  lat: number;
  lng: number;
}

interface ServiceCenterMapPickerProps {
  center: LatLng;
  radius: number;
  value: LatLng | null | undefined;
  panTo?: LatLng | null;
  onChange: (coords: LatLng) => void;
  onClear: () => void;
  className?: string;
}

const containerStyle = {
  width: "100%",
  height: "100%",
  borderRadius: "0.5rem",
};

export default function ServiceCenterMapPicker({
  center,
  radius,
  value,
  panTo,
  onChange,
  onClear,
  className = "h-[350px] w-full rounded-lg",
}: ServiceCenterMapPickerProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const hasMainLocation = center.lat !== 0 || center.lng !== 0;
  const markerPosition = value ?? center;

  const distance = useMemo(() => {
    if (!value) return 0;
    return haversineMeters(value.lat, value.lng, center.lat, center.lng);
  }, [value, center]);

  const withinRadius = !value || distance <= radius;

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  React.useEffect(() => {
    if (map && panTo) {
      map.panTo(panTo);
    }
  }, [map, panTo]);

  const handleDragEnd = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  if (!hasMainLocation) {
    return (
      <div
        className={`bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center ${className}`}
      >
        <p className="text-sm text-gray-500 text-center px-4">
          Set the vendor&apos;s main location above before placing a service
          center.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className={`bg-gray-100 flex items-center justify-center ${className}`}
      >
        <div className="text-center p-4">
          <p className="text-sm text-gray-500 font-medium">
            Error Loading Map
          </p>
          <p className="text-xs text-gray-400 mt-1">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className={`bg-gray-100 flex items-center justify-center ${className}`}
      >
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={className}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={14}
          onLoad={onLoad}
          onUnmount={onUnmount}
          onClick={handleMapClick}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            zoomControl: true,
          }}
        >
          <Circle
            center={center}
            radius={radius}
            options={{
              fillColor: withinRadius ? "#3B82F6" : "#DC2626",
              fillOpacity: 0.1,
              strokeColor: withinRadius ? "#3B82F6" : "#DC2626",
              strokeOpacity: 0.5,
              strokeWeight: 1.5,
              clickable: false,
            }}
          />
          <Marker
            position={markerPosition}
            draggable
            onDragEnd={handleDragEnd}
            title="Service Center (drag to reposition)"
          />
        </GoogleMap>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Lat:</span>
          <Input
            type="number"
            step="any"
            value={markerPosition.lat}
            onChange={(e) =>
              onChange({
                lat: parseFloat(e.target.value) || 0,
                lng: markerPosition.lng,
              })
            }
            className="h-7 w-28 text-xs"
          />
          <span className="text-muted-foreground">Lng:</span>
          <Input
            type="number"
            step="any"
            value={markerPosition.lng}
            onChange={(e) =>
              onChange({
                lat: markerPosition.lat,
                lng: parseFloat(e.target.value) || 0,
              })
            }
            className="h-7 w-28 text-xs"
          />
        </div>

        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 text-xs text-muted-foreground"
          >
            <HugeiconsIcon icon={X} className="h-3 w-3 mr-1" />
            Clear service center
          </Button>
        )}
      </div>

      {value && (
        <p
          className={`text-xs ${withinRadius ? "text-green-600" : "text-red-600 font-medium"}`}
        >
          {Math.round(distance)}m from main location
          {!withinRadius && ` — outside the ${radius}m service radius`}
        </p>
      )}
    </div>
  );
}
