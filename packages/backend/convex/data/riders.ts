import { mutation, MutationCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { isRider } from "../lib/roles";
import { getAuthUser } from "../auth.helpers";

/**
 * Sets a named rider's position. Used by the server-key ingest webhook.
 *
 * Takes a client-supplied id and does not check who is calling, so it must not
 * be reachable from a handset — see `reportMyLocation` below, which is the app's
 * entry point.
 *
 * Note this duplicates `data/tracking.updateRiderLocation`, which does the same
 * write with a nested `coordinates` argument and a different default vehicle
 * type ("Bicycle" vs "Motorbike"). Left alone rather than merged here: both have
 * live callers and reconciling the defaults changes what lands on a rider row.
 */
export const updateRiderLocation = mutation({
  args: {
    riderId: v.id("users"),
    lat: v.float64(),
    lng: v.float64(),
  },
  handler: async (ctx, args) => {
    const rider = await ctx.db.get(args.riderId);
    if (!rider || !(await isRider(ctx, rider))) {
      throw new Error("Rider not found");
    }

    const currentDetails = rider.rider_details || {
      vehicle_type: "Motorbike" as const,
      status: "Inactive" as const,
    };

    await ctx.db.patch(args.riderId, {
      rider_details: {
        ...currentDetails,
        coordinates: { lat: args.lat, lng: args.lng },
      },
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Reports the CALLING rider's own position.
 *
 * Deliberately takes no rider id. `updateRiderLocation` above accepts one and
 * only checks that the target is a rider, so any authenticated caller can move
 * any rider on the map — which is worth having for the server-key ingest path
 * (`webhooks/location`), and is not something a phone should be able to do.
 *
 * The background location task calls this one. It cannot report for anyone else,
 * so a compromised handset moves one dot rather than the whole fleet.
 *
 * `recordedAt` is accepted because a background task batches points and may
 * deliver them late — a fix taken two minutes ago should not overwrite a newer
 * one just because it arrived second.
 */
export const reportMyLocation = mutation({
  args: {
    lat: v.float64(),
    lng: v.float64(),
    /** When the fix was taken on the device, not when it arrived. */
    recordedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user: authed } = await getAuthUser(ctx);
    // Re-read the document: getAuthUser narrows to the fields it needs, so
    // rider_details is not usable from its return type.
    const rider = await ctx.db.get(authed._id);
    if (!rider || !(await isRider(ctx, rider))) {
      throw new ConvexError("Only riders report a location");
    }

    // Reject a fix older than the one already stored. Queued points arrive out
    // of order after a tunnel or a dead zone, and the newest position is the
    // only one anybody wants.
    const storedAt = rider.rider_details?.location_updated_at;
    const takenAt = args.recordedAt ?? Date.now();
    if (typeof storedAt === "number" && takenAt < storedAt) {
      return { success: true, stale: true };
    }

    const currentDetails = rider.rider_details ?? {
      vehicle_type: "Motorbike" as const,
      status: "Inactive" as const,
    };

    await ctx.db.patch(rider._id, {
      rider_details: {
        ...currentDetails,
        coordinates: { lat: args.lat, lng: args.lng },
        location_updated_at: takenAt,
      },
      updated_at: Date.now(),
    });

    return { success: true, stale: false };
  },
});
