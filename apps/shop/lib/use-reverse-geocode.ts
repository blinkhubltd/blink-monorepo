import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@repo/backend";

import { isUsablePoint, type Point } from "./address";

/**
 * A live, human-readable address for whatever point is currently selected —
 * not the customer's saved address book (that's `useAddressLabel`'s job),
 * just "what is this pin, in words". The add/edit-address screen needs this
 * for its own confirmation text, which used to show raw coordinates instead.
 *
 * Cached per point at module scope, same rationale as `use-address-label.ts`:
 * `LocationProvider` already only advances on a >250m move, and re-resolving
 * a point this screen already looked up (a pan back to a previous spot)
 * should cost nothing.
 */
const cache = new Map<string, string | null>();

function pointKey(point: Point): string {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

export function useReverseGeocode(point: Point | null): {
  address: string | null;
  city: string | null;
  loading: boolean;
} {
  const geocode = useAction(api.data.geocode.reverseGeocode);
  const [address, setAddress] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isUsablePoint(point)) {
      lastKey.current = null;
      setAddress(null);
      setCity(null);
      return;
    }
    const key = pointKey(point);
    if (key === lastKey.current) return;
    lastKey.current = key;

    const cached = cache.get(key);
    if (cached !== undefined) {
      setAddress(cached);
      return;
    }

    setLoading(true);
    geocode({ lat: point.lat, lng: point.lng })
      .then((result) => {
        const resolved = result.address_1 ?? null;
        cache.set(key, resolved);
        setAddress(resolved);
        setCity(result.city ?? null);
      })
      .catch(() => {
        cache.set(key, null);
        setAddress(null);
      })
      .finally(() => setLoading(false));
  }, [point, geocode]);

  return { address, city, loading };
}
