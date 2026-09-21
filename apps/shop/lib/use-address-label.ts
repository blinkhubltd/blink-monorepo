import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useAuth } from "@clerk/clerk-expo";

import { isUsablePoint, type Point } from "./address";
import { pickAddressLabel, type AddressLabelState } from "./address-label";
import { useLocation } from "../providers/LocationProvider";

export type { AddressLabelState };

/**
 * The header's address text — never raw coordinates once a real one is known.
 * The precedence rules themselves live in `address-label.ts`, where they can
 * be unit-tested without standing up Convex, Clerk or `LocationProvider`.
 *
 * ── Geocoding is cached per point, not re-run on every render ─────────────
 *
 * `LocationProvider.commit` already only advances `point` on a >250m move, so
 * keying a geocode call off `point` itself (rather than debouncing here too)
 * is enough. The module-level cache below additionally means returning to an
 * already-resolved point — e.g. a re-mount — costs nothing further.
 */

const geocodeCache = new Map<string, string | null>();

function pointKey(point: Point): string {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

export function useAddressLabel(): {
  label: string;
  state: AddressLabelState;
} {
  const { isSignedIn } = useAuth();
  const { point, requesting, denied } = useLocation();
  const geocode = useAction(api.data.geocode.reverseGeocode);
  const addresses = useQuery(
    api.data.addresses.getMyAddresses,
    isSignedIn ? {} : "skip",
  );

  const [geocoded, setGeocoded] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isUsablePoint(point)) return;
    const key = pointKey(point);
    if (key === lastKey.current) return;
    lastKey.current = key;

    const cached = geocodeCache.get(key);
    if (cached !== undefined) {
      setGeocoded(cached);
      return;
    }

    setGeocoding(true);
    geocode({ lat: point.lat, lng: point.lng })
      .then((result) => {
        const address = result.address_1 ?? null;
        geocodeCache.set(key, address);
        setGeocoded(address);
      })
      .catch(() => {
        geocodeCache.set(key, null);
        setGeocoded(null);
      })
      .finally(() => setGeocoding(false));
  }, [point, geocode]);

  const defaultAddress = addresses?.find((a) => a.is_default);

  return pickAddressLabel({
    defaultAddressLabel: defaultAddress ? defaultAddress.label : null,
    geocoded,
    denied,
    loading: requesting || geocoding,
    point,
  });
}
