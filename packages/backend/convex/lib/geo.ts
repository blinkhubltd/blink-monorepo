/**
 * Geographic helpers. **All distances are METRES.**
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * Three independent distance implementations existed:
 *   1. `helpers/geo.ts` — this one, in metres. Used by `clearanceProducts.ts`,
 *      `coverage.ts`, `products.ts`, `vendors.ts`.
 *   2. `tracking.ts:288-300` — hand-rolled, in KILOMETRES, self-labelled
 *      "(mock calculation)". Deleted; it was silently 1000x off against the
 *      radii stored in `vendors.service_radius`.
 *   3. `geolib.getDistance` at `dispatch.ts:70` and `clearanceBatching.ts:197` —
 *      a third mechanism, and `geolib` was an undeclared dependency in a package
 *      that had no package.json at all.
 *
 * The unit is in the function name for exactly that reason.
 */

const EARTH_RADIUS_METRES = 6_371_000;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METRES * c;
}

/** Retained under the original spelling so existing importers keep compiling. */
export const haversineMeters = haversineMetres;

export function isWithinRadius(
  pointLat: number,
  pointLng: number,
  centerLat: number,
  centerLng: number,
  radiusMetres: number,
): boolean {
  return (
    haversineMetres(pointLat, pointLng, centerLat, centerLng) <= radiusMetres
  );
}

export type Coordinates = { lat: number; lng: number };

/**
 * Nearest candidate by great-circle distance, with its distance.
 *
 * Replaces the verbatim-duplicated rider-eligibility block at
 * `dispatch.ts:64-75` and `clearanceBatching.ts:188-202`. Pure: the caller
 * supplies the already-filtered candidate list.
 */
export function nearestByDistance<T>(
  origin: Coordinates,
  candidates: readonly { item: T; coords: Coordinates }[],
): { item: T; metres: number } | null {
  let best: { item: T; metres: number } | null = null;
  for (const c of candidates) {
    const metres = haversineMetres(
      origin.lat,
      origin.lng,
      c.coords.lat,
      c.coords.lng,
    );
    if (!best || metres < best.metres) best = { item: c.item, metres };
  }
  return best;
}
