"use client";

import React from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/lib/providers/GoogleMapsProvider";

interface MapProps {
  center: {
    lat: number;
    lng: number;
  };
  zoom?: number;
  className?: string;
  markerTitle?: string;
}

const Map: React.FC<MapProps> = ({
  center,
  zoom = 15,
  className = "h-[300px] w-full rounded-lg",
  markerTitle = "Vendor Location",
}) => {
  const containerStyle = {
    width: "100%",
    height: "100%",
    borderRadius: "0.5rem",
  };

  const { isLoaded, loadError } = useGoogleMaps();

  if (loadError) {
    return (
      <div
        className={`bg-gray-100 flex items-center justify-center ${className}`}
      >
        <div className="text-center p-4">
          <p className="text-sm text-gray-500 font-medium">Error Loading Map</p>
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
    <div className={className}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={zoom}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          zoomControl: true,
          disableDefaultUI: false,
        }}
      >
        <Marker position={center} title={markerTitle} />
      </GoogleMap>
    </div>
  );
};

export default Map;
