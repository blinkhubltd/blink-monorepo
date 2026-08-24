import { httpRouter } from "convex/server";
import { handleAgentScan } from "./webhooks/agent_scan";
import { ingestRiderLocation } from "./webhooks/location";
import { clerkWebhook } from "./user/clerk";
import { paystackWebhook } from "./webhooks/paystack";

/**
 * HTTP routes.
 *
 * ── Conventions (sydia) ───────────────────────────────────────────────────
 *
 *   - Versioned path prefix, built with a template literal off `api_v1`.
 *   - Non-trivial handlers live in their domain module and are imported here;
 *     `http.ts` is routing only.
 *   - Handlers never touch `ctx.db` directly — always `ctx.runQuery(internal.*)`
 *     or `ctx.runMutation(internal.*)`.
 *   - Webhooks acknowledge (200) anything they cannot handle. A non-2xx makes the
 *     provider retry forever.
 *
 * ── Path versioning and the Clerk dashboard ───────────────────────────────
 *
 * Every route is served at both `/api/v1/<path>` and its original unversioned
 * path. The legacy aliases exist because the webhook URL is configured in the
 * Clerk dashboard, not in this repo — changing the path here without updating
 * Clerk silently stops user sync. Keep both until the dashboard is repointed,
 * then delete the aliases in one commit.
 */

const http = httpRouter();

const api_v1 = "/api/v1";

// ── Webhooks ──────────────────────────────────────────────────────────────

// Clerk user sync. Signature-verified with svix inside the handler.
http.route({
  path: `${api_v1}/webhooks/clerk`,
  method: "POST",
  handler: clerkWebhook,
});
// Legacy alias — matches what is configured in the Clerk dashboard today.
http.route({ path: "/clerk", method: "POST", handler: clerkWebhook });

// Paystack charge/transfer events. HMAC-SHA512 verified inside the handler.
// New route: there was no Paystack webhook before, so there is no legacy alias
// and no existing dashboard configuration to preserve. Register this URL in the
// Paystack dashboard under Settings -> API Keys & Webhooks.
http.route({
  path: `${api_v1}/webhooks/paystack`,
  method: "POST",
  handler: paystackWebhook,
});

// ── Ingest ────────────────────────────────────────────────────────────────

/**
 * Rider GPS ingest.
 *
 * NOTE: not currently authenticated correctly. The handler falls back to
 * `body.clerkId` when there is no identity, and also accepts `body.riderId`
 * directly, so a caller can post positions as any rider. The Phase B0 audit
 * found `location.ts` is **not deployed** on the live deployment, so this is not
 * currently exploitable — which is why it was moved out of the security-critical
 * batch. It must be fixed before this route goes live anywhere.
 */
http.route({
  path: `${api_v1}/riders/location`,
  method: "POST",
  handler: ingestRiderLocation,
});
http.route({
  path: "/rider/location",
  method: "POST",
  handler: ingestRiderLocation,
});

// ── Public landing pages ──────────────────────────────────────────────────

// Agent referral QR target. Intentionally unauthenticated — it is the
// destination of a printed QR code scanned by prospective customers.
http.route({
  path: `${api_v1}/agents/scan`,
  method: "GET",
  handler: handleAgentScan,
});
http.route({ path: "/agent/scan", method: "GET", handler: handleAgentScan });

export default http;
