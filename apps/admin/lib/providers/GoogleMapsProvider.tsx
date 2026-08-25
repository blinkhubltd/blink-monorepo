"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: string | null;
  google: any;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: null,
  google: null,
});

export const useGoogleMaps = () => {
  const context = useContext(GoogleMapsContext);
  if (!context) {
    throw new Error("useGoogleMaps must be used within GoogleMapsProvider");
  }
  return context;
};

interface GoogleMapsProviderProps {
  children: React.ReactNode;
}

let isLoadingGoogleMaps = false;
let googleMapsPromise: Promise<any> | null = null;

export const GoogleMapsProvider: React.FC<GoogleMapsProviderProps> = ({
  children,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [google, setGoogle] = useState<any>(null);

  useEffect(() => {
    const loadGoogleMaps = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        setLoadError("Google Maps API key is not configured");
        return;
      }

      // Check if Google Maps is already loaded
      if (window.google && window.google.maps && window.google.maps.places) {
        setGoogle(window.google);
        setIsLoaded(true);
        return;
      }

      // Check if we're already loading (prevent multiple loads)
      if (isLoadingGoogleMaps && googleMapsPromise) {
        try {
          await googleMapsPromise;
          setGoogle(window.google);
          setIsLoaded(true);
        } catch (error) {
          setLoadError("Failed to load Google Maps API");
        }
        return;
      }

      // Start loading Google Maps API
      isLoadingGoogleMaps = true;

      googleMapsPromise = new Promise((resolve, reject) => {
        // Create callback function
        const callbackName = `googleMapsCallback_${Date.now()}`;

        (window as any)[callbackName] = () => {
          delete (window as any)[callbackName];
          resolve(window.google);
        };

        // Create and append script
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
        script.async = true;
        script.defer = true;

        script.onerror = () => {
          delete (window as any)[callbackName];
          reject(new Error("Failed to load Google Maps API"));
        };

        document.head.appendChild(script);
      });

      try {
        const googleInstance = await googleMapsPromise;
        setGoogle(googleInstance);
        setIsLoaded(true);
      } catch (error) {
        console.error("Error loading Google Maps:", error);
        setLoadError("Failed to load Google Maps API");
      } finally {
        isLoadingGoogleMaps = false;
      }
    };

    loadGoogleMaps();
  }, []);

  const value: GoogleMapsContextType = {
    isLoaded,
    loadError,
    google,
  };

  return (
    <GoogleMapsContext.Provider value={value}>
      {children}
    </GoogleMapsContext.Provider>
  );
};

export default GoogleMapsProvider;
