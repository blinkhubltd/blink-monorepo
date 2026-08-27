import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every order-path write must be authenticated, and none may be told who it is.
 *
 * ── What this was written for ────────────────────────────────────────────
 *
 * `data/orders.ts` and `data/payment_finalization.ts` had **zero** auth checks
 * between them — 13 public mutations and 14 public queries in the first, four
 * public mutations in the second — and the four finalisers each took
 * `user_id: v.id("users")` as an argument. Those four are the real
 * order-creating entry points (`createOrder` has no callers at all), so an
 * anonymous caller could create orders as any customer at prices of their own
 * choosing.
 *
 * Three delivery-code holes were worse than the pricing, because they are not
 * about money being miscounted but about goods being released to the wrong
 * person:
 *
 *   - `generateDeliveryCode` **returned the existing code** to any caller.
 *     Not brute force — straight disclosure of the secret that authorises a
 *     handover.
 *   - `checkDeliveryCode` was a free, side-effect-free oracle for testing
 *     candidate codes against an order.
 *   - `verifyDeliveryCode` took `riderId` as an argument and ignored it, so
 *     anyone could mark somebody else's order Delivered.
 *
 * Source-scanning, like the cart and catalogue guards, because every one of
 * these compiles, type-checks and looks ordinary at the call site.
 */

const BACKEND = join(__dirname, "..", "convex", "data");
const orders = readFileSync(join(BACKEND, "orders.ts"), "utf8");
const finalization = readFileSync(
  join(BACKEND, "payment_finalization.ts"),
  "utf8",
);

const GUARDS =
  /getAuthUser|assertPermission|assertSuperAdmin|assertStaffOrPermission|callerFinalising|callerUser/;

/** Brace-matched `args:` block — see the note in cart-auth-api.test.ts. */
function argsOf(body: string): string {
  const start = body.indexOf("args:");
  if (start === -1) return "";
  const open = body.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < body.length; i += 1) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") {
      depth -= 1;
      if (depth === 0) return body.slice(open + 1, i);
    }
  }
  return "";
}

function publicMutations(source: string): { name: string; body: string }[] {
  const pattern = /export const (\w+) = mutation\(\{([\s\S]*?)\n\}\);/g;
  return [...source.matchAll(pattern)].map((m) => ({
    name: m[1]!,
    body: m[2]!,
  }));
}

describe("the delivery-code surface", () => {
  it("generateDeliveryCode is internal, so it cannot disclose the code", () => {
    // The early return hands back `order.delivery_code` when one already exists.
    // As a public mutation that was the whole exploit.
    expect(orders).toMatch(
      /export const generateDeliveryCode = internalMutation\(/,
    );
    expect(orders).not.toMatch(/export const generateDeliveryCode = mutation\(/);
  });

  it("checkDeliveryCode is internal, so it is not a brute-force oracle", () => {
    expect(orders).toMatch(/export const checkDeliveryCode = internalQuery\(/);
    expect(orders).not.toMatch(/export const checkDeliveryCode = query\(/);
  });

  it("verifyDeliveryCode authenticates and checks the assigned rider", () => {
    const body = publicMutations(orders).find(
      (m) => m.name === "verifyDeliveryCode",
    )?.body;
    expect(body).toBeDefined();
    expect(body!).toMatch(/getAuthUser\(ctx\)/);
    // The check that matters: the caller must BE the order's rider.
    expect(body!).toMatch(/order\.rider_id !== user\._id/);
  });

  it("verifyDeliveryCode no longer accepts a rider id it would ignore", () => {
    const body = publicMutations(orders).find(
      (m) => m.name === "verifyDeliveryCode",
    )!.body;
    expect(argsOf(body)).not.toMatch(/riderId/);
  });
});

describe("payment finalisation — the real order-creating path", () => {
  const mutations = publicMutations(finalization);

  it("finds all four (the extractor is not silently broken)", () => {
    expect(mutations.map((m) => m.name).sort()).toEqual([
      "finalizePaidClearanceOrders",
      "finalizePaidOrders",
      "finalizePayOnDeliveryClearanceOrders",
      "finalizePayOnDeliveryOrders",
    ]);
  });

  it("every finaliser authenticates", () => {
    const unguarded = mutations
      .filter((m) => !GUARDS.test(m.body))
      .map((m) => m.name);
    expect(unguarded).toEqual([]);
  });

  it("no finaliser accepts a user id — identity comes from the token", () => {
    // This is what let an anonymous caller create orders as any customer.
    for (const m of mutations) {
      expect(argsOf(m.body), `${m.name} args`).not.toMatch(/user_id/);
      expect(argsOf(m.body), `${m.name} args`).not.toMatch(/clerkId/);
    }
  });

  it("the prepaid paths check the payment belongs to the caller", () => {
    // Authentication alone would still let a signed-in customer finalise
    // against somebody else's payment reference.
    const occurrences =
      finalization.split("payment.user_id !== caller._id").length - 1;
    expect(occurrences).toBe(2);
  });
});

describe("orders.ts write surface", () => {
  const mutations = publicMutations(orders);

  it("has public mutations to check", () => {
    expect(mutations.length).toBeGreaterThan(3);
  });

  it("the unused order creators are internal, not public", () => {
    // Zero callers anywhere. Making a public function internal is a breaking
    // change that is safe today and never safe again.
    for (const name of ["generateDeliveryCode", "checkDeliveryCode"]) {
      expect(
        mutations.some((m) => m.name === name),
        `${name} should not be a public mutation`,
      ).toBe(false);
    }
  });

  it("no public mutation is handed an actor id it treats as the caller", () => {
    // `riderId`/`user_id`/`clerkId` in an args block is the shape of every IDOR
    // fixed in this codebase so far. Admin mutations legitimately take a
    // SUBJECT id (assignRider takes the rider being assigned), so this checks
    // only the ones that authenticate as the actor.
    const actorClaiming = mutations
      .filter((m) => /getAuthUser\(ctx\)/.test(m.body))
      .filter((m) => /\b(clerkId|riderId)\b/.test(argsOf(m.body)))
      .map((m) => m.name);
    expect(actorClaiming).toEqual([]);
  });
});
