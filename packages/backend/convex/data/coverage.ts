import { query } from "../_generated/server";
import { v } from "convex/values";
import { haversineMeters, isWithinRadius } from "../helpers/geo";

// Query returning vendors whose service radius covers the provided point.
// Assumes vendors.service_radius is stored in METERS.
export const vendorsCoveringPoint = query({
  args: {
    lat: v.float64(),
    lng: v.float64(),
  },
  handler: async (ctx, args) => {
    const vendors = await ctx.db
      .query("vendors")
      .filter((q) => q.eq(q.field("status"), "Active"))
      .collect();

    const covering = vendors
      .map((vdr) => {
        const distance = haversineMeters(
          args.lat,
          args.lng,
          vdr.service_center?.lat ?? vdr.coordinates.lat,
          vdr.service_center?.lng ?? vdr.coordinates.lng
        );
        if (distance <= vdr.service_radius) {
          return {
            _id: vdr._id,
            name: vdr.name,
            distanceMeters: Math.round(distance),
            service_radius: vdr.service_radius,
          };
        }
        return null;
      })
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return covering;
  },
});
