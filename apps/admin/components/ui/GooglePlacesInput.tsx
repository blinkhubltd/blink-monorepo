"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon as Clock,
  Loading03Icon as Loader2,
  Location01Icon as MapPin,
  NavigationIcon as Navigation,
  Search01Icon as Search,
} from "@hugeicons/core-free-icons";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { Input } from "@repo/ui/components/ui/input";
import { Button } from "@repo/ui/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@repo/ui/components/ui/popover";
import { useGoogleMaps } from "@/lib/providers/GoogleMapsProvider";
import { cn } from "@/lib/utils";

interface PlaceResult {
  address: string;
  placeName?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  addressComponents: {
    address_1: string;
    address_2?: string;
    city: string;
    country: string;
  };
}

interface GooglePlacesInputProps {
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  disabled?: boolean;
  initialValue?: string;
}

/** Splits main_text into plain/bold segments based on matched_substrings. */
function HighlightedText({
  text,
  matches,
}: {
  text: string;
  matches: { offset: number; length: number }[];
}) {
  if (!matches || matches.length === 0) {
    return <span>{text}</span>;
  }

  const segments: { value: string; bold: boolean }[] = [];
  let cursor = 0;
  for (const { offset, length } of matches) {
    if (offset > cursor) {
      segments.push({ value: text.slice(cursor, offset), bold: false });
    }
    segments.push({ value: text.slice(offset, offset + length), bold: true });
    cursor = offset + length;
  }
  if (cursor < text.length) {
    segments.push({ value: text.slice(cursor), bold: false });
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.bold ? (
          <span key={i} className="font-semibold text-foreground">
            {seg.value}
          </span>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  );
}

function parseAddressComponents(addressComponents: any[]) {
  let address_1 = "";
  let address_2 = "";
  let city = "";
  let country = "";

  addressComponents.forEach((component: any) => {
    const types = component.types;
    if (types.includes("street_number")) {
      address_1 = component.long_name + " ";
    } else if (types.includes("route")) {
      address_1 += component.long_name;
    } else if (types.includes("subpremise") || types.includes("premise")) {
      address_2 = component.long_name;
    } else if (
      types.includes("locality") ||
      types.includes("administrative_area_level_2")
    ) {
      city = component.long_name;
    } else if (types.includes("country")) {
      country = component.long_name;
    }
  });

  return { address_1: address_1.trim(), address_2, city, country };
}

export const GooglePlacesInput: React.FC<GooglePlacesInputProps> = ({
  onPlaceSelect,
  placeholder = "Search for vendor location...",
  disabled = false,
  initialValue = "",
}) => {
  const [inputValue, setInputValue] = useState(initialValue);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const placesServiceDivRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoaded, loadError, google } = useGoogleMaps();

  useEffect(() => {
    if (isLoaded && google && !autocompleteServiceRef.current) {
      autocompleteServiceRef.current =
        new google.maps.places.AutocompleteService();
      if (placesServiceDivRef.current) {
        placesServiceRef.current = new google.maps.places.PlacesService(
          placesServiceDivRef.current,
        );
      }
    }
  }, [isLoaded, google]);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  const fetchPredictions = useCallback((query: string) => {
    if (!autocompleteServiceRef.current || query.trim().length < 2) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    autocompleteServiceRef.current.getPlacePredictions(
      { input: query, types: ["establishment", "geocode"] },
      (results: any[] | null, status: string) => {
        if (status === "OK" && results && results.length > 0) {
          setPredictions(results.slice(0, 6));
          setOpen(true);
        } else {
          setPredictions([]);
          setOpen(false);
        }
      },
    );
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchPredictions(value), 300);
  };

  const handleSelectPrediction = (prediction: any) => {
    if (!placesServiceRef.current) return;
    setIsLoading(true);
    setOpen(false);
    setPredictions([]);
    setInputValue(prediction.description);

    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["geometry", "name", "formatted_address", "address_components"],
      },
      (place: any, status: string) => {
        setIsLoading(false);
        if (status !== "OK" || !place?.geometry?.location) return;

        const { address_1, address_2, city, country } = parseAddressComponents(
          place.address_components || [],
        );

        let placeName = place.name || "";
        if (/^[A-Z0-9]{4}\+[A-Z0-9]{2,}/.test(placeName)) placeName = "";
        if (!placeName && place.formatted_address) {
          placeName = place.formatted_address.split(",")[0].trim();
        }

        onPlaceSelect({
          address: place.formatted_address,
          placeName: placeName || undefined,
          coordinates: {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          },
          addressComponents: {
            address_1: address_1 || place.name || "",
            address_2: address_2 || undefined,
            city: city || "Unknown",
            country: country || "Unknown",
          },
        });
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelectPrediction(predictions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (google?.maps) {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode(
            { location: { lat: latitude, lng: longitude } },
            (results: any[], status: string) => {
              setIsLoading(false);
              if (status === "OK" && results[0]) {
                const place = results[0];
                const { address_1, address_2, city, country } =
                  parseAddressComponents(place.address_components || []);
                const placeName =
                  place.formatted_address?.split(",")[0].trim() || "";
                setInputValue(place.formatted_address);
                onPlaceSelect({
                  address: place.formatted_address,
                  placeName: placeName || undefined,
                  coordinates: { lat: latitude, lng: longitude },
                  addressComponents: {
                    address_1: address_1 || "Current Location",
                    address_2: address_2 || undefined,
                    city: city || "Unknown",
                    country: country || "Unknown",
                  },
                });
              } else {
                alert("Could not get address for current location");
              }
            },
          );
        } else {
          setIsLoading(false);
        }
      },
      (error) => {
        setIsLoading(false);
        console.error("Error getting location:", error);
        alert("Error getting your current location");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 },
    );
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <HugeiconsIcon icon={MapPin} className="h-4 w-4 shrink-0" />
        {loadError}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
        <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin" />
        Loading Google Places...
      </div>
    );
  }

  const popoverWidth = containerRef.current?.offsetWidth;

  return (
    <div className="space-y-3">
      {/* Hidden div required by PlacesService */}
      <div ref={placesServiceDivRef} className="hidden" aria-hidden="true" />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div ref={containerRef} className="relative">
            <HugeiconsIcon icon={Search} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (predictions.length > 0) setOpen(true);
              }}
              onBlur={() => {
                // Delay so mousedown on a suggestion fires first
                setTimeout(() => setOpen(false), 150);
              }}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              className="pl-10 pr-10"
              autoComplete="off"
            />
            {isLoading && (
              <HugeiconsIcon icon={Loader2} className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          style={{ width: popoverWidth }}
          className="p-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={() => setOpen(false)}
        >
          <ul role="listbox" className="py-1">
            {predictions.map((prediction, idx) => {
              const main =
                prediction.structured_formatting?.main_text ??
                prediction.description;
              const secondary =
                prediction.structured_formatting?.secondary_text ?? "";
              const matchedSubstrings =
                prediction.structured_formatting
                  ?.main_text_matched_substrings ?? [];

              return (
                <li
                  key={prediction.place_id}
                  role="option"
                  aria-selected={idx === activeIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectPrediction(prediction);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors",
                    idx === activeIndex ? "bg-accent" : "hover:bg-accent",
                    idx !== predictions.length - 1 &&
                      "border-b border-border/50",
                  )}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <HugeiconsIcon icon={MapPin} className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="truncate text-sm text-muted-foreground leading-snug">
                      <HighlightedText
                        text={main}
                        matches={matchedSubstrings}
                      />
                    </p>
                    {secondary && (
                      <p className="truncate text-xs text-muted-foreground/70 leading-snug mt-0.5">
                        {secondary}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-end border-t px-4 py-1.5">
            <span className="text-[10px] text-muted-foreground/60 tracking-wide">
              Powered by Google
            </span>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUseCurrentLocation}
          disabled={disabled || isLoading}
          className="flex items-center gap-2"
        >
          <HugeiconsIcon icon={Navigation} className="h-4 w-4" />
          Use Current Location
        </Button>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin" />
            Getting location...
          </div>
        )}
      </div>
    </div>
  );
};

export default GooglePlacesInput;
