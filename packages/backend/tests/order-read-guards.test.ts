import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Who may read an order: the customer who placed it, the rider or picker
 * assigned to it, or staff holding `orders:READ` — within their vendor scope.
 * Nobody else. And only the customer ever sees the delivery code.
 *
 * ── What this was written for ────────────────────────────────────────────
 *
 * After the admin mutations were gated, the rest of `orders.ts` was still open:
 * `getOrderById`, `getOrders`, `listOrders*`,
 * `getOrderItems`, `validateOrderExists`, `getOrderStats` and
 * `getOrdersAwaitingVerification` answered anyone, several with customer
 * contact details and the delivery code. `getUserOrders*` trusted a `clerkId`
 * argument. `createOrder`, `updateOrder`, `finalizePicking`,
 * `resendDeliveryCode` and `backfillOrdersSearchText` wrote with no check.
 *
 * Riders and pickers hold no permissions, so they read an order only because
 * the order itself names them (`rider_id`, `assigned_picker_id`).
 *
 * Server code (notifications, payments) read orders through the public
 * queries. Scheduled actions carry no identity, so those callers now use
 * internal twins — pinned below, because the regression is silent until a
 * notification quietly stops sending.
 *
 * Source-scanning, like the other guard tests here.
 */

function source(...path: string[]): string {
  return readFileSync(join(__dirname, "..", "convex", ...path), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const orders = source("data", "orders.ts");

function exported(src: string, kinds: string) {
  const pattern = new RegExp(
    `export const (\\w+) = (${kinds})\\(\\{([\\s\\S]*?)\\n\\}\\);`,
    "g",
  );
  return [...src.matchAll(pattern)].map((m) => ({
    name: m[1]!,
    kind: m[2]!,
    body: m[3]!,
  }));
}

function body(name: string): string {
  return exported(orders, "\\w+").find((f) => f.name === name)?.body ?? "";
}

/** A top-level helper's source, from its signature to its closing brace. */
function helper(signature: string): string {
  const start = orders.indexOf(signature);
  if (start === -1) return "";
  return orders.slice(start, orders.indexOf("\n}\n", start) + 2);
}

/** A body that authenticates, directly or through one of the order helpers. */
const AUTHENTICATES =
  /assertPermission\(|getAuthUser\(ctx\)|ctx\.auth\.getUserIdentity\(\)|orderReadAccess\(|readableOrder\(|assertCanActOnOrder\(/;

describe("every public function in orders.ts authenticates", () => {
  const publicFns = exported(orders, "query|mutation");

  it("finds the public surface", () => {
    expect(publicFns.length).toBeGreaterThan(15);
  });

  it("has no unauthenticated public query or mutation", () => {
    const open = publicFns
      .filter((f) => !AUTHENTICATES.test(f.body))
      .map((f) => f.name);
    expect(open).toEqual([]);
  });
});

describe("the read rule: owner, assignee, or orders:READ within scope", () => {
  it("orderReadAccess lets owners and assignees through and gates everyone else", () => {
    const h = helper("async function orderReadAccess(");
    expect(h).not.toBe("");
    const related = h.indexOf("if (kind !== null) return { kind };");
    const gate = h.indexOf('assertPermission(ctx, "orders:READ")');
    expect(related).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(related);
    expect(h).toMatch(/orderVendorScope\(ctx, staff\)/);
  });

  it("relationTo reads ownership and assignment from the order itself", () => {
    const h = helper("function relationTo(");
    expect(h).not.toBe("");
    expect(h).toMatch(/order\.user_id === me\._id\) return "owner"/);
    // No role-name check: assignment on the order is what lets them read it.
    expect(h).toMatch(
      /order\.rider_id === me\._id \|\| order\.assigned_picker_id === me\._id/,
    );
    expect(h).toMatch(/return "assignee"/);
  });

  it("readableOrder uses relationTo, and hides out-of-scope orders from staff", () => {
    const h = helper("async function readableOrder(");
    expect(h).not.toBe("");
    expect(h).toMatch(/relationTo\(order, me\)/);
    expect(h).toMatch(/access\.kind === "staff" &&/);
    expect(h).toMatch(/!access\.scope\.includes\(order\.vendor_id\)/);
  });

  it.each([
    "getOrderById",
    "getOrderItems",
    "validateOrderExists",
  ])("%s reads through readableOrder", (name) => {
    expect(body(name)).toMatch(/readableOrder\(ctx, args\.orderId\)/);
  });

  it.each(["listOrders", "listOrdersFiltered", "listOrdersWithDetails"])(
    "%s treats userId as the owner only when it is the caller",
    (name) => {
      expect(body(name)).toMatch(
        /\(me\) => \(userId !== undefined && me\._id === userId \? "owner" : null\)/,
      );
    },
  );

  it.each(["getUserOrders", "getUserOrdersPaginated"])(
    "%s trusts the caller's identity, not the clerkId argument",
    (name) => {
      const b = body(name);
      expect(b).toMatch(/me\.clerkId === args\.clerkId \? "owner" : null/);
      // The access check runs before the lookup it would otherwise trust.
      expect(b.indexOf("orderReadAccess(")).toBeLessThan(
        b.indexOf("getUserByClerkId("),
      );
      expect(b).toMatch(/withinScope\(/);
    },
  );

  it("getOrdersAwaitingVerification is for the rider's own orders, or staff", () => {
    const b = body("getOrdersAwaitingVerification");
    expect(b).toMatch(/me\._id === args\.riderId \? "assignee" : null/);
    // The rider path still returns only that rider's orders.
    expect(b).toMatch(/order\.rider_id === args\.riderId/);
    expect(b).toMatch(/withinScope\(/);
  });

  it.each(["getOrders", "getOrderStats"])("%s is staff-only and scoped", (name) => {
    const b = body(name);
    expect(b).toMatch(/assertPermission\(ctx, "orders:READ"\)/);
    expect(b).toMatch(/orderVendorScope\(ctx, authed\)/);
  });

  it("only the owner ever receives the delivery code", () => {
    // Not the rider: the code proves the customer was there, and a rider who
    // could look it up would not need them to be. Not the picker, not staff.
    const h = helper("function viewFor<");
    expect(h).not.toBe("");
    expect(h).toMatch(/if \(access\.kind === "owner"\) return order;/);
    expect(h).toMatch(
      /const \{ delivery_code, idempotency_key, \.\.\.rest \} = order;/,
    );
    for (const name of [
      "getOrderById",
      "getOrders",
      "listOrders",
      "listOrdersFiltered",
      "listOrdersWithDetails",
      "getUserOrders",
      "getUserOrdersPaginated",
      "getOrdersAwaitingVerification",
      "paginateOrders",
    ]) {
      expect(body(name), name).toMatch(/viewFor\(/);
    }
  });

  it("getUserOrdersPaginated no longer returns the whole vendor document", () => {
    // `business_details` carries bank details and the Paystack subaccount.
    const b = body("getUserOrdersPaginated");
    expect(b).not.toMatch(/^\s+vendor,$/m);
    expect(b).toMatch(
      /\{ _id: vendor\._id, name: vendor\.name, contact: vendor\.contact \}/,
    );
  });
});

describe("the remaining writes", () => {
  it("createOrder is internal — it accepted user_id and prices from the client", () => {
    expect(orders).toMatch(/export const createOrder = internalMutation\(/);
    expect(orders).not.toMatch(/export const createOrder = mutation\(/);
  });

  it("updateOrder is staff-only, scoped, and cannot move an order out of scope", () => {
    const b = body("updateOrder");
    expect(b).toMatch(/assertPermission\(ctx, "orders:UPDATE"\)/);
    expect(b).toMatch(/getScopedOrder\(ctx, scope, args\.id\)/);
    expect(b).toMatch(/!scope\.includes\(newVendor\)/);
  });

  it("finalizePicking is for the assigned picker or staff", () => {
    const b = body("finalizePicking");
    expect(b).toMatch(/assertCanActOnOrder\(/);
    expect(b).toMatch(/o\.assigned_picker_id === me\._id/);
  });

  it("resendDeliveryCode is for the customer, the assigned rider, or staff", () => {
    const b = body("resendDeliveryCode");
    expect(b).toMatch(/assertCanActOnOrder\(/);
    expect(b).toMatch(/o\.user_id === me\._id \|\| o\.rider_id === me\._id/);
  });

  it("assertCanActOnOrder falls back to orders:UPDATE within scope", () => {
    const h = helper("async function assertCanActOnOrder(");
    expect(h).not.toBe("");
    expect(h).toMatch(/assertPermission\(ctx, "orders:UPDATE"\)/);
    expect(h).toMatch(/getScopedOrder\(ctx, scope, orderId\)/);
  });

  it("backfillOrdersSearchText rewrites only the caller's vendors", () => {
    const b = body("backfillOrdersSearchText");
    expect(b).toMatch(/assertPermission\(ctx, "orders:UPDATE"\)/);
    expect(b).toMatch(/ordersInScope\(ctx, scope\)/);
  });
});

describe("server-side readers use the internal twins", () => {
  it("the server-side readers are internal", () => {
    expect(orders).toMatch(/export const getOrderByIdInternal = internalQuery\(/);
    // getOrderWithItems is itself internal; the admin page reads the gated
    // getOrderDetails instead (see order-details-auth.test.ts).
    expect(orders).toMatch(/export const getOrderWithItems = internalQuery\(/);
  });

  it("no backend module reads an order through the gated public queries", () => {
    // A scheduled action has no identity, so the gated query would refuse it.
    const root = join(__dirname, "..", "convex");
    const offenders = (readdirSync(root, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".ts") && !f.includes("_generated"))
      .filter((f) =>
        /api\.data\.orders\.(getOrderById|getOrderWithItems|getOrderItems|getOrders|listOrders\w*|getOrderStats|validateOrderExists)\b/.test(
          readFileSync(join(root, f), "utf8"),
        ),
      )
      .map((f) => relative(root, join(root, f)));
    expect(offenders).toEqual([]);
  });
});
