import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v, ConvexError } from "convex/values";

import { getAuthUser } from "../auth.helpers";

/**
 * Delivery ratings.
 *
 * ── Both functions below used to be public and unauthenticated ────────────
 *
 * `submitRiderRating` checked that the order was Delivered and not yet rated,
 * and nothing else — so any caller with an order id could set a rider's score.
 * Order ids are not secrets, and a rider's rating feeds their standing and their
 * work, so an anonymous write to it is worth more attention than a miscounted
 * fee.
 *
 * `getRiderRatingContext` returned the rider's full name AND phone number to
 * anyone holding an order id. Same leak class as the tracking queries closed
 * earlier: a projection that looks harmless because it is small.
 *
 * Both are internal now. The customer app uses the two auth-derived functions
 * that follow, and neither of those returns a rider's surname or number — the
 * customer already has whatever contact they needed while the parcel was moving;
 * rating it afterwards does not need it again.
 */

const MIN_RATING = 1;
const MAX_RATING = 5;

/** @internal Unauthenticated. Any caller could rate any delivered order. */
export const submitRiderRating = internalMutation({
  args: {
    orderId: v.id("orders"),
    rating: v.number(),
  },
  handler: async (ctx, args) => applyRating(ctx, args.orderId, args.rating),
});

/**
 * @internal Returned the rider's full name and phone number to anyone holding an
 * order id. Use `getMyDeliveryRating`.
 */
export const getRiderRatingContext = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const rider = order.rider_id ? await ctx.db.get(order.rider_id) : null;
    return { order, rider };
  },
});

/**
 * What the rating screen needs, for an order the caller owns.
 *
 * First name only, and no phone. Returns null for an order that is not the
 * caller's — the same response as an order that does not exist, so this cannot
 * be used to discover which order ids are real.
 */
export const getMyDeliveryRating = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const order = await ctx.db.get(args.orderId);
    if (!order || order.user_id !== user._id) return null;

    const rider = order.rider_id ? await ctx.db.get(order.rider_id) : null;
    const riderName = rider
      ? ((rider.first_name ?? rider.name ?? "").trim().split(/\s+/)[0] ?? "")
      : "";

    return {
      orderId: order._id,
      reference: order.reference,
      orderStatus: order.order_status,
      /** Null until rated; the score the customer gave, once they have. */
      myRating: order.rider_rating ?? null,
      /** True only when a rating can still be submitted. */
      canRate:
        order.order_status === "Delivered" &&
        !order.rider_rating &&
        !!order.rider_id,
      riderFirstName: riderName || null,
    };
  },
});

/**
 * Rate the delivery of an order the caller owns.
 *
 * Rejects a second rating rather than overwriting: a rating that can be revised
 * indefinitely is a rating that can be pressured, and the rider has already been
 * paid against the first one.
 */
export const rateMyDelivery = mutation({
  args: {
    orderId: v.id("orders"),
    rating: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const order = await ctx.db.get(args.orderId);
    // Same message either way, so a failed rating does not confirm that
    // somebody else's order exists.
    if (!order || order.user_id !== user._id) {
      throw new ConvexError("Order not found.");
    }

    return applyRating(ctx, args.orderId, args.rating);
  },
});

/**
 * The shared write.
 *
 * Integer-checked: the score is stored on the order and folded into a running
 * average, so a fractional or non-finite rating would corrupt every subsequent
 * average for that rider — and `rating < 1 || rating > 5` alone lets 4.7 and
 * NaN straight through (`NaN` fails both comparisons).
 */
async function applyRating(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  rating: number,
): Promise<
  | { success: false; error: "already_rated" | "no_rider" }
  | { success: true; rating: number; riderRating: number; ratingCount: number }
> {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw new ConvexError("Rating must be a whole number from 1 to 5.");
  }

  const order = await ctx.db.get(orderId);
  if (!order) throw new ConvexError("Order not found.");
  if (order.order_status !== "Delivered") {
    throw new ConvexError("This order has not been delivered yet.");
  }
  if (order.rider_rating) return { success: false, error: "already_rated" };
  if (!order.rider_id) return { success: false, error: "no_rider" };

  const rider = await ctx.db.get(order.rider_id);
  if (!rider) throw new ConvexError("Rider not found.");

  // Narrowed rather than spread through an optional. The previous version
  // spread the optional field behind a cast, so for a user with no rider
  // details it wrote an object missing the required `status` and
  // `vehicle_type` — an invalid document, rejected at runtime, and surfacing to
  // the customer as a failed rating.
  const details = rider.rider_details;
  if (!details) return { success: false, error: "no_rider" };

  const currentRating = details.rating ?? 0;
  const currentCount = details.rating_count ?? 0;
  const newCount = currentCount + 1;
  const newAvg = Number(
    ((currentRating * currentCount + rating) / newCount).toFixed(2),
  );

  await ctx.db.patch(order.rider_id, {
    rider_details: { ...details, rating: newAvg, rating_count: newCount },
    updated_at: Date.now(),
  });
  await ctx.db.patch(orderId, {
    rider_rating: rating,
    updated_at: Date.now(),
  });

  return {
    success: true,
    rating,
    riderRating: newAvg,
    ratingCount: newCount,
  };
}
