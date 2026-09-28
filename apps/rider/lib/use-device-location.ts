import { useEffect, useState } from "react";
import * as Location from "expo-location";

import type { Point } from "./geo";

/**
 * Where this phone is, while the calling screen is mounted.
 *
 * For "3.4 km away" on the delivery card and the ride sheet. It never ASKS for
 * permission: `LocationProvider` owns that conversation, including the
 * background grant tracking needs, and a second prompt from a card would be a
 * dialog the rider did not expect from tapping into an order. Without a
 * foreground grant this simply returns null and the distance is left out.
 *
 * Separate from the background reporting task on purpose. That task batches
 * points for the hub and may deliver them minutes late; a distance shown to
 * the rider has to be from where they are standing now.
 *
 * `Balanced` accuracy and a 25 m step: a distance rounded to 0.1 km does not
 * need GPS-grade fixes, and the lower accuracy is kinder to the battery.
 */
export function useDeviceLocation(): Point | null {
  const [point, setPoint] = useState<Point | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (!granted || cancelled) return;
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
          (fix) => {
            setPoint({
              latitude: fix.coords.latitude,
              longitude: fix.coords.longitude,
            });
          },
        );
        // Unmounted while the watch was starting: stop it now rather than
        // leaving a subscription nothing will ever remove.
        if (cancelled) subscription.remove();
      } catch {
        // Location services off, or the platform refused. The distance is an
        // extra; the screen works without it.
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return point;
}
