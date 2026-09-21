import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The admin order surface: gated on a permission, and scoped to a hub
 * manager's vendors on the server.
 *
 * ── What this was written for ────────────────────────────────────────────
 *
 * `updateOrderStatus`, `updatePaymentStatus`, `bulkUpdateOrderStatus`,
 * `deleteOrder` and `assignRider` were public mutations with no auth at all,
 * and `paginateOrders` returned customer names, emails and phones to anyone.
 * A hub manager's vendor scope existed only as a `vendor_ids` filter the admin
 * page sent, so a manager who edited the request saw every vendor's orders.
 *
 * Two legitimate callers hold no admin permission, and gating
 * `updateOrderStatus` naively would have broken both:
 *
 *   - the rider, via `verifyDeliveryCode`, which moved the order to Delivered
 *     through `runMutation(api...updateOrderStatus)`;
 *   - the scheduled payment confirmation, via
 *     `notifications.updateOrderStatusWithNotifications`, which runs with no
 *     identity at all.
 *
 * Both now share `applyOrderStatus` with the admin mutation instead of calling
 * it. The tests below pin that shape, because the naive version compiles and
 * passes review and only fails at a customer's door.
 *
 * Source-scanning, like `order-mutation-guards.test.ts`.
 */

// Normalised: the sources are CRLF on some checkouts, and the body regexes
// anchor on a bare newline before the closing `});`.
function source(...path: string[]): string {
  return readFileSync(join(__dirname, "..", "convex", ...path), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

/** Every hand-written module under convex/, as [relative path, source]. */
function convexModules(): [string, string][] {
  const root = join(__dirname, "..", "convex");
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".ts") && !f.includes("_generated"))
    .map((f) => [
      relative(root, join(root, f)),
      readFileSync(join(root, f), "utf8"),
    ]);
}

const orders = source("data", "orders.ts");
const notifications = source("data", "notifications.ts");
const payments = source("data", "payments.ts");
const finalization = source("data", "payment_finalization.ts");

function body(src: string, name: string): string {
  const match = src.match(
    new RegExp(
      `export const ${name} = (?:query|mutation|internalMutation|internalAction|action)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
    ),
  );
  return match?.[1] ?? "";
}

const GATED: [name: string, permission: string][] = [
  ["updateOrderStatus", "orders:UPDATE"],
  ["updatePaymentStatus", "orders:UPDATE"],
  ["bulkUpdateOrderStatus", "orders:UPDATE"],
  ["assignRider", "orders:UPDATE"],
  ["deleteOrder", "orders:DELETE"],
];

describe("admin order functions are permission-gated", () => {
  it.each(GATED)("%s asserts %s before touching data", (name, permission) => {
    const b = body(orders, name);
    expect(b, `${name} not found`).not.toBe("");
    const gate = b.indexOf(`assertPermission(ctx, "${permission}")`);
    expect(gate, `${name} is missing its gate`).toBeGreaterThan(-1);
    // The gate precedes every read and write, not merely appears somewhere.
    for (const op of ["ctx.db.get(", "ctx.db.patch(", "ctx.db.delete(", "ctx.db.query("]) {
      const at = b.indexOf(op);
      if (at !== -1) expect(gate, `${name}: ${op} before the gate`).toBeLessThan(at);
    }
  });

  it("they are still public — the admin app calls them directly", () => {
    for (const [name] of GATED) {
      expect(orders).toMatch(
        new RegExp(`export const ${name} = (query|mutation)\\(`),
      );
    }
  });
});

describe("hub-manager vendor scope is enforced on the server", () => {
  it("the scope comes from the caller's user doc, and super admins bypass it", () => {
    const helper = orders.match(
      /async function orderVendorScope\([\s\S]*?\n\}/,
    )?.[0];
    expect(helper).toBeDefined();
    expect(helper!).toMatch(/isSuperAdminPermissions\(authed\.permissions\)/);
    expect(helper!).toMatch(/ctx\.db\.get\(authed\.user\._id\)/);
    expect(helper!).toMatch(/manager_details\?\.vendor_id/);
  });

  it("every gated function resolves the caller's scope", () => {
    for (const [name] of GATED) {
      expect(body(orders, name), name).toMatch(
        /orderVendorScope\(ctx, authed\)/,
      );
    }
  });

  it("every mutation loads its order through the scope check", () => {
    for (const [name] of GATED) {
      expect(body(orders, name), name).toMatch(/getScopedOrder\(ctx, scope,/);
    }
  });

  it("out of scope looks exactly like a missing order", () => {
    const helper = orders.match(/async function getScopedOrder\([\s\S]*?\n\}/)?.[0];
    expect(helper).toBeDefined();
    expect(helper!).toMatch(
      /!order \|\| \(scope !== null && !scope\.includes\(order\.vendor_id\)\)/,
    );
    expect(helper!).toMatch(/throw new ConvexError\("Order not found"\)/);
  });

  it("paginateOrders is for staff with orders:READ, or a picker's own orders", () => {
    const b = body(orders, "paginateOrders");
    // Resolved before any read: the picker path only when the caller IS the
    // picker being filtered on; everyone else falls through to orders:READ.
    const gate = b.indexOf("orderReadAccess(ctx,");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(b.indexOf("ctx.db.query("));
    expect(b).toMatch(/me\._id === args\.assigned_picker_id\s*\?\s*"assignee"/);
    // The scope only ever comes from the staff branch.
    expect(b).toMatch(/const scope = access\.kind === "staff" \? access\.scope : null;/);
    // A picker is pinned to their own orders on every branch — the search
    // branch ignores the picker index — page and count alike.
    expect(b).toMatch(/ordersQuery = ordersQuery\.filter\(pickerFilter\)/);
    expect(b).toMatch(/countQuery = countQuery\.filter\(pickerFilter\)/);
  });

  it("paginateOrders intersects the requested vendors with the caller's own", () => {
    const b = body(orders, "paginateOrders");
    // The browser's `vendor_ids` can narrow the scope, never widen it.
    expect(b).toMatch(/\(requestedVendorIds \?\? scope\)\.filter\(\(id\) => scope\.includes\(id\)\)/);
    // And the restriction is applied whichever index branch was chosen — the
    // picker-index branches used to ignore the vendor entirely.
    expect(b).toMatch(/ordersQuery = ordersQuery\.filter\(scopeFilter\)/);
    expect(b).toMatch(/countQuery = countQuery\.filter\(scopeFilter\)/);
    // It no longer trusts the raw args after resolving the scope.
    expect(b).not.toMatch(/args\.vendor_ids\.map/);
  });
});

describe("paths that legitimately bypass the admin gate", () => {
  it("verifyDeliveryCode applies the status itself, behind its rider check", () => {
    const b = body(orders, "verifyDeliveryCode");
    expect(b).toMatch(/order\.rider_id !== user\._id/);
    expect(b).toMatch(/applyOrderStatus\(ctx, order, "Delivered"\)/);
    // Calling the gated mutation would reject the rider mid-handover.
    expect(b).not.toMatch(/api\.data\.orders\.updateOrderStatus/);
    expect(b.indexOf("order.rider_id !== user._id")).toBeLessThan(
      b.indexOf("applyOrderStatus("),
    );
  });

  it("setOrderStatus, for identity-less server callers, is internal", () => {
    expect(orders).toMatch(/export const setOrderStatus = internalMutation\(/);
    expect(orders).not.toMatch(/export const setOrderStatus = mutation\(/);
  });

  it("updateOrderStatusWithNotifications is internal and writes internally", () => {
    // It was a public, unauthenticated wrapper: gating updateOrderStatus
    // meant nothing while this let anyone set any order's status.
    expect(notifications).toMatch(
      /export const updateOrderStatusWithNotifications = internalAction\(/,
    );
    const b = body(notifications, "updateOrderStatusWithNotifications");
    expect(b).toMatch(/internal\.data\.orders\.setOrderStatus/);
    expect(b).not.toMatch(/api\.data\.orders\.updateOrderStatus/);
  });

  it("the payment paths schedule the internal reference", () => {
    for (const [file, src] of [
      ["payments.ts", payments],
      ["payment_finalization.ts", finalization],
    ] as const) {
      expect(src, file).not.toMatch(
        /api\.data\.notifications\.updateOrderStatusWithNotifications/,
      );
      expect(src, file).toMatch(
        /internal\.data\.notifications\.updateOrderStatusWithNotifications/,
      );
    }
  });

  it("no server code calls the gated admin mutations", () => {
    // A server-side caller would run with no identity (scheduled) or the wrong
    // one (a rider), and be refused. Scans every module, not a list.
    const offenders = convexModules()
      .filter(([, src]) =>
        /api\.data\.orders\.(updateOrderStatus|updatePaymentStatus|bulkUpdateOrderStatus|deleteOrder|assignRider|paginateOrders)\b/.test(
          src,
        ),
      )
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
