import { v, ConvexError } from "convex/values";
import { mutation, query, type QueryCtx, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUser } from "../auth.helpers";
import { readDeliveryPricing } from "./platform_settings";
import {
  QuoteError,
  buildQuote,
  quoteMatchesExpected,
  type CheckoutQuote,
  type ResolvedLine,
} from "../lib/checkout_quote";

/**
 * Checkout — pricing the basket once, and charging exactly that.
 *
 * ── The problem this closes ──────────────────────────────────────────────
 *
 * `blink-ecommerce/app/checkout.tsx:590-591` computed `delivery_fee` and
 * `total_amount` on the client and sent them to mutations that stored them
 * verbatim. So the price was whatever the client said it was, and the four
 * `finalize*` mutations had no auth at all — anyone could create orders at any
 * price, as any customer.
 *
 * Authentication was closed already. This closes the pricing: the server prices
 * the caller's own basket, stores the result on the payment row, and charges
 * that. Finalisation then writes orders from the stored quote instead of from
 * client-supplied numbers.
 *
 * ── Why the quote is stored rather than recomputed ───────────────────────
 *
 * Payment is authorised at initiation; orders are written after Paystack
 * confirms. Recomputing at finalisation would write an order whose total no
 * longer matches the amount already captured — reconciliation breaks silently.
 * Refusing to write the orders is worse: money taken, nothing delivered.
 *
 * Pricing once and replaying makes the race impossible rather than handled.
 */

const MAX_BASKET_LINES = 100;

/** Resolve the caller's basket against current product rows. */
async function resolveMyBasket(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{ lines: ResolvedLine[]; dropped: string[] }> {
  const cart = await ctx.db
    .query("cart")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .first();

  if (!cart || cart.products.length === 0) {
    return { lines: [], dropped: [] };
  }

  const lines: ResolvedLine[] = [];
  const dropped: string[] = [];

  for (const entry of cart.products.slice(0, MAX_BASKET_LINES)) {
    const product = await ctx.db.get(entry.product);
    if (!product) {
      // The row is gone entirely. Named generically because there is nothing
      // left to name it by.
      dropped.push("An item is no longer available");
      continue;
    }
    lines.push({
      productId: product._id,
      vendorId: product.vendor_id,
      name: product.name,
      quantity: entry.quantity,
      // Read from the product row, never from the client and never from
      // anything stored on the device.
      price: product.price,
      status: product.status,
      available: product.quantity,
      requiresPrescription: product.requires_prescription ?? false,
    });
  }

  return { lines, dropped };
}

function priceOrThrow(
  lines: ResolvedLine[],
  settings: Awaited<ReturnType<typeof readDeliveryPricing>>,
): CheckoutQuote {
  try {
    return buildQuote(lines, settings);
  } catch (error) {
    if (error instanceof QuoteError) throw new ConvexError(error.message);
    throw error;
  }
}

/**
 * What the caller's basket would cost right now.
 *
 * Read-only, for the checkout screen to display before anything is charged. It
 * is the SAME calculation `beginCheckout` performs, so the figure shown and the
 * figure charged cannot drift — the previous app computed one on the client and
 * a different one at order time.
 */
export const quoteMyBasket = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    // Null rather than a throw: the checkout screen renders an explanation for
    // a missing account, and a thrown query would surface as a broken screen.
    if (!user) return null;

    const { lines, dropped } = await resolveMyBasket(ctx, user._id);
    if (lines.length === 0) return null;

    const settings = await readDeliveryPricing(ctx);
    try {
      const quote = buildQuote(lines, settings);
      const unsellable = lines
        .filter(
          (l) => l.status !== "Active" || l.available <= 0 || !l.vendorId,
        )
        .map((l) => `${l.name} is no longer available`);
      return { quote, unavailable: [...dropped, ...unsellable] };
    } catch {
      // An unpriceable basket is a state the screen shows, not an error it
      // crashes on.
      return null;
    }
  },
});

/**
 * Price the basket, record the quote, and hand back what will be charged.
 *
 * Creates the `payments` row itself so `amount` and `quote` are written in one
 * transaction from one calculation. `createPayment` takes `amount` as a client
 * argument, which is exactly the hole being closed, so it is not used here.
 *
 * `expectedTotal` is the ONLY client number accepted, and only to compare: if
 * the basket moved since the customer looked, the mutation refuses and names
 * what changed rather than charging a different figure. Rejecting is safe here
 * precisely because no money has moved yet — the same refusal after capture
 * would be the worst outcome available.
 */
export const beginCheckout = mutation({
  args: {
    reference: v.string(),
    paymentMode: v.union(v.literal("pay_now"), v.literal("pay_on_delivery")),
    expectedTotal: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    // Idempotent on the reference: a retried tap must not create a second
    // payment row, and must not re-price.
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

    const { lines } = await resolveMyBasket(ctx, user._id);
    if (lines.length === 0) throw new ConvexError("Your basket is empty");

    const settings = await readDeliveryPricing(ctx);
    const quote = priceOrThrow(lines, settings);

    if (!quoteMatchesExpected(quote, args.expectedTotal)) {
      throw new ConvexError(
        `The price changed while you were checking out. Your basket now comes to ${quote.total}. Review it and try again.`,
      );
    }

    // Paystack needs a customer email, and a `users` row without one should not
    // exist — `upsertUser` refuses to create one. Asserted rather than coerced,
    // because an empty string here would fail at Paystack with a much less
    // useful message.
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
      // Server-computed. This is the number Paystack is asked for.
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
 * The stored quote for a reference, so finalisation can replay it.
 *
 * Scoped to the caller's own payment — order finalisation already authenticates,
 * and this keeps a reference from being used to read someone else's basket.
 */
export async function readQuoteForReference(
  ctx: QueryCtx | MutationCtx,
  reference: string,
  userId: Id<"users">,
): Promise<Doc<"payments">["quote"] | null> {
  const payment = await ctx.db
    .query("payments")
    .withIndex("by_reference", (q) => q.eq("reference", reference))
    .first();
  if (!payment || payment.user_id !== userId) return null;
  return payment.quote ?? null;
}

/**
 * Place the order for a pay-on-delivery checkout.
 *
 * ── The client sends no money and no order structure ─────────────────────
 *
 * It sends where to deliver, who is receiving, and any instructions. Everything
 * else — the orders, their line items, every figure on them — is built here from
 * the quote stored by `beginCheckout`.
 *
 * The screen this replaces assembled the order objects itself, one per vendor,
 * each with client-computed `subtotal_amount`, `delivery_fee` and
 * `total_amount`, and handed them to a mutation that stored them verbatim. Two
 * consequences beyond the obvious one:
 *
 *   - it grouped by `item.product?.vendor_id || "unknown"` and cast the literal
 *     string `"unknown"` into an `Id<"vendors">`, so a product with no vendor
 *     made the whole finalisation throw — after the customer had paid;
 *   - the delivery fee it displayed and the fees it wrote to the orders
 *     disagreed, so the orders always summed to more than the amount charged.
 *
 * Neither is expressible here: the quote has already excluded vendor-less lines
 * and its legs are guaranteed to sum to the total that was quoted.
 */
export const placeMyOrder = mutation({
  args: {
    /** From `beginCheckout`. Identifies the quote and de-duplicates a retry. */
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

    // Idempotent on the reference: a double-tapped button, or a retry after a
    // dropped connection, must not create a second set of orders.
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
        // One reference per basket, suffixed per delivery, so a customer with
        // three deliveries can tell a support agent which one they mean.
        reference: `${args.reference}-${orderIds.length + 1}`,
        order_date: now,
        vendor_id: leg.vendorId,
        user_id: user._id,
        service_radius: 0,
        payment_mode: "pay_on_delivery",
        order_status: "Confirmed",
        payment_status: "Unpaid",
        payment_method: "Cash on Delivery",
        // Straight from the quote. Nothing here came from the client.
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
        updated_at: now,
      });

      for (const item of leg.lines) {
        // Validated against the table rather than cast. A stored quote can now
        // hold clearance ids too, and those belong in `clearance_order_items`
        // with their own price fields — writing one here would produce an order
        // item pointing at a row that is not a catalogue product.
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

      orderIds.push(orderId);
    }

    // Emptied only after every order is written, so a failure part-way leaves
    // the basket intact and the retry above finds the orders it did create.
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (cart) {
      await ctx.db.patch(cart._id, { products: [], updated_at: now });
    }

    return { orderIds, reused: false as const };
  },
});
