import { v, ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUser } from "../auth.helpers";
import { writeOrdersFromQuote, type Fulfilment } from "./order_write";
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

/**
 * Where the delivery goes.
 *
 * One declaration, used by `beginCheckout` and `placeMyOrder` both, because
 * they were already carrying identical copies and a third was about to appear.
 */
const fulfilmentArgs = {
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
} as const;

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
    /**
     * Required for `pay_now`, ignored for pay-on-delivery.
     *
     * Stored on the payment row so settlement needs nothing from the client —
     * see the note on `PaymentsValidator.fulfilment`. Refused up front rather
     * than discovered later: a pay-now payment with no address cannot be
     * settled, and the moment to say so is before the customer is charged.
     */
    fulfilment: v.optional(v.object(fulfilmentArgs)),
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
        customerEmail: existing.customerEmail,
        reused: true as const,
      };
    }

    if (args.paymentMode === "pay_now" && !args.fulfilment) {
      // Not a validator constraint because the field is genuinely optional for
      // the other mode. Checked before pricing so the refusal is cheap.
      throw new ConvexError(
        "A delivery address is needed before payment can start.",
      );
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
      fulfilment: args.fulfilment,
    });

    return {
      reference: args.reference,
      amount: quote.total,
      quote,
      // Returned so the card sheet charges the address the server validated,
      // rather than the client reaching for its own copy from Clerk.
      customerEmail,
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
    ...fulfilmentArgs,
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

    // The address arrives with the call here, rather than off the payment row.
    // Legitimate for this mode: pay-on-delivery is placed by a client that is,
    // by definition, still present. The card path cannot assume that, which is
    // why `beginCheckout` stores it instead.
    return await writeOrdersFromQuote(ctx, {
      userId: user._id,
      reference: args.reference,
      quote,
      fulfilment: {
        address: args.address,
        receiverContact: args.receiverContact,
        specialInstructions: args.specialInstructions,
      },
      mode: "pay_on_delivery",
    });
  },
});

/**
 * Write the orders for a checkout Paystack has confirmed.
 *
 * ── Why this is the settlement point ─────────────────────────────────────
 *
 * Everything it needs is already on the payment row: the quote from
 * `beginCheckout`, the address from the same call, and a status that only
 * `applyVerificationResult` can have set — and that only ever runs after a
 * server-to-server check against Paystack.
 *
 * So it takes a reference and nothing else, and that is the whole point. It can
 * be driven by the paying customer's app coming back, or by the Paystack
 * webhook with that app closed, and both produce the same orders. The old app
 * had no such path: it assembled the orders on the client and handed them to a
 * finaliser, so a customer who paid and force-quit left a captured payment with
 * no order.
 *
 * `internalMutation`, necessarily. A public mutation that writes paid orders
 * from a reference is a public mutation that writes paid orders.
 */
export const settlePaidCheckout = internalMutation({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (!payment) {
      // Not a throw. Reached from a webhook, and a reference we do not know is
      // not a transient failure worth retrying — Paystack would retry forever.
      console.error(`[settle] no payment row for ${args.reference}`);
      return { settled: false as const, reason: "no_payment" as const };
    }

    if (payment.status !== "Successful") {
      // The one check that matters. Called on the verification edge, so this
      // should not happen — but "should not happen" is not a guarantee, and the
      // guarantee is what stops an unpaid basket becoming a delivery.
      console.error(
        `[settle] ${args.reference} is ${payment.status}, not Successful`,
      );
      return { settled: false as const, reason: "not_paid" as const };
    }

    if (!payment.quote) {
      // A row created by one of the legacy order-first creators, which wrote no
      // quote. Those are all internal now and have no callers, so this is
      // unreachable from any live path — and refusing is right regardless,
      // because there is no server-priced figure to write orders from.
      console.error(`[settle] ${args.reference} has no stored quote`);
      return { settled: false as const, reason: "no_quote" as const };
    }

    if (!payment.fulfilment) {
      // `beginCheckout` refuses pay-now without one, so this means the payment
      // was started some other way. There is nowhere to deliver to.
      console.error(`[settle] ${args.reference} has no fulfilment details`);
      return { settled: false as const, reason: "no_fulfilment" as const };
    }

    const result = await writeOrdersFromQuote(ctx, {
      userId: payment.user_id,
      reference: args.reference,
      quote: payment.quote,
      fulfilment: payment.fulfilment satisfies Fulfilment,
      mode: "pay_now",
      // Verification may have revealed the customer actually paid by M-Pesa
      // even though `beginCheckout` optimistically wrote "Card".
      paymentMethod: payment.payment_method,
    });

    return { settled: true as const, ...result };
  },
});

/**
 * Resolve the caller and confirm a reference is theirs.
 *
 * Exists because `confirmMyCardPayment` is an `action` — it makes an outbound
 * request to Paystack — and an action has `ctx.auth` but no `ctx.db`, so
 * `getAuthUser` cannot be called from one directly.
 */
export const assertMyPayment = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (!payment) throw new ConvexError("We have no record of that payment.");
    if (payment.user_id !== user._id) {
      // Without this, a reference is a bearer token for someone else's
      // checkout: knowing one would let you drive its verification and read
      // back the orders it produced.
      throw new ConvexError("That payment belongs to a different customer");
    }
    return { status: payment.status };
  },
});

/**
 * Ask the server to ask Paystack whether the caller's payment went through.
 *
 * ── The trust boundary, in one function ──────────────────────────────────
 *
 * The client calls this when its payment sheet reports success, and again when
 * the app returns to the foreground. It carries a reference and no verdict. The
 * verdict comes from `verifyPaystack`, which does the server-to-server GET and
 * routes the answer through `applyVerificationResult` — both internal.
 *
 * The old app inverted this: the sheet's `onSuccess` called a public
 * `updatePaymentStatus({ status: "Successful" })` directly, so the client
 * declared its own payment good.
 *
 * ── The four outcomes are distinct on purpose ────────────────────────────
 *
 * `unverifiable` in particular: `verifyPaystack` returns `skipped: true` when
 * `PAYSTACK_SECRET_KEY` is unset, and the old client treated that exactly like
 * a pending charge — 45 seconds of polling, then silence. A misconfigured
 * deployment must say so rather than look like a slow one.
 */
export const confirmMyCardPayment = action({
  args: { reference: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { state: "successful"; orderIds: Id<"orders">[] }
    | { state: "pending" }
    | { state: "failed"; reason: string }
    | { state: "unverifiable" }
  > => {
    // Ownership first: never spend an outbound request on someone else's
    // reference.
    await ctx.runQuery(internal.data.checkout.assertMyPayment, {
      reference: args.reference,
    });

    const verification = await ctx.runAction(
      internal.data.payments.verifyPaystack,
      { reference: args.reference },
    );

    if (verification.skipped) return { state: "unverifiable" };

    if (verification.verified) {
      // `verifyPaystack` has already flipped the payment to Successful and
      // scheduled settlement. Settling again here is deliberate and safe: it is
      // idempotent on the reference, and it means the returning client gets the
      // order ids in this same round trip instead of polling for them.
      const settled = await ctx.runMutation(
        internal.data.checkout.settlePaidCheckout,
        { reference: args.reference },
      );
      return {
        state: "successful",
        orderIds: settled.settled ? settled.orderIds : [],
      };
    }

    const provider = (verification.providerStatus ?? "").toLowerCase();
    if (provider === "failed" || provider === "abandoned" || provider === "reversed") {
      return { state: "failed", reason: provider };
    }

    // Anything else — including Paystack's own "pending" — is still in flight.
    // The webhook will settle it whether or not this app is still open.
    return { state: "pending" };
  },
});
