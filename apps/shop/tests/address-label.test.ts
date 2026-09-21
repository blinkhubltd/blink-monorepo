import { describe, expect, it } from "vitest";

import { pickAddressLabel } from "../lib/address-label";

const POINT = { lat: -1.2921, lng: 36.8219 };

describe("pickAddressLabel", () => {
  it("prefers a saved default address's own name over everything else", () => {
    expect(
      pickAddressLabel({
        defaultAddressLabel: "Home",
        geocoded: "Some other geocoded street",
        denied: false,
        loading: false,
        point: POINT,
      }),
    ).toEqual({ label: "Home", state: "resolved" });
  });

  it("falls back to the reverse-geocoded address when there is no default", () => {
    expect(
      pickAddressLabel({
        defaultAddressLabel: null,
        geocoded: "Kimathi Street, Nairobi",
        denied: false,
        loading: false,
        point: POINT,
      }),
    ).toEqual({ label: "Kimathi Street, Nairobi", state: "resolved" });
  });

  it("reports denied permission distinctly from loading", () => {
    expect(
      pickAddressLabel({
        defaultAddressLabel: null,
        geocoded: null,
        denied: true,
        loading: false,
        point: null,
      }),
    ).toEqual({ label: "Set your location", state: "denied" });
  });

  it("shows a loading label while nothing has resolved yet", () => {
    expect(
      pickAddressLabel({
        defaultAddressLabel: null,
        geocoded: null,
        denied: false,
        loading: true,
        point: null,
      }),
    ).toEqual({ label: "Finding you…", state: "loading" });
  });

  it("falls back to raw coordinates only once a point exists but nothing has geocoded", () => {
    expect(
      pickAddressLabel({
        defaultAddressLabel: null,
        geocoded: null,
        denied: false,
        loading: false,
        point: POINT,
      }),
    ).toEqual({ label: "-1.292, 36.822", state: "loading" });
  });

  it("has no address, no point, and nothing loading as the true empty state", () => {
    expect(
      pickAddressLabel({
        defaultAddressLabel: null,
        geocoded: null,
        denied: false,
        loading: false,
        point: null,
      }),
    ).toEqual({ label: "Set your location", state: "empty" });
  });

  it("rejects an unusable point (0,0) the same as no point at all", () => {
    expect(
      pickAddressLabel({
        defaultAddressLabel: null,
        geocoded: null,
        denied: false,
        loading: false,
        point: { lat: 0, lng: 0 },
      }),
    ).toEqual({ label: "Set your location", state: "empty" });
  });
});
