import { describe, expect, it } from "vitest";

import { directionsUrl, distanceKm, formatDistance } from "../lib/geo";

// Westlands and the CBD, Nairobi — about 2.2 km apart in a straight line.
const WESTLANDS = { latitude: -1.2676, longitude: 36.8108 };
const CBD = { latitude: -1.2864, longitude: 36.8172 };

describe("distanceKm", () => {
  it("is zero to itself", () => {
    expect(distanceKm(WESTLANDS, WESTLANDS)).toBe(0);
  });

  it("measures a real Nairobi distance to within a few metres", () => {
    expect(distanceKm(WESTLANDS, CBD)).toBeCloseTo(2.2, 1);
  });

  it("is symmetric", () => {
    expect(distanceKm(WESTLANDS, CBD)).toBeCloseTo(distanceKm(CBD, WESTLANDS), 9);
  });
});

describe("formatDistance", () => {
  it("uses metres under a kilometre, rounded to ten", () => {
    expect(formatDistance(0.854)).toBe("850 m");
    expect(formatDistance(0.001)).toBe("10 m");
  });

  it("uses one decimal of kilometres above", () => {
    expect(formatDistance(3.44)).toBe("3.4 km");
  });

  it("refuses to format nonsense as a distance", () => {
    expect(formatDistance(Number.NaN)).toBe("—");
    expect(formatDistance(-1)).toBe("—");
  });
});

describe("directionsUrl", () => {
  it("is the cross-platform Google Maps directions form", () => {
    expect(directionsUrl(CBD)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-1.2864,36.8172&travelmode=driving",
    );
  });
});
