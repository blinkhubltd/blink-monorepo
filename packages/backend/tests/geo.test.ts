import { describe, expect, it } from "vitest";
import {
  haversineMetres,
  isWithinRadius,
  nearestByDistance,
} from "../convex/lib/geo";

/**
 * The unit is the point of this file. Three distance implementations existed and
 * one of them (`tracking.ts:288-300`) returned KILOMETRES while being compared
 * against `vendors.service_radius`, which is stored in metres — a silent 1000x
 * error. These tests pin the unit so the surviving implementation cannot drift.
 */

// Nairobi CBD and Westlands, ~4.0 km apart.
const NAIROBI = { lat: -1.2864, lng: 36.8172 };
const WESTLANDS = { lat: -1.2673, lng: 36.8065 };

describe("haversineMetres", () => {
  it("returns metres, not kilometres", () => {
    const d = haversineMetres(
      NAIROBI.lat,
      NAIROBI.lng,
      WESTLANDS.lat,
      WESTLANDS.lng,
    );
    // ~2.3 km. If an implementation returned km this would be ~2.3 and fail.
    expect(d).toBeGreaterThan(1_000);
    expect(d).toBeLessThan(5_000);
  });

  it("matches a known distance to within 0.5%", () => {
    // Nairobi -> Mombasa, 440.0 km great-circle.
    const d = haversineMetres(-1.2864, 36.8172, -4.0435, 39.6682);
    expect(d).toBeGreaterThan(440_000 * 0.995);
    expect(d).toBeLessThan(440_000 * 1.005);
  });

  it("is zero for identical points", () => {
    expect(haversineMetres(NAIROBI.lat, NAIROBI.lng, NAIROBI.lat, NAIROBI.lng)).toBe(0);
  });

  it("is symmetric", () => {
    const a = haversineMetres(NAIROBI.lat, NAIROBI.lng, WESTLANDS.lat, WESTLANDS.lng);
    const b = haversineMetres(WESTLANDS.lat, WESTLANDS.lng, NAIROBI.lat, NAIROBI.lng);
    expect(a).toBeCloseTo(b, 6);
  });

  it("handles crossing the equator", () => {
    // Kenya straddles it, so this is a real case rather than a curiosity.
    const d = haversineMetres(-1, 36.8, 1, 36.8);
    expect(d).toBeGreaterThan(220_000);
    expect(d).toBeLessThan(224_000);
  });

  it("handles crossing the 180th meridian", () => {
    const d = haversineMetres(0, 179.5, 0, -179.5);
    // One degree of longitude at the equator, ~111 km — not 39,000 km the
    // long way round.
    expect(d).toBeLessThan(120_000);
  });

  it("handles antipodal points", () => {
    const d = haversineMetres(0, 0, 0, 180);
    // Half the equatorial circumference.
    expect(d).toBeGreaterThan(20_000_000);
    expect(d).toBeLessThan(20_040_000);
  });
});

describe("isWithinRadius", () => {
  it("includes a point exactly at the boundary", () => {
    const d = haversineMetres(
      NAIROBI.lat,
      NAIROBI.lng,
      WESTLANDS.lat,
      WESTLANDS.lng,
    );
    // Inclusive: vendor coverage should not exclude a customer standing exactly
    // on the service radius.
    expect(
      isWithinRadius(WESTLANDS.lat, WESTLANDS.lng, NAIROBI.lat, NAIROBI.lng, d),
    ).toBe(true);
  });

  it("excludes a point just outside", () => {
    const d = haversineMetres(
      NAIROBI.lat,
      NAIROBI.lng,
      WESTLANDS.lat,
      WESTLANDS.lng,
    );
    expect(
      isWithinRadius(
        WESTLANDS.lat,
        WESTLANDS.lng,
        NAIROBI.lat,
        NAIROBI.lng,
        d - 1,
      ),
    ).toBe(false);
  });

  it("a zero radius admits only the exact point", () => {
    expect(isWithinRadius(NAIROBI.lat, NAIROBI.lng, NAIROBI.lat, NAIROBI.lng, 0)).toBe(true);
    expect(isWithinRadius(WESTLANDS.lat, WESTLANDS.lng, NAIROBI.lat, NAIROBI.lng, 0)).toBe(false);
  });
});

describe("nearestByDistance", () => {
  it("picks the closest candidate", () => {
    const result = nearestByDistance(NAIROBI, [
      { item: "far", coords: { lat: -4.0435, lng: 39.6682 } },
      { item: "near", coords: WESTLANDS },
    ]);
    expect(result?.item).toBe("near");
    expect(result?.metres).toBeLessThan(5_000);
  });

  it("returns null for an empty candidate list", () => {
    // Matters: dispatch must distinguish "no eligible rider" from "rider at
    // distance 0" rather than defaulting to one.
    expect(nearestByDistance(NAIROBI, [])).toBeNull();
  });

  it("keeps the first of two equidistant candidates", () => {
    const result = nearestByDistance(NAIROBI, [
      { item: "first", coords: WESTLANDS },
      { item: "second", coords: WESTLANDS },
    ]);
    expect(result?.item).toBe("first");
  });
});
