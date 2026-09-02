import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import {
  extractReference,
  isChargeEvent,
  isTransferEvent,
  parseWebhookPayload,
  verifyPaystackSignature,
} from "../lib/paystack";

/**
 * Paystack webhook.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Blink had no Paystack webhook at all. Payment confirmation relied entirely on
 * the client polling `payments.verifyPaystack` every 10 seconds for at most 12
 * attempts — two minutes — and then giving up
 * (`CollectPaymentModal`, MAX_ATTEMPTS = 12).
 *
 * M-Pesa STK pushes routinely take longer than two minutes: the customer has to
 * find their phone, read the prompt and type a PIN. When they do, the charge
 * succeeds at Paystack and Blink never hears about it. The rider is shown
 * "Payment Failed" for money that was actually collected, and the order is left
 * unpaid.
 *
 * ── The design: notify, don't decide ──────────────────────────────────────
 *
 * This handler is deliberately thin. It does **not** write payment state from the
 * webhook body. It verifies the signature, extracts the reference, and calls the
 * existing `payments.verifyPaystack` action — which performs its own
 * server-to-server verification against Paystack's API and applies the result
 * through `applyVerificationResult`.
 *
 * So the webhook is a *trigger*, never a source of truth. Three benefits:
 *
 *   1. No new payment logic. The state transition is the same code path the
 *      polling flow already exercises, so the webhook cannot disagree with it.
 *   2. Idempotency comes for free — `applyVerificationResult` already guards on
 *      the payment record's status, and Paystack retries webhooks.
 *   3. Even a forged payload (impossible past the signature check, but still)
 *      could only cause Blink to *ask Paystack* about a reference. It cannot
 *      assert an outcome.
 *
 * ── Protocol ──────────────────────────────────────────────────────────────
 *
 *   - Signature failure -> 401, never a throw. A throw is a 500, and 5xx is
 *     retryable, so a permanently-bad signature would retry forever.
 *   - Unknown event, unparseable body, or missing reference -> 200. Same reason.
 *   - Verification errors -> 500, deliberately, so Paystack *does* retry. This is
 *     the one case where a retry is what we want.
 *   - The raw body is read once with `req.text()` and the signature is checked
 *     against those exact bytes before anything is parsed.
 */

const secretKey = process.env.PAYSTACK_SECRET_KEY;

if (!secretKey) {
  // Not a throw — same bootstrap reasoning as the Clerk webhook. Fails closed
  // at request time with a 503, which Paystack retries.
  console.error(
    "[paystack] PAYSTACK_SECRET_KEY is not set — webhook DISABLED. " +
      "Every event will be rejected with 503 until it is configured: " +
      "npx convex env set PAYSTACK_SECRET_KEY sk_...",
  );
}

export const paystackWebhook = httpAction(async (ctx, request) => {
  if (!secretKey) {
    console.error("[paystack] rejected webhook: PAYSTACK_SECRET_KEY not set");
    return new Response("Webhook not configured", { status: 503 });
  }

  // Exact received bytes — these are what Paystack signed.
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  const valid = await verifyPaystackSignature(rawBody, signature, secretKey);
  if (!valid) {
    // Never log the signature itself.
    console.error("[paystack] signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = parseWebhookPayload(rawBody);
  if (!payload) {
    // Authenticated but unreadable. Acknowledge so Paystack stops retrying.
    console.error("[paystack] authenticated payload could not be parsed");
    return new Response(null, { status: 200 });
  }

  if (isTransferEvent(payload.event)) {
    // Agent payouts. Recognised but not yet acted on — payout records are
    // currently updated inline by agentPaymentRequests.processPaymentRequest,
    // and moving that onto this webhook is a separate change.
    console.log(`[paystack] transfer event received: ${payload.event}`);
    return new Response(null, { status: 200 });
  }

  if (!isChargeEvent(payload.event)) {
    console.log(`[paystack] unhandled event: ${payload.event}`);
    return new Response(null, { status: 200 });
  }

  const reference = extractReference(payload);
  if (!reference) {
    console.error(`[paystack] ${payload.event} arrived with no reference`);
    return new Response(null, { status: 200 });
  }

  try {
    // `api.` rather than `internal.`: verifyPaystack is still public because the
    // client polling path in blink-ecommerce calls it directly
    // (hooks/usePayment.ts, components/payments/PaystackPayment.tsx). Once the
    // apps rely on this webhook instead of polling, it can become an
    // internalAction and this becomes `internal.`.
    await ctx.runAction(internal.data.payments.verifyPaystack, { reference });
    console.log(`[paystack] verified ${payload.event} for ${reference}`);
    return new Response(null, { status: 200 });
  } catch (error) {
    // 500 on purpose: we want Paystack to retry a verification that failed for
    // a transient reason. This is the only path here that should be retryable.
    console.error(
      `[paystack] verification failed for ${reference}:`,
      error instanceof Error ? error.message : "unknown error",
    );
    return new Response("Verification failed", { status: 500 });
  }
});
