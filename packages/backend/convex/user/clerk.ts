import { Webhook } from "svix";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

/**
 * Clerk user-sync webhook.
 *
 * ── Webhook protocol (sydia conventions) ──────────────────────────────────
 *
 *   1. Signature failure returns 401. It never throws — a thrown error becomes a
 *      500, and Clerk treats 5xx as retryable, so a permanently-bad signature
 *      would be retried forever.
 *   2. An unrecognised `event.type` returns **200**, not an error. Same reasoning:
 *      a non-2xx makes the provider retry a payload we are never going to handle.
 *      Unknown types are logged and acknowledged.
 *   3. The handler does no direct database access. Everything goes through
 *      `ctx.runMutation(internal.*)`.
 *   4. The raw body is read with `req.text()` **before** parsing, so the bytes
 *      that get verified are the bytes that were signed.
 *
 * ── What changed from the vendored version ────────────────────────────────
 *
 *   - **Stopped logging `svix-signature`.** The previous version logged all svix
 *     headers, including the signature, on every request. Signature material in
 *     logs is a credential leak.
 *   - **Missing-secret handling made visible and self-healing.** It previously
 *     threw a bare `Error` inside the handler, producing an opaque 500 while the
 *     deployment still booted healthy — so a missing secret meant user sync
 *     silently stopped with nothing obviously broken. It now logs the reason once
 *     at startup and rejects each request with an explicit **503**. See the
 *     comment on the guard below for why this is not a module-load throw.
 *     (The Phase B0 audit confirmed the secret *is* set on the live deployment,
 *     so this is prevention, not a live fix.)
 *   - **Non-null assertions removed.** The three headers were asserted non-null
 *     on the line above the check that they were present.
 *   - **Event payload is shape-checked** before use. `email_addresses[0]` was
 *     indexed with no validation, and the local `WebhookEvent` type declared
 *     `data` as `Record<string, any>`, so nothing was actually typed.
 *   - **`event.type` allowlist.** Only the three handled types are acted on.
 *
 * The svix verification itself is unchanged: it was already correct.
 */

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

if (!webhookSecret) {
  // Loud, but NOT a throw.
  //
  // Throwing here would block the deploy, which sounds safer but creates a
  // bootstrap deadlock: Clerk only issues the signing secret once you register
  // an endpoint, and you cannot register an endpoint without a deployed URL. So
  // a fresh deployment could never be stood up.
  //
  // Instead the handler fails closed at request time with a 503. 503 is
  // retryable, so once the secret is set Clerk's own retries deliver the events
  // that were rejected in the meantime — the gap self-heals rather than being
  // lost. And unlike the original code, which threw a bare Error inside the
  // handler and produced an opaque 500, the reason is stated once at startup and
  // again on every rejected request.
  console.error(
    "[clerk] CLERK_WEBHOOK_SECRET is not set — user sync is DISABLED. " +
      "Every webhook will be rejected with 503 until it is configured: " +
      "npx convex env set CLERK_WEBHOOK_SECRET whsec_...",
  );
}

/** Event types this handler acts on. Anything else is acknowledged and ignored. */
const HANDLED_EVENTS = [
  "user.created",
  "user.updated",
  "user.deleted",
] as const;

type ClerkEmailAddress = { email_address?: string };

type ClerkUserData = {
  id?: string;
  email_addresses?: ClerkEmailAddress[];
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
};

type ClerkWebhookEvent = {
  type: string;
  data: ClerkUserData;
};

/**
 * Build a display name from Clerk's first/last, tolerating either being absent.
 *
 * The previous version interpolated both unconditionally, which produced and
 * then stored the literal strings "null null" / "undefined undefined" for users
 * who had not set a name.
 */
function displayName(data: ClerkUserData): string | undefined {
  const parts = [data.first_name, data.last_name].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function primaryEmail(data: ClerkUserData): string | undefined {
  const email = data.email_addresses?.[0]?.email_address;
  return typeof email === "string" && email.length > 0 ? email : undefined;
}

export const clerkWebhook = httpAction(async (ctx, request) => {
  if (!webhookSecret) {
    // Fail closed. 503 so Clerk retries once the secret exists.
    console.error("[clerk] rejected webhook: CLERK_WEBHOOK_SECRET not set");
    return new Response("Webhook not configured", { status: 503 });
  }

  const event = await verifyRequest(request);

  // 401, not 400: the request was well-formed, it just was not authenticated.
  if (!event) {
    return new Response("Invalid signature", { status: 401 });
  }

  if (!HANDLED_EVENTS.includes(event.type as (typeof HANDLED_EVENTS)[number])) {
    // 200 on purpose — see protocol note 2.
    console.log(`[clerk] unhandled event type: ${event.type}`);
    return new Response(null, { status: 200 });
  }

  const clerkId = event.data.id;
  if (!clerkId) {
    // Malformed but authenticated. Acknowledge so Clerk stops retrying, and log
    // loudly because this should be impossible.
    console.error(`[clerk] ${event.type} arrived with no user id`);
    return new Response(null, { status: 200 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      await ctx.runMutation(internal.user.users.upsertUser, {
        clerkId,
        email: primaryEmail(event.data),
        name: displayName(event.data),
        image: event.data.image_url ?? undefined,
      });
      break;
    }
    case "user.deleted": {
      await ctx.runMutation(internal.user.users.deleteUser, { clerkId });
      break;
    }
  }

  return new Response(null, { status: 200 });
});

async function verifyRequest(req: Request): Promise<ClerkWebhookEvent | null> {
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    // Deliberately does not log the header values.
    console.error("[clerk] missing svix headers");
    return null;
  }

  // Read the raw body before parsing — these are the bytes that were signed.
  const payload = await req.text();

  try {
    return new Webhook(webhookSecret as string).verify(payload, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    }) as ClerkWebhookEvent;
  } catch (error) {
    // Log that verification failed, never the signature that failed it.
    console.error(
      "[clerk] signature verification failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
}
