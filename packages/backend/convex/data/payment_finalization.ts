import { v, ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { OrderItemWithoutOrderId, OrdersValidator } from "../validators";
import { getNestedString } from "../lib/json";

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

// Create orders and order_items AFTER a verified successful payment.
// Input includes grouped vendor order payloads so multiple vendor orders can be created from a single cart payment.
export const finalizePaidOrders = mutation({
  args: {
    reference: v.string(),
    user_id: v.id("users"),
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
    // 1. Verify payment exists & has been marked Successful (or verify now)
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();

    if (!payment) throw new Error("Payment not found for finalization");
    if (payment.status !== "Successful") {
      throw new Error("Payment not successful yet");
    }

    // 2. Confirm stock reservations (make them permanent after successful payment)
    try {
      await ctx.runMutation(api.data.stock_reservation.confirmPaymentReservation, {
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
    const deriveOrderPaymentMethod = (
      payment: Doc<"payments">,
    ): "Card" | "Mobile Money" | "Bank Transfer" | "Cash on Delivery" => {
      const resp: unknown = payment.paystackResponse;
      const channel =
        getNestedString(resp, ["data", "channel"]) ||
        getNestedString(resp, ["data", "authorization", "channel"]) ||
        "";
      const lower = String(channel).toLowerCase();
      if (lower.includes("mobile") || lower.includes("mpesa"))
        return "Mobile Money";
      if (lower.includes("card")) return "Card";
      if (lower.includes("bank")) return "Bank Transfer";
      return "Card"; // default fallback
    };

    const orderPaymentMethod = deriveOrderPaymentMethod(payment);

    const normalizedInputMethod =
      args.payment_method === "Paystack" ? "Card" : args.payment_method;

    for (const grp of args.orders) {
      // Normalize payment_method in the order object to ensure it's valid
      const normalizedOrder = {
        ...grp.order,
        payment_method: orderPaymentMethod,
      };
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
        await ctx.db.insert("order_items", { ...item, order_id: orderId });
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
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
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
export const finalizePayOnDeliveryOrders = mutation({
  args: {
    user_id: v.id("users"),
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
        ...grp.order,
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
      };

      const orderId = await ctx.db.insert("orders", base);
      for (const item of grp.items) {
        await ctx.db.insert("order_items", { ...item, order_id: orderId });
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
export const finalizePaidClearanceOrders = mutation({
  args: {
    reference: v.string(),
    user_id: v.id("users"),
    orders: v.array(ClearanceOrderGroup),
  },
  handler: async (ctx, args) => {
    // 1. Verify payment
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();

    if (!payment) throw new Error("Payment not found for finalization");
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
    const deriveMethod = (
      p: typeof payment,
    ): "Card" | "Mobile Money" | "Bank Transfer" | "Cash on Delivery" => {
      const resp: unknown = p.paystackResponse;
      const channel =
        getNestedString(resp, ["data", "channel"]) ||
        getNestedString(resp, ["data", "authorization", "channel"]) ||
        "";
      const lc = channel.toLowerCase();
      if (lc.includes("mobile") || lc.includes("mpesa")) return "Mobile Money";
      if (lc.includes("bank")) return "Bank Transfer";
      return "Card";
    };

    const paymentMethod = deriveMethod(payment);
    const customer = await ctx.db.get(args.user_id);
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
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
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
        await ctx.runMutation(api.data.clearance_batching.createAndDispatchBatch, {
          orderIds,
          vendorId: created[0].vendor,
        });
      } catch (e) {
        console.error("[Clearance] Batch creation failed", e);
      }
    } else if (created.length === 1) {
      // Single-vendor → add to pending batch or create new one
      try {
        await ctx.runMutation(api.data.clearance_batching.addOrderToBatch, {
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
export const finalizePayOnDeliveryClearanceOrders = mutation({
  args: {
    user_id: v.id("users"),
    orders: v.array(ClearanceOrderGroup),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.user_id);
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
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();
    if (cart) {
      await ctx.db.patch(cart._id, { items: [], updated_at: Date.now() });
    }

    // ── Clearance Batching ──────────────────────────────────────────────
    if (created.length > 1) {
      const orderIds = created.map((c) => c.orderId);
      try {
        await ctx.runMutation(api.data.clearance_batching.createAndDispatchBatch, {
          orderIds,
          vendorId: created[0].vendor,
        });
      } catch (e) {
        console.error("[Clearance POD] Batch creation failed", e);
      }
    } else if (created.length === 1) {
      try {
        await ctx.runMutation(api.data.clearance_batching.addOrderToBatch, {
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
