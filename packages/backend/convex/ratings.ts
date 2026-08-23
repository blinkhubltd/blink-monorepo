import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "./_generated/api";

export const submitRiderRating = mutation({
  args: {
    orderId: v.id("orders"),
    rating: v.number(), // expected 1..5
  },
  handler: async (ctx, args) => {
    if (args.rating < 1 || args.rating > 5) {
      throw new ConvexError("Rating must be between 1 and 5");
    }
    const order: any = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.order_status !== "Delivered") {
      throw new ConvexError("Order not delivered yet");
    }
    if (order.rider_rating) {
      return { success: false, error: "already_rated" };
    }
    if (!order.rider_id) {
      return { success: false, error: "no_rider" };
    }

    const rider: any = await ctx.db.get(order.rider_id);
    if (!rider) throw new Error("Rider not found");
    const currentRating = rider.rider_details?.rating || 0;
    const currentCount = rider.rider_details?.rating_count || 0;
    const newCount = currentCount + 1;
    const newAvg = parseFloat(
      ((currentRating * currentCount + args.rating) / newCount).toFixed(2),
    );

    await (ctx.db.patch as any)(order.rider_id, {
      rider_details: {
        ...rider.rider_details,
        rating: newAvg,
        rating_count: newCount,
      },
      updated_at: Date.now(),
    });
    await (ctx.db.patch as any)(args.orderId, {
      rider_rating: args.rating,
      updated_at: Date.now(),
    });

    return {
      success: true,
      rating: args.rating,
      riderRating: newAvg,
      ratingCount: newCount,
    };
  },
});

// Convenience query to get rider & order rating state (for screen)
export const getRiderRatingContext = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order: any = await ctx.db.get(args.orderId);
    if (!order) return null;
    const rider: any = order.rider_id ? await ctx.db.get(order.rider_id) : null;
    return {
      order: {
        _id: order._id,
        reference: order.reference,
        order_status: order.order_status,
        rider_rating: order.rider_rating,
      },
      rider: rider
        ? {
            _id: rider._id,
            name:
              rider.name ||
              `${rider.first_name || ""} ${rider.last_name || ""}`.trim(),
            image: rider.image || null,
            phone: rider.phone,
            rating: rider.rider_details?.rating || 0,
            rating_count: rider.rider_details?.rating_count || 0,
          }
        : null,
    };
  },
});
