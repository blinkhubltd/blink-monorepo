/**
 * Paystack primitives. Pure — no `ctx`, no `fetch`, no database access.
 *
 * ── What this consolidates ────────────────────────────────────────────────
 *
 * `PAYSTACK_BASE_URL` was declared three times in the vendored tree — twice as a
 * local `const` (in what are now `data/payments.ts` and
 * `data/agentPaymentRequests.ts`) and once as a bare literal inside a `fetch`.
 * All three now import from here.
 *
 * That duplication was not merely untidy: a scripted rewrite during the folder
 * restructure corrupted all three copies at once, and the only thing that caught
 * it was a test asserting this constant's value. One definition means one place
 * to get wrong.
 *
 * ── Amounts ───────────────────────────────────────────────────────────────
 *
 * Paystack works in the currency's *minor unit* — cents for KES. Blink stores
 * major units. Every conversion must be integer-only: a fractional minor unit is
 * rejected by the API, and floating-point drift on money is how you end up a cent
 * short on a split that must sum exactly.
 */

import { getNestedString } from "./json";

export const PAYSTACK_BASE_URL = "https://api.paystack.co";

export const paystackPaths = {
  verifyTransaction: (reference: string) =>
    `/transaction/verify/${encodeURIComponent(reference)}`,
  initializeTransaction: () => "/transaction/initialize",
  subaccount: () => "/subaccount",
  split: () => "/split",
  transfer: () => "/transfer",
  transferRecipient: () => "/transferrecipient",
} as const;

// ── Amount conversion ─────────────────────────────────────────────────────

/**
 * Major units (KES) to minor units (cents).
 *
 * Rounds to the nearest whole minor unit. Throws on a non-finite or negative
 * input rather than sending `NaN` to Paystack, which the API accepts as `0`.
 */
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  if (amount < 0) {
    throw new Error(`Amount cannot be negative: ${amount}`);
  }
  return Math.round(amount * 100);
}

export function fromMinorUnits(minor: number): number {
  if (!Number.isInteger(minor)) {
    throw new Error(`Minor units must be an integer: ${minor}`);
  }
  return minor / 100;
}

// ── Webhook signature verification ────────────────────────────────────────

/**
 * Paystack signs each webhook with HMAC-SHA512 over the **raw request body**,
 * keyed by the account's secret key, delivered hex-encoded in
 * `x-paystack-signature`.
 *
 * Two things matter and are easy to get wrong:
 *
 *   1. The body must be the exact bytes received. Parsing to JSON and
 *      re-serialising changes key order and whitespace, and the signature no
 *      longer matches. Callers must pass `await req.text()` taken before any
 *      parse.
 *   2. The comparison must not short-circuit on the first differing byte. A
 *      `===` on hex strings leaks, through timing, how many leading characters
 *      an attacker guessed correctly — which is enough to forge a signature
 *      given enough attempts.
 */
export async function verifyPaystackSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string,
): Promise<boolean> {
  if (!signatureHeader || !secretKey) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = toHex(new Uint8Array(mac));

  return timingSafeEqual(expected, signatureHeader.trim().toLowerCase());
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Length-independent, non-short-circuiting string comparison.
 *
 * The length check is deliberately folded into the accumulator rather than
 * returned early, so a wrong-length signature costs the same as a wrong-value
 * one.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ── Events ────────────────────────────────────────────────────────────────

/**
 * Webhook events Blink acts on.
 *
 * `charge.success` is the one that matters: it is what closes the gap left by
 * the client polling `verifyPaystack` for only 2 minutes.
 *
 * Transfer events relate to agent payouts (`agentPaymentRequests`). They are
 * recognised here but not yet acted on — the payout records are currently
 * updated inline by `processPaymentRequest`, and rewiring that is a separate
 * change.
 */
export const PAYSTACK_CHARGE_EVENTS = [
  "charge.success",
  "charge.failed",
] as const;

export const PAYSTACK_TRANSFER_EVENTS = [
  "transfer.success",
  "transfer.failed",
  "transfer.reversed",
] as const;

export type PaystackChargeEvent = (typeof PAYSTACK_CHARGE_EVENTS)[number];

export type PaystackWebhookEvent = {
  event: string;
  data?: {
    reference?: string;
    status?: string;
    amount?: number;
    [k: string]: unknown;
  };
};

export function isChargeEvent(event: string): event is PaystackChargeEvent {
  return (PAYSTACK_CHARGE_EVENTS as readonly string[]).includes(event);
}

export function isTransferEvent(event: string): boolean {
  return (PAYSTACK_TRANSFER_EVENTS as readonly string[]).includes(event);
}

/**
 * Pull the transaction reference out of a webhook payload.
 *
 * Returns `null` rather than throwing: an authenticated payload we cannot read
 * must still be acknowledged with a 200, or Paystack retries it forever.
 */
export function extractReference(
  payload: PaystackWebhookEvent,
): string | null {
  const ref = payload.data?.reference;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

/**
 * Parse a raw webhook body.
 *
 * Separate from signature verification so the signature is always checked
 * against the raw bytes, never against a re-serialised object.
 */
export function parseWebhookPayload(
  rawBody: string,
): PaystackWebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as PaystackWebhookEvent).event !== "string"
    ) {
      return null;
    }
    return parsed as PaystackWebhookEvent;
  } catch {
    return null;
  }
}

// ── Channel mapping ───────────────────────────────────────────────────────

/**
 * Map a Paystack transaction's `channel` onto Blink's `payment_method`.
 *
 * Unifies two copies that lived inside the order finalisers. They were not
 * identical code — one checked for "card" explicitly, the other let it fall
 * through to the default — but they are equivalent for every input, which is why
 * unifying them is behaviour-preserving:
 *
 *   contains "mobile" or "mpesa"  ->  Mobile Money
 *   contains "bank"               ->  Bank Transfer
 *   contains "card"               ->  Card  (explicit in one copy, default in the other)
 *   anything else, or absent      ->  Card
 *
 * The default is deliberately Card rather than a throw: the channel is
 * informational on an already-settled payment, and failing order creation
 * because Paystack sent an unfamiliar channel string would be worse than
 * recording a slightly wrong label.
 *
 * Reads two locations because Paystack has moved it between them:
 * `data.channel` and `data.authorization.channel`.
 */
export function paymentMethodFromChannel(
  paystackResponse: unknown,
): "Card" | "Mobile Money" | "Bank Transfer" {
  const channel =
    getNestedString(paystackResponse, ["data", "channel"]) ||
    getNestedString(paystackResponse, ["data", "authorization", "channel"]) ||
    "";
  const lower = String(channel).toLowerCase();
  if (lower.includes("mobile") || lower.includes("mpesa")) return "Mobile Money";
  if (lower.includes("bank")) return "Bank Transfer";
  return "Card";
}
