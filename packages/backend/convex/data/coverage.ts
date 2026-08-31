import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { query } from "../_generated/server";
import { v } from "convex/values";
import { haversineMeters, isWithinRadius } from "../lib/geo";

export interface CoveringVendor {
  _id: Id<"vendors">;
  name: string;
  distanceMeters: number;
  service_radius: number;
}

/**
 * Vendors whose service radius covers a point, read inside the caller's own
 * transaction.
 *
 * Exists so a mutation can enforce coverage without `ctx.runQuery`, which is a
 * second transaction: a vendor deactivated between the check and the write would
 * make the write pass a check that was no longer true. `addresses.saveAddress`
 * and `updateAddress` both hop like that today.
 */
export async function readVendorsCoveringPoint(
  ctx: QueryCtx | MutationCtx,
  point: { lat: number; lng: number },
): Promise<CoveringVendor[]> {
  const vendors = await ctx.db
    .query("vendors")
    .filter((q) => q.eq(q.field("status"), "Active"))
    .collect();

  return vendors
    .map((vdr) => {
      const distance = haversineMeters(
        point.lat,
        point.lng,
        vdr.service_center?.lat ?? vdr.coordinates.lat,
        vdr.service_center?.lng ?? vdr.coordinates.lng,
      );
      if (distance > vdr.service_radius) return null;
      return {
        _id: vdr._id,
        name: vdr.name,
        distanceMeters: Math.round(distance),
        service_radius: vdr.service_radius,
      };
    })
    .filter((c): c is CoveringVendor => c !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// Query returning vendors whose service radius covers the provided point.
// Assumes vendors.service_radius is stored in METERS.
export const vendorsCoveringPoint = query({
  args: {
    lat: v.float64(),
    lng: v.float64(),
  },
  handler: async (ctx, args) =>
    // Delegates, so the query and the in-transaction reader can never drift.
    await readVendorsCoveringPoint(ctx, { lat: args.lat, lng: args.lng }),
});
