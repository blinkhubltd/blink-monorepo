import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Location from "expo-location";

import { StorageKeys, getJSON, setJSON } from "../lib/storage";

/**
 * Where the customer is, which decides which shops they can order from.
 *
 * ── Persisted, and read back before GPS resolves ──────────────────────────
 *
 * Every catalogue query takes a lat/lng, so with no location there is nothing
 * to show. Asking the OS takes a second or more and can be denied outright, so
 * the last known point is persisted and restored synchronously on mount. The
 * catalogue therefore renders immediately on a reload with the same results as
 * before, which is part of not sending people back to square one.
 *
 * ── This provider never navigates ─────────────────────────────────────────
 *
 * blink-ecommerce's `useLocationChange` called `router.replace` to the home
 * screen after clearing the cart on a location change — one of the eight causes
 * of the refresh-to-home bug. The rule adopted here is that side-effect hooks
 * and providers raise state for a screen to render, and never navigate. A
 * location change sets `changedAt`; the screen that cares shows a banner.
 */

export type Point = { lat: number; lng: number };

type LocationState = {
  /** Null until either a stored point is restored or the OS grants one. */
  point: Point | null;
  /** True while the OS is being asked. Never blocks rendering. */
  requesting: boolean;
  /**
   * Set when permission was explicitly refused, so a screen can explain rather
   * than spin. Distinct from "not asked yet".
   */
  denied: boolean;
  /**
   * Timestamp of the last change to a materially different point. Screens watch
   * this to show "your delivery area changed" rather than being navigated away.
   */
  changedAt: number | null;
  request: () => Promise<void>;
  setManualPoint: (point: Point) => void;
};

const LocationContext = createContext<LocationState | null>(null);

/**
 * How far the point must move to count as a change, in metres.
 *
 * GPS jitters by tens of metres while stationary. Treating every reading as a
 * change would clear the cart and raise a banner at random, which is what makes
 * a location-change handler feel broken.
 */
const CHANGE_THRESHOLD_M = 250;

function roughDistanceMetres(a: Point, b: Point): number {
  // Equirectangular approximation. Only used against a 250 m threshold, where
  // it is accurate to well within the noise, and it avoids pulling a geo
  // dependency into a provider.
  const latRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos(latRad);
  return Math.hypot(dLat, dLng);
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  // Synchronous restore: no loading frame, no flash of an empty catalogue.
  const [point, setPoint] = useState<Point | null>(() =>
    getJSON<Point | null>(StorageKeys.location, null),
  );
  const [requesting, setRequesting] = useState(false);
  const [denied, setDenied] = useState(false);
  const [changedAt, setChangedAt] = useState<number | null>(null);

  const commit = useCallback((next: Point) => {
    setPoint((current) => {
      if (current && roughDistanceMetres(current, next) < CHANGE_THRESHOLD_M) {
        return current;
      }
      // Only a material move counts, and only when there was a previous point —
      // the first fix is not a "change".
      if (current) setChangedAt(Date.now());
      setJSON(StorageKeys.location, next);
      return next;
    });
  }, []);

  const request = useCallback(async () => {
    setRequesting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setDenied(true);
        return;
      }
      setDenied(false);
      const reading = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      commit({
        lat: reading.coords.latitude,
        lng: reading.coords.longitude,
      });
    } catch {
      // A GPS failure is not fatal: a stored point may still be usable, and the
      // customer can set one manually.
    } finally {
      setRequesting(false);
    }
  }, [commit]);

  useEffect(() => {
    // Ask on mount only when there is nothing stored. Re-prompting someone who
    // already has a working location is the kind of thing that gets an app
    // uninstalled.
    if (!point) void request();
  }, [point, request]);

  const value = useMemo<LocationState>(
    () => ({
      point,
      requesting,
      denied,
      changedAt,
      request,
      setManualPoint: commit,
    }),
    [point, requesting, denied, changedAt, request, commit],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useLocation must be used inside <LocationProvider>");
  }
  return ctx;
}
