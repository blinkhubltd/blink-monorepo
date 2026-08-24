import { mutation, query, action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { OrderItemValidator } from "../validators";
import { OrdersValidator, OrderItemWithoutOrderId } from "../validators";
import { api } from "../_generated/api";
import { Id } from "../helpers";
import type { Doc } from "../_generated/dataModel";
import { PAYSTACK_BASE_URL } from "../lib/paystack";

type JsonRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function getNestedString(value: unknown, path: string[]): string | undefined {
  const nested = getNestedValue(value, path);
  return typeof nested === "string" && nested.trim() ? nested : undefined;
}

async function paystackRequest(
  secret: string,
  path: string,
  init?: RequestInit,
) {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      isRecord(body) && typeof body.message === "string"
        ? body.message
        : typeof body === "string"
          ? body
          : `HTTP ${res.status}`;
    console.error("[Paystack] Request failed", {
      path,
      status: res.status,
      statusText: res.statusText,
      message: msg,
    });
    throw new Error(`Paystack API error (${path}): ${msg}`);
  }
  return body;
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || !String(val).trim()) throw new Error(`Missing env var: ${name}`);
  return String(val).trim();
}

function getOptionalEnv(name: string): string | undefined {
  const val = process.env[name];
  const trimmed =
    typeof val === "string" ? val.trim() : String(val ?? "").trim();
  return trimmed ? trimmed : undefined;
}

function getPaystackCurrency(secret: string): string {
  // This project is configured for Kenya. Enforce KES to avoid
  // creating charges/splits with a mismatched currency.
  const configured = getOptionalEnv("PAYSTACK_CURRENCY");
  if (configured && configured.toUpperCase().trim() !== "KES") {
    console.warn(
      "[Paystack] PAYSTACK_CURRENCY is set but will be ignored (currency is enforced to KES)",
      {
        configured,
      },
    );
  }
  void secret;
  return "KES";
}

async function logPaystackSubaccountCurrencies(
  secret: string,
  subaccountCodes: string[],
  reference: string,
) {
  const unique = Array.from(new Set(subaccountCodes.filter(Boolean)));
  if (unique.length === 0) return;

  try {
    const infos = await Promise.all(
      unique.map(async (code) => {
        try {
          const res = await paystackRequest(
            secret,
            `/subaccount/${encodeURIComponent(code)}`,
            { method: "GET" },
          );
          return {
            code,
            currency: getNestedString(res, ["data", "currency"]),
            settlement_bank: getNestedString(res, ["data", "settlement_bank"]),
          };
        } catch (e) {
          return {
            code,
            currency: undefined,
            settlement_bank: undefined,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );

    console.warn("[Split] subaccount currency diagnostics", {
      reference,
      subaccounts: infos.map((i) => ({
        subaccount: maskCode(i.code),
        currency: i.currency,
        settlement_bank: i.settlement_bank,
        error: "error" in i ? i.error : undefined,
      })),
    });
  } catch (e) {
    console.warn("[Split] subaccount currency diagnostics failed", {
      reference,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function paystackSubaccountExists(
  secret: string,
  subaccountCode: string,
): Promise<boolean> {
  const code = String(subaccountCode || "").trim();
  if (!code) return false;

  try {
    const res = await fetch(
      `${PAYSTACK_BASE_URL}/subaccount/${encodeURIComponent(code)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
        },
      },
    );

    if (res.ok) return true;
    if (res.status === 404) return false;

    // Some Paystack errors return 400 with a "not found" message.
    const text = await res.text();
    try {
      const body = text ? JSON.parse(text) : null;
      const msg =
        isRecord(body) && typeof body.message === "string" ? body.message : "";
      if (msg.toLowerCase().includes("not found")) return false;
    } catch {
      if (text.toLowerCase().includes("not found")) return false;
    }

    return false;
  } catch {
    // If we can't verify, don't block the flow.
    return true;
  }
}

function sanitizeAccountNumber(raw: string): string {
  // Paystack expects digits-only account numbers.
  return String(raw)
    .replace(/[^0-9]/g, "")
    .trim();
}

function assertValidPaystackAccountNumber(
  accountNumber: string,
  label: string,
) {
  const digits = sanitizeAccountNumber(accountNumber);
  // Paystack bank accounts (e.g. NG NUBAN) are typically 10 digits.
  // If your Paystack account uses a different format, adjust this check accordingly.
  if (!/^\d{10}$/.test(digits)) {
    throw new Error(
      `${label} account number is invalid for Paystack. Expected 10 digits, got length ${digits.length} (${maskAccountNumber(digits)}).`,
    );
  }
}

async function resolvePaystackBankAccount(
  secret: string,
  bankCode: string,
  accountNumber: string,
  label: string,
): Promise<{ account_name?: string } | null> {
  const bank_code = String(bankCode || "").trim();
  const account_number = sanitizeAccountNumber(accountNumber);
  if (!bank_code || !account_number) return null;

  try {
    const res = await paystackRequest(
      secret,
      `/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );
    const account_name = getNestedString(res, ["data", "account_name"]);
    console.log("[Split] bank resolve ok", {
      label,
      bank_code,
      account_number: maskAccountNumber(account_number),
      account_name: account_name || null,
    });
    return { account_name: account_name || undefined };
  } catch (e) {
    console.warn("[Split] bank resolve failed", {
      label,
      bank_code,
      account_number: maskAccountNumber(account_number),
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function maskAccountNumber(accountNumber: string): string {
  const digits = sanitizeAccountNumber(accountNumber);
  if (!digits) return "";
  if (digits.length <= 4) return `****${digits}`;
  return `****${digits.slice(-4)}`;
}

function maskCode(code: string): string {
  const trimmed = String(code || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 6) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-3)}`;
}

function toMinorUnits(amountMajor: number): number {
  return Math.round(Number(amountMajor) * 100);
}

function nonNegativeInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

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
    status: v.union(
      v.literal("Pending"),
      v.literal("Successful"),
      v.literal("Failed"),
      v.literal("Refunded"),
    ),
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

// Prepare Paystack split_code for a cart checkout payment reference.
// This is called from the mobile client BEFORE opening Paystack popup.
export const preparePaystackSplitForCheckout = action({
  args: {
    reference: v.string(),
    cartItems: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    split_code: string;
    breakdown: {
      total_minor: number;
      commission_minor: number;
      delivery_fee_minor: number;
      vendor_minor: number;
      vendor_id?: Id<"vendors">;
      vendors?: Array<{
        vendor_id: Id<"vendors">;
        vendor_minor: number;
        commission_minor: number;
        gross_minor: number;
      }>;
      split_code?: string;
    } | null;
    reused: boolean;
  }> => {
    console.log("[Split] preparePaystackSplitForCheckout:start", {
      reference: args.reference,
      cartItemsCount: args.cartItems.length,
    });

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("Missing Paystack secret key");

    const isPaystackTestKey = String(secret).startsWith("sk_test_");
    const currency = getPaystackCurrency(secret);

    if (isPaystackTestKey && currency === "KES") {
      throw new Error(
        "PAYSTACK_SECRET_KEY is a test key (sk_test_) but currency is enforced to KES. Use your live Paystack keys (sk_live_/pk_live_) for Kenya KES, or relax the currency enforcement if you want to test in NGN.",
      );
    }

    const payment = await ctx.runQuery(api.data.payments.getPaymentByReference, {
      reference: args.reference,
    });
    if (!payment) throw new Error("Payment not found for reference");
    if (payment.status !== "Pending") {
      throw new Error("Payment is not pending; cannot prepare split");
    }
    if (payment.paystack_split_code) {
      console.log("[Split] reuse existing split_code", {
        reference: args.reference,
        split_code: maskCode(payment.paystack_split_code),
      });
      return {
        split_code: payment.paystack_split_code,
        breakdown: payment.paystack_split_breakdown || null,
        reused: true,
      };
    }

    const vendorWeightMajorById = new Map<Id<"vendors">, number>();
    let computedItemsTotalMajor = 0;
    for (const item of args.cartItems) {
      const product = await ctx.runQuery(api.data.products.getProductsById, {
        id: item.productId,
      });
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      if (!product.vendor_id) {
        throw new Error(`Product missing vendor_id: ${item.productId}`);
      }
      const vendorId = product.vendor_id;
      const lineTotal = Number(product.price) * Number(item.quantity);
      vendorWeightMajorById.set(
        vendorId,
        (vendorWeightMajorById.get(vendorId) || 0) + lineTotal,
      );
      computedItemsTotalMajor += lineTotal;
    }

    const vendorIds = Array.from(vendorWeightMajorById.keys());
    if (vendorIds.length === 0) throw new Error("No vendors found in cart");

    console.log("[Split] vendors resolved", {
      reference: args.reference,
      vendorCount: vendorIds.length,
      computedItemsTotalMajor,
    });

    const primaryBusinessName = requireEnv("PRIMARY_BUSINESS_NAME");
    const primaryBankCode = requireEnv("PRIMARY_BANK_CODE");
    const primaryAccountNumber = sanitizeAccountNumber(
      requireEnv("PRIMARY_ACCOUNT_NUMBER"),
    );

    const secondaryBusinessName = getOptionalEnv("SECONDARY_BUSINESS_NAME");
    const secondaryBankCode = getOptionalEnv("SECONDARY_BANK_CODE");
    const secondaryAccountNumberRaw = getOptionalEnv(
      "SECONDARY_ACCOUNT_NUMBER",
    );
    const secondaryAccountNumber = secondaryAccountNumberRaw
      ? sanitizeAccountNumber(secondaryAccountNumberRaw)
      : undefined;

    const testBankCode = getOptionalEnv("TEST_BANK_CODE");
    const testAccountNumberRaw = getOptionalEnv("TEST_ACCOUNT_NUMBER");
    const testAccountNumber = testAccountNumberRaw
      ? sanitizeAccountNumber(testAccountNumberRaw)
      : undefined;
    const useTestVendorDetails =
      vendorIds.length === 1 && !!testBankCode && !!testAccountNumber;

    const shouldUseTestPlatformDetails =
      isPaystackTestKey && !!testBankCode && !!testAccountNumber;

    console.log("[Split] env summary", {
      reference: args.reference,
      hasSecondaryPlatformRecipient:
        !!secondaryBusinessName &&
        !!secondaryBankCode &&
        !!secondaryAccountNumber,
      useTestVendorDetails,
      isPaystackTestKey,
      shouldUseTestPlatformDetails,
      currency,
    });

    // Infer delivery fee from the charged amount so dynamic fee policies
    // (including clearance extra-vendor fees) are reflected in split math.
    const inferredDeliveryFeeMajor = Number.isFinite(Number(payment.amount))
      ? Math.max(0, Number(payment.amount) - computedItemsTotalMajor)
      : Number.NaN;
    const deliveryFeeMajor = Number.isFinite(inferredDeliveryFeeMajor)
      ? inferredDeliveryFeeMajor
      : vendorIds.length > 0
        ? 1
        : 0;
    const deliveryFeeMinor = nonNegativeInt(toMinorUnits(deliveryFeeMajor));

    // Compute overall totals (prefer payment.amount from client to keep in sync).
    const orderTotalMajor = Number(
      payment.amount ?? computedItemsTotalMajor + deliveryFeeMajor,
    );
    const totalMinor = nonNegativeInt(toMinorUnits(orderTotalMajor));

    console.log("[Split] totals", {
      reference: args.reference,
      orderTotalMajor,
      totalMinor,
      deliveryFeeMajor,
      deliveryFeeMinor,
    });

    const chargedItemsTotalMajor = orderTotalMajor - deliveryFeeMajor;
    if (chargedItemsTotalMajor < 0) {
      throw new ConvexError("Order total cannot be less than delivery fee");
    }

    // Allocate the charged (non-delivery) total across vendors proportionally to weights.
    const vendorChargedMajorById = new Map<Id<"vendors">, number>();
    if (computedItemsTotalMajor > 0) {
      for (const vid of vendorIds) {
        const weight = vendorWeightMajorById.get(vid) || 0;
        vendorChargedMajorById.set(
          vid,
          (chargedItemsTotalMajor * weight) / computedItemsTotalMajor,
        );
      }
    } else {
      // Fallback: split equally if weights are unavailable.
      for (const vid of vendorIds) {
        vendorChargedMajorById.set(
          vid,
          chargedItemsTotalMajor / vendorIds.length,
        );
      }
    }

    type VendorForSplit = Doc<"vendors"> & { hub_manager?: unknown };
    type VendorBusinessDetails = {
      business_name: string;
      bank_code: string;
      account_number: string;
      paystack_subaccount_code?: string;
    };

    const requireVendorBusinessDetails = (vendor: {
      _id: Id<"vendors">;
      name?: unknown;
      business_details?: unknown;
    }): VendorBusinessDetails => {
      const details = vendor.business_details;
      const vendorName = typeof vendor.name === "string" ? vendor.name : "";

      const fallbackIfAllowed = (): VendorBusinessDetails => {
        if (!useTestVendorDetails || !testBankCode || !testAccountNumber) {
          throw new ConvexError(
            `Vendor business_details missing (business_name, bank_code, account_number required): ${vendor._id}`,
          );
        }
        return {
          business_name: vendorName || `vendor-${vendor._id}`,
          bank_code: testBankCode,
          account_number: testAccountNumber,
          paystack_subaccount_code: undefined,
        };
      };

      if (!isRecord(details)) {
        return fallbackIfAllowed();
      }

      const business_name =
        typeof details.business_name === "string" ? details.business_name : "";
      const bank_code_raw =
        typeof details.bank_code === "string" ? details.bank_code : "";
      const account_number_raw =
        typeof details.account_number === "string"
          ? details.account_number
          : "";
      const paystack_subaccount_code =
        typeof details.paystack_subaccount_code === "string"
          ? details.paystack_subaccount_code
          : undefined;

      const bank_code = bank_code_raw.trim();
      const account_number = account_number_raw
        ? sanitizeAccountNumber(account_number_raw)
        : "";

      if (!business_name || !bank_code || !account_number) {
        const fallback = fallbackIfAllowed();
        return {
          ...fallback,
          paystack_subaccount_code,
        };
      }

      return {
        business_name,
        bank_code,
        account_number,
        paystack_subaccount_code,
      };
    };

    const vendors: Array<{
      vendor: VendorForSplit;
      business: VendorBusinessDetails;
    }> = [];
    for (const vid of vendorIds) {
      const vendor = await ctx.runQuery(api.data.vendors.getVendorById, {
        vendorId: vid,
      });
      if (!vendor) throw new Error(`Vendor not found: ${vid}`);
      const business = requireVendorBusinessDetails({
        _id: vendor._id,
        name: vendor.name,
        business_details: vendor.business_details,
      });
      vendors.push({ vendor, business });
    }

    console.log("[Split] vendor business details prepared", {
      reference: args.reference,
      vendors: vendors.map(({ vendor, business }) => ({
        vendor_id: vendor._id,
        business_name: business.business_name,
        bank_code: business.bank_code,
        account_number: maskAccountNumber(business.account_number),
        has_subaccount_code: !!business.paystack_subaccount_code,
      })),
    });

    let commissionTotalMinor = 0;
    const vendorNetMinorById = new Map<Id<"vendors">, number>();
    const vendorCommissionMinorById = new Map<Id<"vendors">, number>();
    for (const { vendor } of vendors) {
      const vendorGrossMajor = vendorChargedMajorById.get(vendor._id) || 0;
      let commissionMajor = 0;
      if (vendor.commission_type === "percentage") {
        commissionMajor = (vendorGrossMajor * Number(vendor.commission)) / 100;
      } else if (vendor.commission_type === "fixed") {
        commissionMajor = Number(vendor.commission);
      }
      const commissionMinor = nonNegativeInt(toMinorUnits(commissionMajor));
      const vendorGrossMinor = nonNegativeInt(toMinorUnits(vendorGrossMajor));
      const vendorNetMinor = vendorGrossMinor - commissionMinor;
      if (vendorNetMinor < 0) {
        throw new Error(
          `Invalid split amounts for vendor ${vendor._id}: commission exceeds vendor gross`,
        );
      }
      vendorCommissionMinorById.set(vendor._id, commissionMinor);
      vendorNetMinorById.set(vendor._id, vendorNetMinor);
      commissionTotalMinor += commissionMinor;
    }

    // Sanity check: vendor nets + commission + delivery should not exceed total.
    const vendorNetSum = Array.from(vendorNetMinorById.values()).reduce(
      (s, n) => s + n,
      0,
    );
    const expected = vendorNetSum + commissionTotalMinor + deliveryFeeMinor;
    const delta = totalMinor - expected;
    if (delta !== 0) {
      // If we have a small rounding drift, adjust the first vendor's share so sums match exactly.
      if (Math.abs(delta) > 1) {
        throw new Error(
          `Invalid split totals: expected ${expected} but total is ${totalMinor}`,
        );
      }
      const firstVendorId = vendorIds[0];
      const current = vendorNetMinorById.get(firstVendorId) || 0;
      const adjusted = current + delta;
      if (adjusted < 0) {
        throw new Error("Rounding adjustment would make vendor share negative");
      }
      vendorNetMinorById.set(firstVendorId, adjusted);
    }

    // Ensure (or create) Paystack subaccounts.
    const getOrCreatePlatformSubaccount = async (
      key: "primary" | "secondary",
    ): Promise<string> => {
      const existing = await ctx.runQuery(api.data.paystack_subaccounts.getByKey, {
        key,
      });
      if (existing?.subaccount_code) {
        const exists = await paystackSubaccountExists(
          secret,
          existing.subaccount_code,
        );
        if (!exists) {
          console.warn(
            "[Split] platform subaccount code not found on Paystack; recreating",
            {
              reference: args.reference,
              key,
              subaccount_code: maskCode(existing.subaccount_code),
            },
          );
        } else {
          console.log("[Split] platform subaccount reuse", {
            reference: args.reference,
            key,
            subaccount_code: maskCode(existing.subaccount_code),
          });
          return existing.subaccount_code;
        }
      }

      if (key === "secondary") {
        if (
          !secondaryBusinessName ||
          !secondaryBankCode ||
          !secondaryAccountNumber
        ) {
          throw new Error(
            "Missing SECONDARY_* env vars (SECONDARY_BUSINESS_NAME, SECONDARY_BANK_CODE, SECONDARY_ACCOUNT_NUMBER)",
          );
        }
      }

      let business_name: string =
        key === "primary" ? primaryBusinessName : secondaryBusinessName!;
      let bank_code: string =
        key === "primary" ? primaryBankCode : secondaryBankCode!;
      let account_number: string =
        key === "primary" ? primaryAccountNumber : secondaryAccountNumber!;

      // Dev convenience: if PRIMARY_* isn't Paystack-resolvable, fall back to TEST_* so
      // you can keep real (e.g. Kenyan) platform bank details in env for live.
      // Always preflight resolve for better logs.
      const primaryResolved =
        key === "primary"
          ? await resolvePaystackBankAccount(
              secret,
              bank_code,
              account_number,
              "PRIMARY",
            )
          : null;

      if (
        key === "primary" &&
        shouldUseTestPlatformDetails &&
        !primaryResolved
      ) {
        console.warn(
          "[Split] PRIMARY bank details not resolvable; falling back to TEST_* for platform subaccount (test key)",
        );
        business_name = `${primaryBusinessName} (Test)`;
        bank_code = testBankCode!;
        account_number = testAccountNumber!;

        // Log whether TEST_* resolves (helps identify wrong test creds).
        await resolvePaystackBankAccount(
          secret,
          bank_code,
          account_number,
          "PRIMARY_FALLBACK_TEST",
        );
      }

      // Validate the actual account number we're about to send to Paystack.
      assertValidPaystackAccountNumber(
        account_number,
        key === "primary" ? "PRIMARY" : "SECONDARY",
      );

      console.log("[Split] creating platform subaccount", {
        reference: args.reference,
        key,
        business_name,
        settlement_bank: bank_code,
        account_number: maskAccountNumber(account_number),
      });

      const created = await paystackRequest(secret, "/subaccount", {
        method: "POST",
        body: JSON.stringify({
          business_name,
          settlement_bank: bank_code,
          account_number,
          percentage_charge: 0,
        }),
      });

      const subaccountCode = getNestedString(created, [
        "data",
        "subaccount_code",
      ]);
      if (!subaccountCode) {
        throw new Error("Paystack subaccount creation failed (no code)");
      }

      console.log("[Split] platform subaccount created", {
        reference: args.reference,
        key,
        subaccount_code: maskCode(subaccountCode),
      });

      await ctx.runMutation(api.data.paystack_subaccounts.upsert, {
        key: key as "primary" | "secondary",
        business_name,
        bank_code,
        account_number,
        subaccount_code: subaccountCode,
        raw: created,
      });
      return subaccountCode;
    };

    const getOrCreateVendorSubaccount = async (
      vendor: VendorForSplit,
      business: VendorBusinessDetails,
    ): Promise<string> => {
      const existingCode = business.paystack_subaccount_code;
      if (existingCode) {
        const exists = await paystackSubaccountExists(secret, existingCode);
        if (exists) {
          console.log("[Split] vendor subaccount reuse", {
            reference: args.reference,
            vendor_id: vendor._id,
            subaccount_code: maskCode(existingCode),
          });
          return existingCode;
        }

        console.warn(
          "[Split] vendor subaccount code not found on Paystack; recreating",
          {
            reference: args.reference,
            vendor_id: vendor._id,
            subaccount_code: maskCode(existingCode),
          },
        );
      }

      // Resolve first for more actionable errors in logs.
      await resolvePaystackBankAccount(
        secret,
        business.bank_code,
        business.account_number,
        `VENDOR:${vendor._id}`,
      );

      assertValidPaystackAccountNumber(
        business.account_number,
        `Vendor ${vendor._id}`,
      );

      console.log("[Split] creating vendor subaccount", {
        reference: args.reference,
        vendor_id: vendor._id,
        business_name: business.business_name,
        settlement_bank: business.bank_code,
        account_number: maskAccountNumber(business.account_number),
      });

      const created = await paystackRequest(secret, "/subaccount", {
        method: "POST",
        body: JSON.stringify({
          business_name: business.business_name,
          settlement_bank: business.bank_code,
          account_number: business.account_number,
          percentage_charge: 0,
        }),
      });

      const subaccountCode = getNestedString(created, [
        "data",
        "subaccount_code",
      ]);
      if (!subaccountCode) {
        throw new Error("Paystack vendor subaccount creation failed (no code)");
      }

      console.log("[Split] vendor subaccount created", {
        reference: args.reference,
        vendor_id: vendor._id,
        subaccount_code: maskCode(subaccountCode),
      });

      await ctx.runMutation(api.data.vendors.setVendorPaystackSubaccountCode, {
        vendorId: vendor._id,
        subaccountCode,
      });
      return subaccountCode;
    };

    const getOrCreateIndustryCommissionSubaccount = async (
      industryId: Id<"industry">,
      vendorIdForLog: Id<"vendors">,
    ): Promise<string | null> => {
      const industry = await ctx.runQuery(api.data.industry.getIndustryById, {
        id: industryId,
      });
      if (!industry) return null;

      const details = industry.bank_details;
      if (!isRecord(details)) return null;

      const business_name =
        typeof details.business_name === "string" ? details.business_name : "";
      const bank_code_raw =
        typeof details.bank_code === "string" ? details.bank_code : "";
      const account_number_raw =
        typeof details.account_number === "string"
          ? details.account_number
          : "";
      const existingCode =
        typeof details.paystack_subaccount_code === "string"
          ? details.paystack_subaccount_code
          : undefined;

      const bank_code = bank_code_raw.trim();
      const account_number = account_number_raw
        ? sanitizeAccountNumber(account_number_raw)
        : "";

      if (!business_name || !bank_code || !account_number) {
        return null;
      }

      if (existingCode) {
        const exists = await paystackSubaccountExists(secret, existingCode);
        if (exists) {
          console.log("[Split] industry commission subaccount reuse", {
            reference: args.reference,
            industry_id: industryId,
            vendor_id: vendorIdForLog,
            subaccount_code: maskCode(existingCode),
          });
          return existingCode;
        }

        console.warn(
          "[Split] industry commission subaccount code not found on Paystack; recreating",
          {
            reference: args.reference,
            industry_id: industryId,
            vendor_id: vendorIdForLog,
            subaccount_code: maskCode(existingCode),
          },
        );
      }

      // Resolve first for more actionable errors in logs.
      await resolvePaystackBankAccount(
        secret,
        bank_code,
        account_number,
        `INDUSTRY:${industryId}`,
      );

      assertValidPaystackAccountNumber(
        account_number,
        `Industry ${industryId}`,
      );

      console.log("[Split] creating industry commission subaccount", {
        reference: args.reference,
        industry_id: industryId,
        vendor_id: vendorIdForLog,
        business_name,
        settlement_bank: bank_code,
        account_number: maskAccountNumber(account_number),
      });

      const created = await paystackRequest(secret, "/subaccount", {
        method: "POST",
        body: JSON.stringify({
          business_name,
          settlement_bank: bank_code,
          account_number,
          percentage_charge: 0,
        }),
      });

      const subaccountCode = getNestedString(created, [
        "data",
        "subaccount_code",
      ]);
      if (!subaccountCode) {
        throw new Error(
          "Paystack industry commission subaccount creation failed (no code)",
        );
      }

      console.log("[Split] industry commission subaccount created", {
        reference: args.reference,
        industry_id: industryId,
        vendor_id: vendorIdForLog,
        subaccount_code: maskCode(subaccountCode),
      });

      await ctx.runMutation(api.data.industry.updateIndustry, {
        id: industryId,
        updates: {
          bank_details: {
            business_name,
            bank_code,
            account_number,
            paystack_subaccount_code: subaccountCode,
            kra_pin:
              typeof details.kra_pin === "string" ? details.kra_pin : undefined,
          },
        },
      });

      return subaccountCode;
    };

    const primarySub = await getOrCreatePlatformSubaccount("primary");
    const hasSecondaryPlatformRecipient =
      !!secondaryBusinessName &&
      !!secondaryBankCode &&
      !!secondaryAccountNumber;
    const secondarySub = hasSecondaryPlatformRecipient
      ? await getOrCreatePlatformSubaccount("secondary")
      : primarySub;

    // Commission recipients: route each vendor's commission to an industry-based
    // commission subaccount when the vendor has an industry with allocated bank_details.
    // Otherwise, fall back to the legacy platform primary commission account.
    const commissionMinorBySubaccount = new Map<string, number>();
    for (const { vendor } of vendors) {
      const commissionMinor = vendorCommissionMinorById.get(vendor._id) || 0;
      if (commissionMinor <= 0) continue;

      let commissionSub = primarySub;
      const industryId = vendor.industry_id as Id<"industry"> | undefined;

      if (industryId) {
        try {
          const maybe = await getOrCreateIndustryCommissionSubaccount(
            industryId,
            vendor._id,
          );
          if (maybe) commissionSub = maybe;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            "[Split] failed to resolve industry commission subaccount; falling back to primary",
            {
              reference: args.reference,
              vendor_id: vendor._id,
              industry_id: industryId,
              error: msg,
            },
          );
        }
      }

      commissionMinorBySubaccount.set(
        commissionSub,
        (commissionMinorBySubaccount.get(commissionSub) || 0) + commissionMinor,
      );
    }

    const vendorSubs: Array<{
      vendor_id: Id<"vendors">;
      subaccount: string;
      share: number;
    }> = [];
    for (const { vendor, business } of vendors) {
      const vendorSub = await getOrCreateVendorSubaccount(vendor, business);
      const share = vendorNetMinorById.get(vendor._id) || 0;
      if (share > 0) {
        vendorSubs.push({
          vendor_id: vendor._id,
          subaccount: vendorSub,
          share,
        });
      }
    }

    const rawSubaccounts = [
      ...Array.from(commissionMinorBySubaccount.entries()).map(
        ([subaccount, share]) => ({ subaccount, share }),
      ),
      { subaccount: secondarySub, share: deliveryFeeMinor },
      ...vendorSubs.map((v) => ({ subaccount: v.subaccount, share: v.share })),
    ].filter((s) => s.share > 0);

    // Aggregate shares by subaccount to avoid duplicates.
    const aggregatedBySubaccount = new Map<string, number>();
    for (const r of rawSubaccounts) {
      aggregatedBySubaccount.set(
        r.subaccount,
        (aggregatedBySubaccount.get(r.subaccount) || 0) + r.share,
      );
    }
    const subaccounts = Array.from(aggregatedBySubaccount.entries()).map(
      ([subaccount, share]) => ({ subaccount, share }),
    );

    console.log("[Split] creating split", {
      reference: args.reference,
      recipients: subaccounts.map((s) => ({
        subaccount: maskCode(s.subaccount),
        share: s.share,
      })),
    });

    if (subaccounts.length < 2) {
      throw new ConvexError(
        "Split configuration invalid: need at least two positive recipients",
      );
    }

    const splitPayloadBase: {
      name: string;
      type: "flat";
      subaccounts: typeof subaccounts;
      currency?: string;
    } = {
      name: `checkout-${args.reference}`,
      type: "flat",
      subaccounts,
      currency,
    };

    let split: unknown;
    try {
      split = await paystackRequest(secret, "/split", {
        method: "POST",
        body: JSON.stringify(splitPayloadBase),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const currencyNotAllowed = msg.includes(
        "Specified currency is not allowed on this integration",
      );
      const currencyMismatch = msg.includes(
        "Some subaccount's currency do not match the split currency",
      );
      if (currencyNotAllowed && splitPayloadBase.currency) {
        console.warn(
          "[Split] Paystack integration rejected explicit currency; retrying split creation without currency",
          {
            reference: args.reference,
            attemptedCurrency: splitPayloadBase.currency,
          },
        );
        const { currency: _currency, ...withoutCurrency } = splitPayloadBase;
        split = await paystackRequest(secret, "/split", {
          method: "POST",
          body: JSON.stringify(withoutCurrency),
        });
      } else if (currencyMismatch) {
        await logPaystackSubaccountCurrencies(
          secret,
          subaccounts.map((s) => s.subaccount),
          args.reference,
        );
        throw err;
      } else {
        throw err;
      }
    }

    const splitCode = getNestedString(split, ["data", "split_code"]);
    if (!splitCode) throw new Error("Paystack split creation failed (no code)");

    console.log("[Split] split created", {
      reference: args.reference,
      split_code: maskCode(splitCode),
    });

    const vendorMinorTotal = vendorSubs.reduce((s, v) => s + v.share, 0);
    const breakdown = {
      total_minor: totalMinor,
      commission_minor: commissionTotalMinor,
      delivery_fee_minor: deliveryFeeMinor,
      vendor_minor: vendorMinorTotal,
      vendors: vendorSubs.map((v) => ({
        vendor_id: v.vendor_id,
        vendor_minor: v.share,
        commission_minor: vendorCommissionMinorById.get(v.vendor_id) || 0,
        gross_minor: nonNegativeInt(
          toMinorUnits(vendorChargedMajorById.get(v.vendor_id) || 0),
        ),
      })),
      split_code: splitCode,
    };

    await ctx.runMutation(api.data.payments.setPaymentSplit, {
      reference: args.reference,
      split_code: splitCode,
      breakdown,
    });

    console.log("[Split] persisted split on payment", {
      reference: args.reference,
      split_code: maskCode(splitCode),
      breakdown: {
        total_minor: breakdown.total_minor,
        commission_minor: breakdown.commission_minor,
        delivery_fee_minor: breakdown.delivery_fee_minor,
        vendor_minor: breakdown.vendor_minor,
        vendor_count: breakdown.vendors?.length || 0,
      },
    });

    return { split_code: splitCode, breakdown, reused: false };
  },
});

// Helper mutation to apply verification results
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
//       v.union(v.literal("customer"), v.literal("receiver"))
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
    payerType: v.union(v.literal("customer"), v.literal("receiver")),
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
      v.union(v.literal("customer"), v.literal("receiver")),
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
