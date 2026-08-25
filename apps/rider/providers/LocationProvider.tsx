import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useCrew } from "./CrewProvider";
import {
  isLocationReporting,
  startLocationReporting,
  stopLocationReporting,
  type LocationStartResult,
} from "../lib/location-task";

export type LocationShareState =
  | "off"
  | "starting"
  | "on"
  | "foreground_denied"
  | "background_denied"
  | "unavailable";

interface LocationContextValue {
  state: LocationShareState;
  /** True when the reason is a permission the rider can still grant. */
  needsPermission: boolean;
}

const LocationContext = createContext<LocationContextValue>({
  state: "off",
  needsPermission: false,
});

function stateFor(result: LocationStartResult): LocationShareState {
  if (result.started) return "on";
  return result.reason;
}

/**
 * Ties background location to whether the rider is online.
 *
 * Online is the rider's own switch, so it is the consent boundary: going offline
 * stops reporting, and nothing is shared outside a shift. Tracking a rider who
 * has clocked off would be both a battery cost they did not agree to and
 * location data nobody has a reason to hold.
 *
 * Pickers never report. They work inside one building and the hub already knows
 * where that is.
 */
export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { crew, online, gate } = useCrew();
  const [state, setState] = useState<LocationShareState>("off");

  const shouldShare = gate === "ok" && crew?.role === "rider" && online;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!shouldShare) {
        // Also covers the case where the task survived a previous session:
        // registration outlives the process, so a rider who went offline and
        // force-quit would otherwise still be reporting on next launch.
        await stopLocationReporting();
        if (!cancelled) setState("off");
        return;
      }

      if (await isLocationReporting()) {
        if (!cancelled) setState("on");
        return;
      }

      if (!cancelled) setState("starting");
      const result = await startLocationReporting();
      if (!cancelled) setState(stateFor(result));
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldShare]);

  const value = useMemo<LocationContextValue>(
    () => ({
      state,
      needsPermission:
        state === "foreground_denied" || state === "background_denied",
    }),
    [state],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationSharing(): LocationContextValue {
  return useContext(LocationContext);
}
