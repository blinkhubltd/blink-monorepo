import { action } from "./_generated/server";
import { v } from "convex/values";

// Reverse geocode lat/lng -> basic address fields using Google Maps Geocoding API.
// Requires SERVER_GOOGLE_MAPS_API_KEY env var.
export const reverseGeocode = action({
  args: { lat: v.float64(), lng: v.float64() },
  handler: async (ctx, args) => {
    const key = process.env.SERVER_GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error("Missing SERVER_GOOGLE_MAPS_API_KEY env var");
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${args.lat},${args.lng}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Geocoding request failed: ${res.status}`);
    }
    const data: any = await res.json();
    if (data.status !== "OK" || !data.results?.length) {
      return {
        address_1: undefined,
        address_2: undefined,
        city: undefined,
        country: undefined,
        raw: data,
      };
    }
    const primary = data.results[0];
    const components: Record<string, string> = {};
    for (const c of primary.address_components) {
      for (const t of c.types) {
        components[t] = c.long_name;
      }
    }
    return {
      address_1: primary.formatted_address,
      address_2: data.results[1]?.formatted_address,
      city:
        components.locality ||
        components.sublocality ||
        components.administrative_area_level_2,
      country: components.country,
      raw: undefined, // omit raw for now to save bandwidth; switch to data if debugging needed
    };
  },
});
