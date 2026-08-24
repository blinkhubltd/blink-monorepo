import { mutation, query, action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import {
  OrderItemValidator,
  payerTypes,
  paymentStatus,
} from "../validators";
import { OrdersValidator, OrderItemWithoutOrderId } from "../validators";
import { api } from "../_generated/api";
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

export const createPayment = mutation({
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
export const createPaymentWithStockReservation = mutation({
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

export const updatePaymentStatus = mutation({
  args: {
    reference: v.string(),
    status: v.union(...paymentStatus.map((e) => v.literal(e))),
    paystackResponse: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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

export const setPaymentSplit = mutation({
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

export const applyVerificationResult = mutation({
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
          await ctx.runMutation(api.data.orders.generateDeliveryCode, {
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

// Server-side Paystack verification action to prevent client spoofing of success events.
export const verifyPaystack = action({
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
      await ctx.runMutation(api.data.payments.applyVerificationResult, {
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
export const persistInitiatedPaystackPayment = mutation({
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

export const initiatePaystackTransactionAction = action({
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
      api.data.payments.persistInitiatedPaystackPayment,
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
