import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import { v, ConvexError } from "convex/values";
import {
  OrderItemValidator,
  payerTypes,
  paymentStatus,
} from "../validators";
import { OrdersValidator, OrderItemWithoutOrderId } from "../validators";
import { api } from "../_generated/api";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import type { Doc } from "../_generated/dataModel";
import {
  getNestedString,
  getNestedValue,
  isRecord,
  type JsonRecord,
} from "../lib/json";
import { PAYSTACK_BASE_URL } from "../lib/paystack";
import { getPaystackCurrency, paystackRequest } from "./paystack_api";
import { assertPermission } from "../auth.helpers";

function computePaymentSearchText(payment: {
  reference?: string;
  customerEmail?: string;
  payer_phone?: string;
  status?: string;
  payment_method?: string;
}): string {
  return [
    payment.reference ?? "",
    payment.customerEmail ?? "",
    payment.payer_phone ?? "",
    payment.payment_method ?? "",
    payment.status ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export const getAllPayments = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_creation_time")
      .collect();
  },
});

export const getPayments = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));

    const search = args.search?.trim();

    const buildListQuery = () => {
      if (search && search.length > 0) {
        return ctx.db.query("payments").withSearchIndex("search_text", (q) => {
          return q.search("searchText", search);
        });
      }
      return ctx.db.query("payments").withIndex("by_date");
    };

    const pageResult = await buildListQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const enrichedPayments = await Promise.all(
      pageResult.page.map(async (payment) => {
        const [order, user] = await Promise.all([
          payment.order_id
            ? ctx.db.get(payment.order_id)
            : Promise.resolve(null),
          ctx.db.get(payment.user_id),
        ]);

        let orderItems: Doc<"order_items">[] = [];

        if (order) {
          orderItems = await ctx.db
            .query("order_items")
            .withIndex("by_order", (q) => q.eq("order_id", order._id))
            .collect();
        }

        return {
          ...payment,
          order,
          user,
          order_items: orderItems,
        };
      }),
    );

    const total = (await buildListQuery().collect()).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: enrichedPayments,
      pagination: {
        limit,
        total,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const backfillPaymentsSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const payments = await ctx.db.query("payments").collect();
    let updatedCount = 0;

    for (const payment of payments) {
      const searchText = computePaymentSearchText(payment);
      if (payment.searchText === searchText) continue;
      await ctx.db.patch(payment._id, { searchText, updated_at: Date.now() });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

/**
 * @deprecated Superseded by `checkout.beginCheckout`.
 *
 * Internal because it takes `amount` as a client argument, which is the hole
 * `beginCheckout` was written to close: that mutation prices the caller's own
 * basket and writes `amount` and `quote` in one transaction from one
 * calculation. A public mutation that accepts a price is a public mutation that
 * sets it.
 */
export const createPayment = internalMutation({
  args: {
    user_id: v.id("users"),
    reference: v.string(),
    amount: v.float64(),
    customerEmail: v.string(),
    order_id: v.optional(v.id("orders")),
    payment_method: v.union(
      v.literal("Cash on Delivery"),
      v.literal("Card"),
      v.literal("Mobile Money"),
      v.literal("Bank Transfer"),
      // Legacy value still possibly sent by older clients; will be normalized.
      v.literal("Paystack"),
    ),
    paystackResponse: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { payment_method: rawMethod } = args;
    const normalizedMethod =
      rawMethod === "Paystack" ? "Mobile Money" : rawMethod; // normalize legacy value

    const searchText = computePaymentSearchText({
      reference: args.reference,
      customerEmail: args.customerEmail,
      payment_method: normalizedMethod,
      status: "Pending",
    });

    const paymentId = await ctx.db.insert("payments", {
      user_id: args.user_id,
      reference: args.reference,
      amount: args.amount,
      customerEmail: args.customerEmail,
      order_id: args.order_id,
      payment_method: normalizedMethod,
      status: "Pending",
      searchText,
      payment_date: now,
      updated_at: now,
      paystackResponse: args.paystackResponse,
    });

    return paymentId;
  },
});

// New function to reserve stock for cart items during payment initialization
/**
 * @deprecated Superseded by `checkout.beginCheckout`.
 *
 * Same client-supplied `amount` as `createPayment`, and it reserves stock — so
 * an anonymous caller could hold real inventory against a price of their own
 * choosing. No callers in any app.
 */
export const createPaymentWithStockReservation = internalMutation({
  args: {
    user_id: v.id("users"),
    reference: v.string(),
    amount: v.float64(),
    customerEmail: v.string(),
    order_id: v.optional(v.id("orders")),
    payment_method: v.union(
      v.literal("Cash on Delivery"),
      v.literal("Card"),
      v.literal("Mobile Money"),
      v.literal("Bank Transfer"),
      v.literal("Paystack"),
    ),
    cartItems: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      }),
    ),
    paystackResponse: v.optional(v.any()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    paymentId: Id<"payments">;
    stockReservations: Id<"stockReservation">[];
  }> => {
    const now = Date.now();
    const { payment_method: rawMethod, cartItems, ...rest } = args;
    const normalizedMethod =
      rawMethod === "Paystack" ? "Mobile Money" : rawMethod;

    // Ensure the payment insert includes a stable searchText value
    const paymentSearchText = computePaymentSearchText({
      reference: args.reference,
      customerEmail: args.customerEmail,
      payment_method: normalizedMethod,
      status: "Pending",
    });

    // 1. Reserve stock for all cart items
    const reservationResults: Id<"stockReservation">[] = [];
    for (const item of cartItems) {
      try {
        // Call the stock reservation function directly
        const reservation: Id<"stockReservation"> | Doc<"stockReservation"> =
          await ctx.runMutation(api.data.stock_reservation.reserveStock, {
            productId: item.productId,
            quantity: item.quantity,
            orderReference: args.reference,
          });
        const reservationId =
          typeof reservation === "string" ? reservation : reservation._id;
        reservationResults.push(reservationId);
      } catch (stockError: unknown) {
        // If any stock reservation fails, release all previously reserved stock
        console.error(
          `Stock reservation failed for product ${item.productId}:`,
          stockError,
        );

        // Release any successful reservations
        try {
          await ctx.runMutation(api.data.stock_reservation.releaseStock, {
            orderReference: args.reference,
          });
        } catch (releaseError) {
          console.error(
            "Failed to release stock after reservation failure:",
            releaseError,
          );
        }

        const msg =
          stockError instanceof Error ? stockError.message : "Unknown error";
        throw new ConvexError(
          `Insufficient stock for product ${item.productId}. ${msg}`,
        );
      }
    }

    // 2. Create payment record only after successful stock reservation
    const paymentId = await ctx.db.insert("payments", {
      ...rest,
      payment_method: normalizedMethod,
      status: "Pending",
      searchText: paymentSearchText,
      payment_date: now,
      updated_at: now,
      paystackResponse: args.paystackResponse,
    });

    return {
      paymentId,
      stockReservations: reservationResults,
    };
  },
});

/**
 * Set a payment's status by hand.
 *
 * Stays public because the admin payments screen genuinely needs it — a
 * reconciliation tool for a charge that Paystack and Blink disagree about. But
 * it writes the field every downstream money decision reads, so it is gated.
 *
 * It was reachable with no authentication at all, which made the whole card flow
 * decorative: a caller could mark their own reference `Successful` and then place
 * a real order having paid nothing. Verified payments never come through here —
 * they come from `applyVerificationResult`, which is internal and only ever
 * reached after a server-to-server check against Paystack.
 */
export const updatePaymentStatus = mutation({
  args: {
    reference: v.string(),
    status: v.union(...paymentStatus.map((e) => v.literal(e))),
    paystackResponse: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "payments:UPDATE");
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();

    if (!payment) {
      throw new Error("Payment not found");
    }

    const searchText = computePaymentSearchText({
      reference: payment.reference,
      customerEmail: payment.customerEmail,
      payment_method: payment.payment_method,
      status: args.status,
    });

    await ctx.db.patch(payment._id, {
      status: args.status,
      searchText,
      updated_at: Date.now(),
      paystackResponse: args.paystackResponse,
    });
  },
});

/**
 * Record the Paystack split for a payment.
 *
 * Internal: its only caller is `payment_split.preparePaystackSplitForCheckout`,
 * which is itself backend-only. Public, it let anyone rewrite who gets paid what
 * for any reference.
 */
export const setPaymentSplit = internalMutation({
  args: {
    reference: v.string(),
    split_code: v.string(),
    breakdown: v.object({
      total_minor: v.number(),
      commission_minor: v.number(),
      delivery_fee_minor: v.number(),
      vendor_minor: v.number(),
      vendor_id: v.optional(v.id("vendors")),
      vendors: v.optional(
        v.array(
          v.object({
            vendor_id: v.id("vendors"),
            vendor_minor: v.number(),
            commission_minor: v.number(),
            gross_minor: v.number(),
          }),
        ),
      ),
      split_code: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (!payment) throw new Error("Payment not found");

    await ctx.db.patch(payment._id, {
      paystack_split_code: args.split_code,
      paystack_split_breakdown: {
        ...args.breakdown,
        split_code: args.split_code,
      },
      updated_at: Date.now(),
    });
  },
});

/**
 * Apply a verification outcome to a payment. THE state transition.
 *
 * Internal, and this is the most important guard in the payment path. Public, it
 * took `successful: v.boolean()` from the caller — so any anonymous client could
 * assert that any reference had been paid, and the finalisers only ever checked
 * `payment.status === "Successful"`.
 *
 * The only caller is `verifyPaystack`, which reaches this after a
 * server-to-server GET against Paystack. A client can ask us to ask Paystack; it
 * cannot tell us the answer.
 */
export const applyVerificationResult = internalMutation({
  args: {
    reference: v.string(),
    paystackResponse: v.any(),
    successful: v.boolean(),
    providerStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();

    if (!payment) {
      throw new Error("Payment not found for verification update");
    }

    const provider = (args.providerStatus || "").toLowerCase();
    const isTerminalFailure =
      provider === "failed" ||
      provider === "abandoned" ||
      provider === "reversed";
    const nextStatus: "Successful" | "Failed" | "Pending" = args.successful
      ? "Successful"
      : isTerminalFailure
        ? "Failed"
        : "Pending";

    // Update payment record with raw response and derived status
    await ctx.db.patch(payment._id, {
      status: nextStatus,
      paystackResponse: args.paystackResponse,
      updated_at: Date.now(),
    });

    /*
      The quote-first path: settle the checkout this payment belongs to.

      This is the edge that turns money into orders, and it is reached from
      both triggers — the paying customer's app coming back, and the Paystack
      webhook with that app closed. `settlePaidCheckout` is idempotent on the
      reference, so the two racing produces one order set.

      Guarded on `!payment.order_id` because the legacy order-first rows below
      already have their order and must not get a second one. Those creators
      are all internal with no callers now, so in practice this branch is the
      only live one.
    */
    if (nextStatus === "Successful" && !payment.order_id) {
      await ctx.runMutation(internal.data.checkout.settlePaidCheckout, {
        reference: args.reference,
      });
    }

    if (args.successful && payment.order_id) {
      await ctx.db.patch(payment.order_id, {
        payment_status: "Paid",
        payment_collected_at: Date.now(),
        payment_reference:
          (await ctx.db.get(payment.order_id))?.payment_reference ||
          args.reference,
      });

      const linkedOrder = await ctx.db.get(payment.order_id);

      if (linkedOrder && linkedOrder.payment_mode === "pay_now") {
        try {
          await ctx.runMutation(internal.data.orders.generateDeliveryCode, {
            orderId: payment.order_id,
          });
        } catch (codeError) {
          console.error("Delivery code generation failed:", codeError);
        }
      }

      try {
        if (linkedOrder && linkedOrder.order_status === "Pending") {
          await ctx.scheduler.runAfter(
            0,
            api.data.notifications.updateOrderStatusWithNotifications,
            {
              orderId: payment.order_id,
              newStatus: "Confirmed",
            },
          );
        }
      } catch (e) {
        console.error("Failed to confirm order or send notification", e);
      }
    }

    return {
      verified: args.successful,
      reference: args.reference,
    };
  },
});

/**
 * Verify a reference against Paystack, server to server, and apply the result.
 *
 * Internal. Reached by exactly two triggers, and neither is a client asserting an
 * outcome:
 *
 *   - `webhooks/paystack.ts`, on a signature-checked charge event;
 *   - `checkout.confirmMyCardPayment`, when the paying customer's app returns.
 *
 * The webhook's own comment said this could become internal "once the apps rely
 * on this webhook instead of polling". They do now: the only app that called it
 * directly was `blink-ecommerce`, which runs on its own deployment.
 */
export const verifyPaystack = internalAction({
  args: { reference: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    verified: boolean;
    providerStatus?: string;
    reference: string;
    skipped?: boolean;
  }> => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      console.warn(
        "Paystack secret key missing; skipping verification (DO NOT USE IN PROD)",
      );
      return { verified: false, skipped: true, reference: args.reference };
    }

    const reference = String(args.reference || "").trim();
    if (!reference) throw new Error("Missing Paystack reference");

    try {
      // Use /charge/:reference first (recommended for pending charges from /charge endpoint)
      // Falls back to /transaction/verify if charge check fails
      let body: unknown;
      let paystackStatus: string | undefined;
      try {
        body = await paystackRequest(
          secret,
          `/charge/${encodeURIComponent(reference)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          },
        );
        paystackStatus = getNestedString(body, ["data", "status"]);
      } catch {
        // Fallback to /transaction/verify for non-charge transactions
        body = await paystackRequest(
          secret,
          `/transaction/verify/${encodeURIComponent(reference)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          },
        );
        paystackStatus = getNestedString(body, ["data", "status"]);
      }

      const topLevelStatus = getNestedValue(body, ["status"]);
      const successful =
        topLevelStatus === true && paystackStatus === "success";

      // If still pending, return early without updating DB status
      if (paystackStatus === "pending") {
        return {
          verified: false,
          providerStatus: paystackStatus,
          reference,
        };
      }

      // Apply verification results via helper mutation
      await ctx.runMutation(internal.data.payments.applyVerificationResult, {
        reference,
        paystackResponse: body,
        successful,
        providerStatus: paystackStatus,
      });

      return {
        verified: successful,
        providerStatus: paystackStatus,
        reference,
      };
    } catch (err: unknown) {
      console.error("Error verifying Paystack transaction", err);
      throw new ConvexError(
        err instanceof Error ? err.message : "Verification failed",
      );
    }
  },
});

// export const initiatePaystackTransaction = mutation({
//   args: {
//     orderId: v.id("orders"),
//     payerEmail: v.string(),
//     payerPhone: v.string(),
//     channel: v.optional(v.union(v.literal("mobile_money"), v.literal("card"))),
//     payerType: v.optional(
//       v.union(...payerTypes.map((e) => v.literal(e)))
//     ),
//   },
//   // placeholder handler replaced by action below
//   handler: async () => {
//     throw new Error("initiatePaystackTransaction must be called as an action now.");
//   },
// });

// Query to list payments by order for reuse/idempotency inside action
export const getPaymentsByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .collect();
  },
});

// Helper mutation to persist initiated payment (includes payer audit fields)
/**
 * @deprecated Order-first, and writes no quote.
 *
 * Internal. It inserts a SECOND payments row for an order that already exists,
 * carrying no `quote` — and `applyQuoteToOrder` returns the order unchanged when
 * the quote is absent, so a payment created this way finalises on whatever
 * numbers the client sent. It also took `userId` and `amount` as arguments.
 *
 * Kept rather than deleted: the direct-charge STK shape is what a rider-side
 * cash-collection flow would want.
 */
export const persistInitiatedPaystackPayment = internalMutation({
  args: {
    orderId: v.id("orders"),
    userId: v.id("users"),
    finalEmail: v.string(),
    payerPhone: v.string(),
    payerType: v.union(...payerTypes.map((e) => v.literal(e))),
    channel: v.optional(v.union(v.literal("mobile_money"), v.literal("card"))),
    initResp: v.any(),
    reference: v.string(),
    amount: v.float64(),
  },
  handler: async (ctx, args) => {
    const payment_method =
      args.channel === "mobile_money" ? "Mobile Money" : "Card";
    const searchText = computePaymentSearchText({
      reference: args.reference,
      customerEmail: args.finalEmail,
      payment_method,
      status: "Pending",
    });

    const paymentId = await ctx.db.insert("payments", {
      order_id: args.orderId,
      user_id: args.userId,
      customerEmail: args.finalEmail,
      payment_method,
      amount: args.amount,
      reference: args.reference,
      paystackResponse: args.initResp,
      payer_phone: args.payerPhone,
      payer_type: args.payerType,
      payment_date: Date.now(),
      status: "Pending",
      searchText,
      updated_at: Date.now(),
    });
    // Link reference to order if not already present
    const order = await ctx.db.get(args.orderId);
    if (order && !order.payment_reference) {
      await ctx.db.patch(args.orderId, {
        payment_reference: args.reference,
        updated_at: Date.now(),
      });
    }
    return paymentId;
  },
});

// Action performing network call and persisting via helper mutation
type InitiatePaystackResult =
  | {
      reused: true;
      reference: string;
      authorizationUrl: null;
      accessCode: null;
      paymentId: Id<"payments">;
    }
  | {
      reused: false;
      reference: string;
      authorizationUrl: null;
      accessCode: null;
      paymentId: Id<"payments">;
      displayText: string;
      status: string;
    };

/**
 * @deprecated Order-first, M-Pesa-only, and returns nothing a webview can open.
 *
 * Internal. It requires an existing order, which the quote-first flow does not
 * have at payment time; it hard-defaults to `mobile_money` with no card branch;
 * and it returns `authorizationUrl: null` and `accessCode: null`. The client card
 * step does not need it — the SDK initialises against the public key.
 */
export const initiatePaystackTransactionAction = internalAction({
  args: {
    orderId: v.id("orders"),
    payerEmail: v.string(),
    payerPhone: v.string(),
    channel: v.optional(v.union(v.literal("mobile_money"), v.literal("card"))),
    payerType: v.optional(
      v.union(...payerTypes.map((e) => v.literal(e))),
    ),
  },
  handler: async (ctx, args): Promise<InitiatePaystackResult> => {
    const order = await ctx.runQuery(api.data.orders.getOrderById, {
      orderId: args.orderId,
    });
    if (!order) throw new Error("Order not found");
    if (order.payment_status === "Paid")
      throw new ConvexError("Order already paid");

    const existing = await ctx.runQuery(api.data.payments.getPaymentsByOrder, {
      orderId: args.orderId,
    });

    const pending = existing.find(
      (p: (typeof existing)[number]) => p.status === "Pending",
    );
    if (pending) {
      return {
        reused: true,
        reference: pending.reference,
        authorizationUrl: null,
        accessCode: null,
        paymentId: pending._id,
      };
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("Missing Paystack secret key");

    const currency = getPaystackCurrency(secret);

    const uniqueRef: string = `${order.reference}-${Math.random().toString(36).slice(2, 8)}`;
    const amountMinorUnits = Math.round(order.total_amount * 100);

    const derivedPayerType =
      args.payerType || (order.receiver_contact ? "receiver" : "customer");

    let finalEmail = args.payerEmail?.trim();
    if (derivedPayerType === "receiver" && !finalEmail) {
      const receiverEmail = order.receiver_contact?.email?.trim();
      if (receiverEmail) finalEmail = receiverEmail;
      else {
        const sanitizedPhone = args.payerPhone.replace(/[^0-9]/g, "");
        finalEmail = `receiver-${sanitizedPhone || order.reference}@autogen.local`;
      }
    }
    if (!finalEmail) {
      const customerUser = order.user_id
        ? await ctx.runQuery(api.user.users.getUserById, { user_id: order.user_id })
        : null;
      finalEmail =
        customerUser?.email || `order-${order.reference}@autogen.local`;
    }

    const formatPhoneInternational = (phone: string): string => {
      if (!phone) return "";
      // Check for + prefix before stripping non-digits
      const hasPlus = phone.startsWith("+");
      const cleaned = phone.replace(/[^0-9]/g, "");

      if (cleaned.startsWith("0") && cleaned.length === 10) {
        return `+254${cleaned.substring(1)}`;
      }

      if (cleaned.startsWith("254") && cleaned.length === 12) {
        return `+${cleaned}`;
      }

      // Already in +254 format
      if (hasPlus && cleaned.startsWith("254") && cleaned.length === 12) {
        return `+${cleaned}`;
      }

      return hasPlus ? `+${cleaned}` : phone;
    };

    const formattedPhone = formatPhoneInternational(args.payerPhone);

    const body: {
      email: string;
      amount: number;
      currency: string;
      reference: string;
      metadata: {
        orderId: Id<"orders">;
        payerPhone: string;
        payerPhoneFormatted: string;
        payerType: "customer" | "receiver";
      };
      mobile_money?: { phone: string; provider: "mpesa" };
    } = {
      email: finalEmail,
      amount: amountMinorUnits,
      currency,
      reference: uniqueRef,
      metadata: {
        orderId: order._id,
        payerPhone: args.payerPhone,
        payerPhoneFormatted: formattedPhone,
        payerType: derivedPayerType,
      },
    };

    if (args.channel === "mobile_money" || !args.channel) {
      body.mobile_money = {
        phone: formattedPhone,
        provider: "mpesa",
      };
      console.log(
        "STK Push Setup - Phone in body:",
        formattedPhone,
        "Original:",
        args.payerPhone,
        "Provider: mpesa",
      );
    }

    console.log("Paystack charge payload:", JSON.stringify(body, null, 2));

    const res = await fetch(`${PAYSTACK_BASE_URL}/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();
    console.log("Paystack charge response:", res.status, responseText);

    if (!res.ok) {
      throw new ConvexError(
        `Failed to initialize paystack transaction: ${responseText}`,
      );
    }

    const initResp: unknown = JSON.parse(responseText);
    const dataRaw = isRecord(initResp) ? initResp.data : undefined;
    const data = isRecord(dataRaw) ? dataRaw : ({} as JsonRecord);
    const finalReference =
      typeof data.reference === "string" && data.reference.trim()
        ? data.reference
        : uniqueRef;

    const paymentId = await ctx.runMutation(
      internal.data.payments.persistInitiatedPaystackPayment,
      {
        orderId: args.orderId,
        userId: order.user_id,
        finalEmail,
        payerPhone: args.payerPhone,
        payerType: derivedPayerType,
        channel: args.channel || "mobile_money",
        initResp,
        reference: finalReference,
        amount: order.total_amount,
      },
    );

    return {
      reference: finalReference,
      authorizationUrl: null,
      accessCode: null,
      paymentId,
      reused: false,
      displayText:
        typeof data.display_text === "string" && data.display_text.trim()
          ? data.display_text
          : "Please complete the payment prompt.",
      status:
        typeof data.status === "string" && data.status.trim()
          ? data.status
          : "pending",
    };
  },
});

export const getPaymentByReference = query({
  args: {
    reference: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
  },
});

export const getUserPayments = query({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .order("desc")
      .collect();
  },
});
