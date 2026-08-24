import { mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { isRider } from "../lib/roles";

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
