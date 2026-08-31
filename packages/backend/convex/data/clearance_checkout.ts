import { v, ConvexError } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getAuthUser } from "../auth.helpers";
import { readClearanceDeliveryPricing } from "./platform_settings";
import {
  QuoteError,
  buildClearanceQuote,
  quoteMatchesExpected,
  type CheckoutQuote,
  type ResolvedLine,
} from "../lib/checkout_quote";

/**
 * Clearance checkout — the same shape as the regular one, and deliberately not
 * the same code path.
 *
 * ── What it replaces ─────────────────────────────────────────────────────
 *
 * `orders.createClearanceOrder` took a whole client-built order object plus its
 * items, had no auth, and — worse than the regular path — wrote **one** order
 * for a basket whose items could span several vendors. It computed the delivery
 * fee from the distinct vendor count and then attributed the entire order to a
 * single `vendor_id`, so a two-shop clearance basket became one order that one
 * shop was expected to fulfil in full. Here, as in the regular path, each vendor
 * gets its own order.
 *
 * ── Why a separate module rather than a flag ─────────────────────────────
 *
 * Clearance items live in their own table with their own price fields, their own
 * expiry and display window, their own stock, and their own delivery rule: the
 * free-delivery threshold does not apply. Threading all of that through the
 * regular checkout as conditionals is how the one rule that must not leak — the
 * waiver — gets leaked. `buildClearanceQuote` takes no threshold at all.
 *
 * The pricing, storage and replay design is identical, and for the same reason:
 * price once at initiation, store the quote on the payment row, charge exactly
 * that, and write orders from the stored quote so a retry replays rather than
 * re-prices.
 */

const MAX_LINES = 50;

/** Resolve the caller's clearance basket against current listings. */
async function resolveMyClearanceBasket(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{ lines: ResolvedLine[]; unavailable: string[] }> {
  const cart = await ctx.db
    .query("clearance_cart")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .first();

  if (!cart || cart.items.length === 0) {
    return { lines: [], unavailable: [] };
  }

  const now = Date.now();
  const lines: ResolvedLine[] = [];
  const unavailable: string[] = [];

  for (const entry of cart.items.slice(0, MAX_LINES)) {
    const product = await ctx.db.get(entry.clearance_product_id);
    if (!product) {
      unavailable.push("A deal in your basket has been removed");
      continue;
    }

    // The display window is a clearance-only rule and it is enforced here
    // rather than in `buildClearanceQuote`, which is pure and has no clock. An
    // expired listing is reported as unavailable rather than priced at whatever
    // it last cost.
    const expired = product.display_end_date <= now;
    if (expired) {
      unavailable.push(`${product.name}: this deal has ended`);
    }

    lines.push({
      productId: product._id,
      vendorId: product.vendor_id,
      name: product.name,
      quantity: entry.quantity,
      // The clearance price, read from the listing. Never the original price,
      // and never anything the client sent.
      price: product.clearance_price,
      // Expiry folded into status, so the pure builder needs no clock: an
      // expired listing is simply not Active as far as pricing is concerned.
      status: expired ? "Expired" : product.status,
      available: product.quantity,
      requiresPrescription: false,
      originalPrice: product.original_price,
      discountPercentage: product.discount_percentage,
      sku: product.sku,
      unitType: product.unit_type,
      unitValue: product.unit_value,
    });
  }

  return { lines, unavailable };
}

function priceOrThrow(
  lines: ResolvedLine[],
  settings: { baseFee: number; extraVendorFee: number },
): CheckoutQuote {
  try {
    return buildClearanceQuote(lines, settings);
  } catch (error) {
    if (error instanceof QuoteError) throw new ConvexError(error.message);
    throw error;
  }
}

/** What the caller's clearance basket would cost right now. */
export const quoteMyClearanceBasket = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return null;

    const { lines, unavailable } = await resolveMyClearanceBasket(ctx, user._id);
    if (lines.length === 0) return null;

    const settings = await readClearanceDeliveryPricing(ctx);
    try {
      const quote = buildClearanceQuote(lines, settings);
      const soldOut = lines
        .filter((l) => l.status === "Active" && l.available <= 0)
        .map((l) => `${l.name}: sold out`);
      return { quote, unavailable: [...unavailable, ...soldOut] };
    } catch {
      // An unpriceable basket is a state the screen renders, not an error.
      return null;
    }
  },
});

/**
 * Price the clearance basket, record the quote, and hand back the amount.
 *
 * Idempotent on the reference, exactly as `beginCheckout` is: a retried tap must
 * not create a second payment row and must not re-price.
 */
export const beginClearanceCheckout = mutation({
  args: {
    reference: v.string(),
    paymentMode: v.union(v.literal("pay_now"), v.literal("pay_on_delivery")),
    expectedTotal: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const existing = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (existing) {
      if (existing.user_id !== user._id) {
        throw new ConvexError("That payment reference belongs to someone else");
      }
      return {
        reference: existing.reference,
        amount: existing.amount,
        quote: existing.quote ?? null,
        reused: true as const,
      };
    }

    const { lines } = await resolveMyClearanceBasket(ctx, user._id);
    if (lines.length === 0) {
      throw new ConvexError("Your clearance basket is empty");
    }

    const settings = await readClearanceDeliveryPricing(ctx);
    const quote = priceOrThrow(lines, settings);

    if (!quoteMatchesExpected(quote, args.expectedTotal)) {
      throw new ConvexError(
        `The price changed while you were checking out. Your basket now comes to ${quote.total}. Review it and try again.`,
      );
    }

    const customerEmail = typeof user.email === "string" ? user.email : "";
    if (!customerEmail) {
      throw new ConvexError(
        "Your account has no email address, so payment cannot be started. Contact support.",
      );
    }

    const now = Date.now();
    await ctx.db.insert("payments", {
      user_id: user._id,
      reference: args.reference,
      amount: quote.total,
      customerEmail,
      payment_method:
        args.paymentMode === "pay_on_delivery" ? "Cash on Delivery" : "Card",
      status: "Pending",
      payment_date: now,
      updated_at: now,
      quote: quote as never,
    });

    return {
      reference: args.reference,
      amount: quote.total,
      quote,
      reused: false as const,
    };
  },
});

/**
 * Place a pay-on-delivery clearance order, one per vendor.
 *
 * Stock is decremented through the existing internal mutation, scheduled the way
 * `createClearanceOrder` did — clearance stock is finite and per-listing, and
 * that mutation is where the decrement rule lives.
 */
export const placeMyClearanceOrder = mutation({
  args: {
    reference: v.string(),
    address: v.object({
      street: v.optional(v.string()),
      address_1: v.optional(v.string()),
      address_2: v.optional(v.string()),
      city: v.optional(v.string()),
      country: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
    receiverContact: v.optional(
      v.object({ name: v.string(), phone: v.string() }),
    ),
    specialInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (!payment) {
      throw new ConvexError(
        "No checkout was started for this order. Please try again.",
      );
    }
    if (payment.user_id !== user._id) {
      throw new ConvexError("This checkout belongs to a different customer");
    }
    if (payment.payment_method !== "Cash on Delivery") {
      throw new ConvexError(
        "This checkout was started for online payment. Complete the payment instead.",
      );
    }

    const quote = payment.quote;
    if (!quote) {
      throw new ConvexError("This checkout has no price attached. Start again.");
    }
    if (!quote.isClearance) {
      throw new ConvexError(
        "This checkout is not a clearance basket. Use the regular checkout.",
      );
    }

    // Idempotent on the reference.
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_payment_reference", (q) =>
        q.eq("payment_reference", args.reference),
      )
      .collect();
    if (existing.length > 0) {
      return { orderIds: existing.map((o) => o._id), reused: true as const };
    }

    const now = Date.now();
    const orderIds: Id<"orders">[] = [];

    for (const leg of quote.legs) {
      const orderId = await ctx.db.insert("orders", {
        reference: `${args.reference}-${orderIds.length + 1}`,
        order_date: now,
        vendor_id: leg.vendorId,
        user_id: user._id,
        service_radius: 0,
        payment_mode: "pay_on_delivery",
        order_status: "Confirmed",
        payment_status: "Unpaid",
        payment_method: "Cash on Delivery",
        subtotal_amount: leg.subtotal,
        tax_amount: quote.tax,
        discount_amount: 0,
        delivery_fee: leg.deliveryFee,
        total_amount: leg.total,
        payment_reference: args.reference,
        idempotency_key: args.reference,
        address: args.address,
        receiver_contact: args.receiverContact,
        special_instructions: args.specialInstructions || undefined,
        // One order per vendor, each flagged, so picking and dispatch can tell
        // a clearance delivery from a catalogue one.
        is_clearance: true,
        updated_at: now,
      });

      for (const item of leg.lines) {
        // Validated against the table rather than cast: a regular product id in
        // a clearance quote would otherwise be written into
        // `clearance_order_items`, pointing at a row of the wrong shape.
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
          // rewrite a receipt the customer already has.
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
      }

      orderIds.push(orderId);
    }

    // Emptied only after every order is written, so a failure part-way leaves
    // the basket intact and the retry above finds what it did create.
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (cart) {
      await ctx.db.patch(cart._id, { items: [], updated_at: now });
    }

    return { orderIds, reused: false as const };
  },
});
