import { v, ConvexError } from "convex/values";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { getOptionalEnv, requireEnv } from "../lib/env";
import { PAYSTACK_BASE_URL } from "../lib/paystack";
import { getNestedString, isRecord } from "../lib/json";
import { getPaystackCurrency, paystackRequest } from "./paystack_api";

/**
 * Multi-vendor Paystack split preparation.
 *
 * Lifted verbatim out of `data/payments.ts`, where it was a single 858-line
 * action handler — 33% of that file and the largest function in the codebase. It
 * did settings lookup, vendor grouping, commission arithmetic, two Paystack API
 * calls and persistence in one body, with a 25-line inline return-type
 * annotation.
 *
 * It has **zero callers in any app**, yet 12 of 102 rows in the live `payments`
 * table carry a `paystack_split_breakdown` — so splits have executed, by some
 * path other than this function. Confirm which before changing behaviour here.
 *
 * This commit only moves it. Breaking the handler into settings / grouping /
 * commission / API / persistence stages is the next step, and the commission
 * arithmetic is the piece that wants extracting to a pure, tested `lib/`
 * module first.
 */

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

// Prepare Paystack split_code for a cart checkout payment reference.
// This is called from the mobile client BEFORE opening Paystack popup.
export const preparePaystackSplitForCheckout = internalAction({
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

      await ctx.runMutation(internal.data.paystack_subaccounts.upsert, {
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

    await ctx.runMutation(internal.data.payments.setPaymentSplit, {
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
