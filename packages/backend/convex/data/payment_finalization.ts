import { v, ConvexError } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { OrderItemWithoutOrderId, OrdersValidator } from "../validators";
import { paymentMethodFromChannel } from "../lib/paystack";
import { getAuthUser } from "../auth.helpers";

/**
 * Order finalisation after payment.
 *
 * Four near-identical mutations, 642 lines, lifted verbatim out of
 * `data/payments.ts`. They differ on exactly two axes — item shape (standard vs
 * clearance) and payment timing (prepaid vs on-delivery) — and share the same
 * spine: look the payment up by reference, guard on its status, scan
 * `by_payment_reference` for idempotency, insert the order, insert the items,
 * mark the payment consumed.
 *
 * Collapsing them into one parameterised `finalizeOrders({ kind, timing })` is
 * the intended end state, and is deliberately NOT done here: this file is a pure
 * move, so the diff stays reviewable. When it happens it needs the
 * extract-then-collapse sequence and a golden-record replay, because these
 * mutations create orders and mark payments consumed, and there are no tests.
 *
 * Note `finalizePayOnDeliveryClearanceOrders` has zero callers in any app —
 * clearance pay-on-delivery is unreachable — so the collapsed version should not
 * try to preserve behaviour that nothing can observe.
 */

/**
 * Idempotency guard for the pay-on-delivery finalisers.
 *
 * The prepaid variants scan `by_payment_reference`; a Paystack reference is
 * unique per checkout, so a resubmitted request finds the existing orders and
 * returns them. Pay-on-delivery orders have no payment and set
 * `payment_reference` to undefined, so they had no equivalent — a double-tapped
 * checkout inserted a second set of orders, and the customer was charged twice
 * on delivery.
 *
 * Returns the already-created orders when `key` has been seen, otherwise null.
 *
 * The key is a required argument on both callers, so there is no unprotected
 * path. It stays a plain string rather than a generated server-side value
 * because only the client knows which submissions are retries of the same
 * checkout and which are a genuine second order.
 */
async function findOrdersByIdempotencyKey(
  ctx: { db: { query: (t: "orders") => any } },
  key: string,
  label: string,
): Promise<{ orderId: Id<"orders">; vendor: Id<"vendors"> }[] | null> {
  const existing = await ctx.db
    .query("orders")
    .withIndex("by_idempotency_key", (q: any) => q.eq("idempotency_key", key))
    .collect();
  if (existing.length === 0) return null;
  console.log(
    `[${label}] idempotency_key ${key} already finalised; returning existing orders`,
  );
  return existing.map((o: Doc<"orders">) => ({
    orderId: o._id,
    vendor: o.vendor_id,
  }));
}

/**
 * The caller, and the assertion that they are finalising their OWN basket.
 *
 * ── What this closes ─────────────────────────────────────────────────────
 *
 * All four finalisers were public with no auth check of any kind, and each took
 * `user_id: v.id("users")` as an ARGUMENT. So an anonymous caller could create
 * orders **as any customer**, at prices of their own choosing, by supplying a
 * user id and a payment reference. These are the real order-creating entry
 * points — `createOrder` has no callers at all — so this is where the money was.
 *
 * `user_id` is now derived from the auth token and the argument is removed
 * rather than accepted-and-ignored, on the same reasoning recorded in
 * `tests/cart-auth-api.test.ts`: a parameter that is accepted but unused invites
 * a later change to start honouring it.
 *
 * For the prepaid paths the payment row is cross-checked too, so a caller cannot
 * finalise against somebody else's payment reference even while authenticated.
 */

/**
 * Replace an order's money with the figures the customer was actually charged.
 *
 * ── Why the client's numbers are discarded, not validated ────────────────
 *
 * The client still describes the SHAPE of each order — address, receiver,
 * payment mode, which items — but every money field is overwritten from the
 * quote stored on the payment row at initiation. Validating instead would mean
 * deciding what to do on a mismatch after the card has already been charged,
 * and both answers are bad: rejecting strands a captured payment with no order,
 * accepting records a total that differs from what was taken.
 *
 * Overwriting has one answer: the orders always sum to the amount charged.
 *
 * Returns the order unchanged when there is no quote — rows created before
 * quotes existed still finalise as they did.
 */
function applyQuoteToOrder<T extends { vendor_id: Id<"vendors"> }>(
  order: T,
  quote: Doc<"payments">["quote"] | undefined,
): T {
  if (!quote) return order;

  const leg = quote.legs.find((l) => l.vendorId === order.vendor_id);
  if (!leg) {
    // A vendor in the submitted orders that the quote never priced. Refusing is
    // right: writing it would create an order nobody paid for.
    throw new ConvexError(
      "This order does not match what was quoted. Please start checkout again.",
    );
  }

  return {
    ...order,
    subtotal_amount: leg.subtotal,
    delivery_fee: leg.deliveryFee,
    // Tax is zero and recorded explicitly, so the assumption is legible rather
    // than inferred from an absent field.
    tax_amount: quote.tax,
    total_amount: leg.total,
  };
}

async function callerFinalising(ctx: MutationCtx) {
  const { user } = await getAuthUser(ctx);
  return user;
}

// Create orders and order_items AFTER a verified successful payment.
// Input includes grouped vendor order payloads so multiple vendor orders can be created from a single cart payment.
export const finalizePaidOrders = internalMutation({
  args: {
    reference: v.string(),
    payment_method: v.union(
      v.literal("Card"),
      v.literal("Mobile Money"),
      v.literal("Cash on Delivery"),
      v.literal("Bank Transfer"),
      // Accept legacy for compatibility; ignored in handler.
      v.literal("Paystack"),
    ),
    orders: v.array(
      v.object({
        order: OrdersValidator,
        items: v.array(OrderItemWithoutOrderId),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const caller = await callerFinalising(ctx);
    // 1. Verify payment exists & has been marked Successful (or verify now)
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();

    if (!payment) throw new Error("Payment not found for finalization");
    // Authentication alone is not enough here: a signed-in customer could
    // otherwise finalise against somebody else's payment reference and have the
    // resulting orders written against their own account.
    if (payment.user_id !== caller._id) {
      throw new ConvexError("This payment belongs to a different customer");
    }
    // The prices the customer agreed to and was charged. Every order written
    // below takes its money from here, not from the request.
    const storedQuote = payment.quote;
    if (payment.status !== "Successful") {
      throw new Error("Payment not successful yet");
    }

    // 2. Confirm stock reservations (make them permanent after successful payment)
    try {
      await ctx.runMutation(internal.data.stock_reservation.confirmPaymentReservation, {
        orderReference: args.reference,
      });
      console.log("Stock reservations confirmed for payment:", args.reference);
    } catch (stockError) {
      console.warn("Stock reservation confirmation failed:", stockError);
      // Continue with order creation even if stock confirmation fails
      // The stock was already reserved during payment initiation
    }

    // Guard: prevent duplicate finalization (idempotency check)
    const existingOrders = await ctx.db
      .query("orders")
      .withIndex("by_payment_reference", (q) =>
        q.eq("payment_reference", args.reference),
      )
      .collect();

    if (existingOrders.length > 0) {
      console.log(
        "Orders already exist for this payment reference, skipping creation",
      );
      return {
        created: existingOrders.map((o) => ({
          orderId: o._id,
          vendor: o.vendor_id,
        })),
      };
    }

    const created: { orderId: Id<"orders">; vendor: Id<"vendors"> }[] = [];
    const orderPaymentMethod = paymentMethodFromChannel(
      payment.paystackResponse,
    );

    const normalizedInputMethod =
      args.payment_method === "Paystack" ? "Card" : args.payment_method;

    for (const grp of args.orders) {
      // Normalize payment_method in the order object to ensure it's valid
      const normalizedOrder = applyQuoteToOrder(
        {
          ...grp.order,
          payment_method: orderPaymentMethod,
        },
        storedQuote,
      );
      const grpWithNormalizedOrder = {
        ...grp,
        order: normalizedOrder,
      };

      // Validate prescription requirements before creating order
      const prescriptionRequiredItems = grpWithNormalizedOrder.items.filter(
        (item) => item.requires_prescription,
      );

      // Look up an approved prescription for this user/vendor pair
      const approvedPrescription = await ctx.db
        .query("prescriptions")
        .withIndex("by_user", (q) =>
          q.eq("user_id", grpWithNormalizedOrder.order.user_id),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("vendor_id"), grpWithNormalizedOrder.order.vendor_id),
            q.eq(q.field("status"), "approved"),
          ),
        )
        .first();

      // If any items require a prescription but none is approved, block the order
      if (prescriptionRequiredItems.length > 0 && !approvedPrescription) {
        throw new ConvexError(
          `Cannot finalize order: Prescription required for ${prescriptionRequiredItems.length} item${
            prescriptionRequiredItems.length > 1 ? "s" : ""
          } but no approved prescription found`,
        );
      }

      // Force payment_status to Paid and map payment_method to allowed enum
      const orderId = await ctx.db.insert("orders", {
        ...grpWithNormalizedOrder.order,
        payment_status: "Paid",
        payment_reference: args.reference,
      });
      for (const item of grpWithNormalizedOrder.items) {
        await ctx.db.insert("order_items", {
          ...item,
          order_id: orderId,
          // Stamp the prescription that authorises this item. The lookup above
          // already resolved it, and the order is blocked when a required
          // prescription is missing, so from here on every
          // prescription-required item carries a link to its document.
          ...(item.requires_prescription && approvedPrescription
            ? { prescription_id: approvedPrescription._id }
            : {}),
        });
      }
      created.push({ orderId, vendor: grpWithNormalizedOrder.order.vendor_id });

      // Check if this order has an approved prescription and assign to picker
      if (approvedPrescription) {
        try {
          await ctx.runMutation(api.data.picker_assignment.assignOrderToPicker, {
            orderId,
            vendorId: grpWithNormalizedOrder.order.vendor_id,
            type: "order",
            prescriptionId: approvedPrescription._id,
          });
        } catch (e) {
          console.error(
            "Failed to assign order with prescription to picker",
            e,
          );
        }
      } else {
        // No approved prescription, use round-robin assignment
        try {
          await ctx.runMutation(api.data.picker_assignment.assignOrderToPicker, {
            orderId,
            vendorId: grpWithNormalizedOrder.order.vendor_id,
            type: "order",
          });
        } catch (e) {
          console.error("Failed to assign order to picker", e);
        }
      }

      // After creating the order, if its status is Pending, confirm it & notify customer
      try {
        const newOrder = await ctx.db.get(orderId);
        if (newOrder && newOrder.order_status === "Pending") {
          await ctx.scheduler.runAfter(
            0,
            api.data.notifications.updateOrderStatusWithNotifications,
            {
              orderId: orderId,
              newStatus: "Confirmed",
            },
          );
        }
      } catch (e) {
        console.error(
          "Failed to auto-confirm newly created paid order & notify",
          e,
        );
      }
    }

    // Nothing else to update in payment record beyond timestamp
    await ctx.db.patch(payment._id, { updated_at: Date.now() });

    // Clear the user's cart now that the orders are successfully created
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", caller._id))
      .first();
    if (cart) {
      await ctx.db.patch(cart._id, { products: [], updated_at: Date.now() });
    }

    return { created };
  },
});

// Finalize orders for pay_on_delivery (no upfront payment). Allows creating one or more
// vendor orders directly with payment_status = Unpaid and order_status Confirmed.
// Useful for cash/card on delivery flows where stock reservation may have been handled separately.

// Finalize orders for pay_on_delivery (no upfront payment). Allows creating one or more
// vendor orders directly with payment_status = Unpaid and order_status Confirmed.
// Useful for cash/card on delivery flows where stock reservation may have been handled separately.
export const finalizePayOnDeliveryOrders = internalMutation({
  args: {
    /**
     * Required. See OrdersValidator.idempotency_key — and the note on the
     * clearance variant for why this is not optional.
     */
    idempotency_key: v.string(),
    /**
     * The reference returned by `checkout.beginCheckout`.
     *
     * Required, not optional. It is how the server-priced quote is found, and
     * an optional-and-sometimes-honoured price source is the shape that let the
     * client set its own prices in the first place. Safe to require: this
     * mutation has no callers outside this repo.
     */
    reference: v.string(),
    orders: v.array(
      v.object({
        order: OrdersValidator,
        items: v.array(OrderItemWithoutOrderId),
      }),
    ),
    payment_method: v.union(
      v.literal("Cash on Delivery"),
      v.literal("Card"),
      v.literal("Mobile Money"),
      v.literal("Bank Transfer"),
    ),
  },
  handler: async (ctx, args) => {
    const caller = await callerFinalising(ctx);

    // Nothing has been charged on this path, but the prices still must not come
    // from the client. The quote was priced and stored when checkout began.
    const quotePayment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (!quotePayment) {
      throw new ConvexError(
        "No checkout was started for this order. Please try again.",
      );
    }
    if (quotePayment.user_id !== caller._id) {
      throw new ConvexError("This checkout belongs to a different customer");
    }
    const storedQuote = quotePayment.quote;

    const alreadyDone = await findOrdersByIdempotencyKey(
      ctx,
      args.idempotency_key,
      "finalizePayOnDeliveryOrders",
    );
    if (alreadyDone) return { created: alreadyDone };

    const created: Array<{ orderId: Id<"orders">; vendor: Id<"vendors"> }> = [];

    for (const grp of args.orders) {
      const prescriptionRequiredItems = grp.items.filter(
        (item) => item.requires_prescription,
      );

      // Look up an approved prescription for this user/vendor pair
      const approvedPrescription = await ctx.db
        .query("prescriptions")
        .withIndex("by_user", (q) => q.eq("user_id", grp.order.user_id))
        .filter((q) =>
          q.and(
            q.eq(q.field("vendor_id"), grp.order.vendor_id),
            q.eq(q.field("status"), "approved"),
          ),
        )
        .first();

      // If any items require a prescription but none is approved, block the order
      if (prescriptionRequiredItems.length > 0 && !approvedPrescription) {
        throw new ConvexError(
          `Cannot finalize order: Prescription required for ${prescriptionRequiredItems.length} item${
            prescriptionRequiredItems.length > 1 ? "s" : ""
          } but no approved prescription found`,
        );
      }

      const base: typeof grp.order = {
        ...applyQuoteToOrder(grp.order, storedQuote),
        payment_mode: "pay_on_delivery",
        payment_status: "Unpaid",
        order_status:
          grp.order.order_status === "Pending"
            ? "Confirmed"
            : grp.order.order_status,
        payment_reference: undefined,
        delivery_code: undefined,
        delivery_code_verified: false,
        updated_at: Date.now(),
        payment_method: args.payment_method,
        idempotency_key: args.idempotency_key,
      };

      const orderId = await ctx.db.insert("orders", base);
      for (const item of grp.items) {
        await ctx.db.insert("order_items", {
          ...item,
          order_id: orderId,
          // Stamp the prescription that authorises this item. The lookup above
          // already resolved it, and the order is blocked when a required
          // prescription is missing, so from here on every
          // prescription-required item carries a link to its document.
          ...(item.requires_prescription && approvedPrescription
            ? { prescription_id: approvedPrescription._id }
            : {}),
        });
      }
      created.push({ orderId, vendor: base.vendor_id });

      if (approvedPrescription) {
        try {
          await ctx.runMutation(api.data.picker_assignment.assignOrderToPicker, {
            orderId,
            vendorId: base.vendor_id,
            type: "order",
            prescriptionId: approvedPrescription._id,
          });
        } catch (e) {
          console.error(
            "Failed to assign order with prescription to picker",
            e,
          );
        }
      } else {
        // No approved prescription, use round-robin assignment
        try {
          await ctx.runMutation(api.data.picker_assignment.assignOrderToPicker, {
            orderId,
            vendorId: base.vendor_id,
            type: "order",
          });
        } catch (e) {
          console.error("Failed to assign order to picker", e);
        }
      }

      try {
        if (base.order_status === "Confirmed") {
          await ctx.scheduler.runAfter(
            0,
            api.data.notifications.updateOrderStatusWithNotifications,
            { orderId, newStatus: "Confirmed" },
          );
        }
      } catch (e) {
        console.error("Failed to schedule confirmation notification", e);
      }
    }

    // Clear the cart, as every other finalisation path does.
    //
    // This was missing here and only here: the prepaid standard path clears
    // `cart`, and both clearance paths clear `clearance_cart`. So a customer who
    // completed a cash-on-delivery order was left with their cart still full,
    // and the next visit looked like the order had not gone through.
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", caller._id))
      .first();
    if (cart) {
      await ctx.db.patch(cart._id, { products: [], updated_at: Date.now() });
    }

    return { created };
  },
});

// ── Clearance Order Finalization ───────────────────────────────────────────────

const ClearanceItemArg = v.object({
  clearance_product_id: v.id("clearance_products"),
  quantity: v.number(),
  clearance_price: v.float64(),
  original_price: v.float64(),
  discount_percentage: v.float64(),
  name: v.string(),
  sku: v.string(),
  vendor_id: v.id("vendors"),
  unit_type: v.optional(v.string()),
  unit_value: v.optional(v.float64()),
});

const ClearanceOrderGroup = v.object({
  order: OrdersValidator,
  clearance_items: v.array(ClearanceItemArg),
});

/**
 * Finalize Paystack-paid clearance orders (one or more vendor groups).
 * Verifies payment server-side, creates orders, decrements stock, assigns pickers.
 */

/**
 * Finalize Paystack-paid clearance orders (one or more vendor groups).
 * Verifies payment server-side, creates orders, decrements stock, assigns pickers.
 */
export const finalizePaidClearanceOrders = internalMutation({
  args: {
    reference: v.string(),
    orders: v.array(ClearanceOrderGroup),
  },
  handler: async (ctx, args) => {
    const caller = await callerFinalising(ctx);
    // 1. Verify payment
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();

    if (!payment) throw new Error("Payment not found for finalization");
    // Authentication alone is not enough here: a signed-in customer could
    // otherwise finalise against somebody else's payment reference and have the
    // resulting orders written against their own account.
    if (payment.user_id !== caller._id) {
      throw new ConvexError("This payment belongs to a different customer");
    }
    // The prices the customer agreed to and was charged. Every order written
    // below takes its money from here, not from the request.
    const storedQuote = payment.quote;
    if (payment.status !== "Successful")
      throw new Error("Payment not yet verified as successful");

    // 2. Idempotency guard — if ANY order with this reference exists, skip creation
    const existingOrders = await ctx.db
      .query("orders")
      .withIndex("by_payment_reference", (q) =>
        q.eq("payment_reference", args.reference),
      )
      .collect();

    if (existingOrders.length > 0) {
      return {
        created: existingOrders.map((o) => ({
          orderId: o._id,
          vendor: o.vendor_id,
        })),
      };
    }

    // 3. Derive payment method from Paystack response
    const paymentMethod = paymentMethodFromChannel(payment.paystackResponse);
    const customer = await ctx.db.get(caller._id);
    const customerName = customer
      ? customer.name ||
        `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
      : "";

    const created: Array<{ orderId: Id<"orders">; vendor: Id<"vendors"> }> = [];

    for (const grp of args.orders) {
      const vendor = await ctx.db.get(grp.order.vendor_id);

      const orderData = {
        ...grp.order,
        is_clearance: true as const,
        payment_status: "Paid" as const,
        payment_reference: args.reference,
        payment_method: paymentMethod as any,
        payment_mode: "pay_now" as const,
        updated_at: Date.now(),
        searchText: [
          grp.order.reference,
          customerName,
          customer?.email ?? "",
          vendor?.name ?? "",
        ]
          .join(" ")
          .trim(),
      };

      const orderId = await ctx.db.insert("orders", orderData);

      for (const item of grp.clearance_items) {
        await ctx.db.insert("clearance_order_items", {
          order_id: orderId,
          clearance_product_id: item.clearance_product_id,
          vendor_id: item.vendor_id,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          original_price: item.original_price,
          clearance_price: item.clearance_price,
          discount_percentage: item.discount_percentage,
          tax: 0,
          total: item.clearance_price * item.quantity,
          unit_type: item.unit_type,
          unit_value: item.unit_value,
          is_picked: false,
          picked_quantity: 0,
        });

        const prod = await ctx.db.get(item.clearance_product_id);
        if (prod) {
          const newQty = Math.max(0, prod.quantity - item.quantity);
          await ctx.db.patch(item.clearance_product_id, {
            quantity: newQty,
            status: newQty === 0 ? ("Sold Out" as const) : prod.status,
            updated_at: Date.now(),
          });
        }
      }

      try {
        await ctx.runMutation(api.data.picker_assignment.assignOrderToPicker, {
          orderId,
          vendorId: grp.order.vendor_id,
          type: "order",
        });
      } catch (e) {
        console.error("[Clearance] Picker assignment failed", e);
      }

      try {
        await ctx.scheduler.runAfter(
          0,
          api.data.notifications.updateOrderStatusWithNotifications,
          { orderId, newStatus: "Confirmed" },
        );
      } catch (e) {
        console.error("[Clearance] Auto-confirm notification failed", e);
      }

      created.push({ orderId, vendor: grp.order.vendor_id });
    }

    // Clear clearance cart
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", caller._id))
      .first();
    if (cart) {
      await ctx.db.patch(cart._id, { items: [], updated_at: Date.now() });
    }

    await ctx.db.patch(payment._id, { updated_at: Date.now() });

    // ── Clearance Batching ──────────────────────────────────────────────
    // Multi-vendor: create batch immediately and dispatch
    // Single-vendor: add to existing batch or create one with wait timeout
    if (created.length > 1) {
      // Multi-vendor checkout → instant batch with all order IDs
      const orderIds = created.map((c) => c.orderId);
      try {
        await ctx.runMutation(internal.data.clearance_batching.createAndDispatchBatch, {
          orderIds,
          vendorId: created[0].vendor,
        });
      } catch (e) {
        console.error("[Clearance] Batch creation failed", e);
      }
    } else if (created.length === 1) {
      // Single-vendor → add to pending batch or create new one
      try {
        await ctx.runMutation(internal.data.clearance_batching.addOrderToBatch, {
          orderId: created[0].orderId,
          vendorId: created[0].vendor,
        });
      } catch (e) {
        console.error("[Clearance] Add to batch failed", e);
      }
    }

    return { created };
  },
});

/**
 * Finalize pay-on-delivery clearance orders (one or more vendor groups).
 * No upfront payment; orders are marked Confirmed immediately.
 */

/**
 * Finalize pay-on-delivery clearance orders (one or more vendor groups).
 * No upfront payment; orders are marked Confirmed immediately.
 */
export const finalizePayOnDeliveryClearanceOrders = internalMutation({
  args: {
    /**
     * Required. See OrdersValidator.idempotency_key.
     *
     * A stable per-checkout string the client generates once and reuses on
     * retry. Without it a resubmitted request creates duplicate orders that the
     * customer is then charged for on delivery, so it is required rather than
     * optional — a caller that omits it is rejected at the argument boundary
     * with a message naming the field, which is a better failure than a silent
     * duplicate.
     */
    idempotency_key: v.string(),
    orders: v.array(ClearanceOrderGroup),
  },
  handler: async (ctx, args) => {
    const caller = await callerFinalising(ctx);
    const alreadyDone = await findOrdersByIdempotencyKey(
      ctx,
      args.idempotency_key,
      "finalizePayOnDeliveryClearanceOrders",
    );
    if (alreadyDone) return { created: alreadyDone };

    const customer = await ctx.db.get(caller._id);
    const customerName = customer
      ? customer.name ||
        `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
      : "";

    const created: Array<{ orderId: Id<"orders">; vendor: Id<"vendors"> }> = [];

    for (const grp of args.orders) {
      const vendor = await ctx.db.get(grp.order.vendor_id);

      const orderData = {
        ...grp.order,
        is_clearance: true as const,
        payment_mode: "pay_on_delivery" as const,
        payment_status: "Unpaid" as const,
        order_status: "Confirmed" as const,
        payment_reference: undefined,
        idempotency_key: args.idempotency_key,
        delivery_code_verified: false,
        updated_at: Date.now(),
        searchText: [
          grp.order.reference,
          customerName,
          customer?.email ?? "",
          vendor?.name ?? "",
        ]
          .join(" ")
          .trim(),
      };

      const orderId = await ctx.db.insert("orders", orderData);

      for (const item of grp.clearance_items) {
        await ctx.db.insert("clearance_order_items", {
          order_id: orderId,
          clearance_product_id: item.clearance_product_id,
          vendor_id: item.vendor_id,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          original_price: item.original_price,
          clearance_price: item.clearance_price,
          discount_percentage: item.discount_percentage,
          tax: 0,
          total: item.clearance_price * item.quantity,
          unit_type: item.unit_type,
          unit_value: item.unit_value,
          is_picked: false,
          picked_quantity: 0,
        });

        const prod = await ctx.db.get(item.clearance_product_id);
        if (prod) {
          const newQty = Math.max(0, prod.quantity - item.quantity);
          await ctx.db.patch(item.clearance_product_id, {
            quantity: newQty,
            status: newQty === 0 ? ("Sold Out" as const) : prod.status,
            updated_at: Date.now(),
          });
        }
      }

      try {
        await ctx.runMutation(api.data.picker_assignment.assignOrderToPicker, {
          orderId,
          vendorId: grp.order.vendor_id,
          type: "order",
        });
      } catch (e) {
        console.error("[Clearance POD] Picker assignment failed", e);
      }

      try {
        await ctx.scheduler.runAfter(
          0,
          api.data.notifications.updateOrderStatusWithNotifications,
          { orderId, newStatus: "Confirmed" },
        );
      } catch (e) {
        console.error("[Clearance POD] Confirm notification failed", e);
      }

      created.push({ orderId, vendor: grp.order.vendor_id });
    }

    // Clear clearance cart
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", caller._id))
      .first();
    if (cart) {
      await ctx.db.patch(cart._id, { items: [], updated_at: Date.now() });
    }

    // ── Clearance Batching ──────────────────────────────────────────────
    if (created.length > 1) {
      const orderIds = created.map((c) => c.orderId);
      try {
        await ctx.runMutation(internal.data.clearance_batching.createAndDispatchBatch, {
          orderIds,
          vendorId: created[0].vendor,
        });
      } catch (e) {
        console.error("[Clearance POD] Batch creation failed", e);
      }
    } else if (created.length === 1) {
      try {
        await ctx.runMutation(internal.data.clearance_batching.addOrderToBatch, {
          orderId: created[0].orderId,
          vendorId: created[0].vendor,
        });
      } catch (e) {
        console.error("[Clearance POD] Add to batch failed", e);
      }
    }

    return { created };
  },
});
