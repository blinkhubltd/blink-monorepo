import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Writing orders from a stored quote. The one place it happens.
 *
 * ── Why this is shared ───────────────────────────────────────────────────
 *
 * There are three ways a basket becomes orders — catalogue pay-on-delivery,
 * catalogue card, clearance card — and they differ only in the payment fields
 * and which items table the lines go into. Everything else is identical: one
 * order per vendor leg, figures straight off the quote, idempotency on the
 * payment reference, basket emptied last.
 *
 * `placeMyOrder` and `placeMyClearanceOrder` were already near-duplicates of
 * each other. Adding a card path would have made three, and money arithmetic
 * copied three times is money arithmetic that will disagree in two places.
 *
 * ── Nothing here comes from the client ───────────────────────────────────
 *
 * Every figure written to `orders` and to the item tables is read off
 * `payment.quote`, priced server-side by `beginCheckout`. The only
 * client-originated values are the delivery address, the receiver contact and
 * the instructions — and by the time this runs those have themselves been
 * stored on the payment row, so the caller of this function supplies no data at
 * all beyond the reference.
 *
 * That last point is what makes the Paystack webhook able to settle a checkout
 * on its own, with the customer's app closed.
 */

/** Where the delivery goes. Stored on the payment row before payment opens. */
export type Fulfilment = NonNullable<Doc<"payments">["fulfilment"]>;

type StoredQuote = NonNullable<Doc<"payments">["quote"]>;

export type WriteResult = {
  orderIds: Id<"orders">[];
  reused: boolean;
};

/**
 * Turn a stored quote into orders.
 *
 * Idempotent on `reference`: a double-tapped button, a retry after a dropped
 * connection, a Paystack webhook retry, and a returning app racing that webhook
 * all converge on the same order set rather than creating a second one. The
 * scan is `orders.by_payment_reference`, the same guard the finalisers used.
 *
 * `mode` decides the payment fields and nothing else:
 *
 *   pay_on_delivery -> Unpaid, Cash on Delivery, no delivery code yet
 *   pay_now         -> Paid, the payment's own method, delivery code minted
 *
 * The delivery code is minted through `orders.generateDeliveryCode`, which also
 * sends it to the customer. It refuses any order that is not a paid `pay_now`
 * one, which is exactly the branch that calls it.
 */
export async function writeOrdersFromQuote(
  ctx: MutationCtx,
  opts: {
    userId: Id<"users">;
    reference: string;
    quote: StoredQuote;
    fulfilment: Fulfilment;
    mode: "pay_now" | "pay_on_delivery";
    /** From the payment row. Ignored for pay-on-delivery, which is always cash. */
    paymentMethod?: Doc<"payments">["payment_method"];
  },
): Promise<WriteResult> {
  const { userId, reference, quote, fulfilment, mode } = opts;

  const existing = await ctx.db
    .query("orders")
    .withIndex("by_payment_reference", (q) =>
      q.eq("payment_reference", reference),
    )
    .collect();
  if (existing.length > 0) {
    return { orderIds: existing.map((o) => o._id), reused: true };
  }

  const isClearance = quote.isClearance === true;
  const paid = mode === "pay_now";
  const now = Date.now();

  // Cash on delivery is cash regardless of what the row says. For a card
  // checkout the row is authoritative: `beginCheckout` writes "Card", and
  // verification may later have revealed the customer actually paid by M-Pesa.
  const paymentMethod: Doc<"payments">["payment_method"] = paid
    ? (opts.paymentMethod ?? "Card")
    : "Cash on Delivery";

  const orderIds: Id<"orders">[] = [];

  for (const leg of quote.legs) {
    const orderId = await ctx.db.insert("orders", {
      // One reference per basket, suffixed per delivery, so a customer with
      // three deliveries can tell a support agent which one they mean.
      reference: `${reference}-${orderIds.length + 1}`,
      order_date: now,
      vendor_id: leg.vendorId,
      user_id: userId,
      service_radius: 0,
      payment_mode: mode,
      order_status: "Confirmed",
      payment_status: paid ? "Paid" : "Unpaid",
      payment_method: paymentMethod,
      // Straight from the quote. Nothing here came from the client.
      subtotal_amount: leg.subtotal,
      tax_amount: quote.tax,
      discount_amount: 0,
      delivery_fee: leg.deliveryFee,
      total_amount: leg.total,
      payment_collected_at: paid ? now : undefined,
      payment_reference: reference,
      idempotency_key: reference,
      address: fulfilment.address,
      receiver_contact: fulfilment.receiverContact,
      special_instructions: fulfilment.specialInstructions || undefined,
      // One order per vendor, each flagged, so picking and dispatch can tell a
      // clearance delivery from a catalogue one.
      is_clearance: isClearance ? true : undefined,
      updated_at: now,
    });

    for (const item of leg.lines) {
      if (isClearance) {
        // Validated against the table rather than cast: a catalogue product id
        // in a clearance quote would otherwise be written into
        // `clearance_order_items` pointing at a row of the wrong shape.
        const clearanceProductId = ctx.db.normalizeId(
          "clearance_products",
          item.productId,
        );
        if (!clearanceProductId) {
          throw new ConvexError(
            "This checkout mixes catalogue items into a clearance basket.",
          );
        }

        await ctx.db.insert("clearance_order_items", {
          order_id: orderId,
          clearance_product_id: clearanceProductId,
          vendor_id: item.vendorId,
          name: item.name,
          sku: item.sku ?? "",
          quantity: item.quantity,
          // As quoted. A listing whose discount is edited afterwards must not
          // rewrite a receipt the customer already holds.
          original_price: item.originalPrice ?? item.unitPrice,
          clearance_price: item.unitPrice,
          discount_percentage: item.discountPercentage ?? 0,
          tax: 0,
          total: item.lineTotal,
          unit_type: item.unitType,
          unit_value: item.unitValue,
          is_picked: false,
          picked_quantity: 0,
        });

        await ctx.scheduler.runAfter(
          0,
          internal.data.clearance_products.decrementStock,
          { id: clearanceProductId, quantity: item.quantity },
        );
      } else {
        // Same validation in the other direction: a stored quote can hold
        // clearance ids, and those belong in `clearance_order_items` with their
        // own price fields.
        const productId = ctx.db.normalizeId("products", item.productId);
        if (!productId) {
          throw new ConvexError(
            "This checkout contains clearance items. Use the clearance checkout.",
          );
        }

        await ctx.db.insert("order_items", {
          order_id: orderId,
          product_id: productId,
          vendor_id: item.vendorId,
          name: item.name,
          sku: "",
          quantity: item.quantity,
          price: item.unitPrice,
          tax: 0,
          discount: 0,
          total: item.lineTotal,
          requires_prescription: item.requiresPrescription,
        });
      }
    }

    orderIds.push(orderId);
  }

  // Emptied only after every order is written, so a failure part-way leaves the
  // basket intact and the idempotency scan above finds what it did create.
  if (isClearance) {
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .first();
    if (cart) await ctx.db.patch(cart._id, { items: [], updated_at: now });
  } else {
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .first();
    if (cart) await ctx.db.patch(cart._id, { products: [], updated_at: now });
  }

  // After the orders exist and are marked Paid, because the mutation refuses
  // any order that is not a paid `pay_now` one. It also sends the code to the
  // customer, which is the point of routing through it rather than patching the
  // field here.
  if (paid) {
    for (const orderId of orderIds) {
      try {
        await ctx.runMutation(internal.data.orders.generateDeliveryCode, {
          orderId,
        });
      } catch (error) {
        // A missing delivery code is recoverable — the rider flow can request
        // one. Losing the order because the notification failed is not.
        console.error(
          `[order_write] delivery code failed for ${orderId}:`,
          error instanceof Error ? error.message : "unknown error",
        );
      }
    }
  }

  return { orderIds, reused: false };
}
