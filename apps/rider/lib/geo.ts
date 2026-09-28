/**
 * Distance, as the crow flies.
 *
 * The design shows "3.4 km" on the delivery card and the ride sheet. Nothing
 * in the backend has a road distance, and routing needs a directions service
 * this app does not call, so this is the straight line between where the
 * phone is and where the drop is — labelled "away" wherever it is shown, so it
 * never reads as the length of the route.
 *
 * There is deliberately no ETA here. Turning a straight line into minutes
 * would need a speed, and a guessed speed is a fabricated arrival time: the
 * delivery screen has refused to show one since it was first built, for the
 * same reason.
 */

export interface Point {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: Point, b: Point): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m" under a kilometre, "3.4 km" to one decimal above it. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * A Google Maps directions link to the drop.
 *
 * The design's "View full map" / "Open full map". Handing off to the maps app
 * is what gives the rider turn-by-turn and a real road ETA, which this app
 * cannot compute itself — see the header. `api=1` is the documented,
 * cross-platform URL form: it opens the Google Maps app where installed and
 * the website otherwise, on both iOS and Android.
 */
export function directionsUrl(to: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}&travelmode=driving`;
}
