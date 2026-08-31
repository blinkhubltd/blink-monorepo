import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A rider or picker must never see their hub's commercial terms.
 *
 * The `vendors` table carries `commission`, `commission_type`, `service_radius`
 * and `business_details` — bank code, account number, KRA PIN. Several backend
 * queries written for the admin dashboard return the whole document, and calling
 * one of those from the crew app puts a hub's bank details on a delivery rider's
 * phone, where anyone holding the phone can read them.
 *
 * This is easy to reintroduce: `getVendorById` and `getShipmentDetails` both
 * exist, both look like the obvious thing to call, and neither fails or warns.
 * So rather than trusting review, this asserts it — over the real source of both
 * the app and the backend, on every run.
 */

const APP = join(__dirname, "..");
const CONVEX = join(APP, "..", "..", "packages", "backend", "convex");

/** Fields that must not reach the crew app under any name. */
const FORBIDDEN = [
  "commission",
  "commission_type",
  "service_radius",
  "business_details",
  "bank_code",
  "account_number",
  "kra_pin",
  "paystack_subaccount_code",
  "paystack_split_breakdown",
  "paystack_split_code",
];

/**
 * Backend functions the crew app is allowed to call.
 *
 * An allowlist rather than a scan, because the point is to make adding one a
 * deliberate act. If this test fails because you wired up something new, check
 * what that function returns before adding it here.
 */
const ALLOWED = new Set<string>([
  "data.incentives.getIncentiveDashboard",
  "data.incentives.getPickerItemStats",
  "data.incentives.setUserTargets",
  "data.orders.verifyDeliveryCode",
  "data.picker_orders.getPickerOrderDetails",
  "data.picker_orders.getPickerOrders",
  "data.picker_orders.markItemPicked",
  "data.picker_orders.markReadyForPickup",
  "data.picker_orders.recordItemPick",
  "data.picker_orders.scanItem",
  "data.picker_orders.startPicking",
  "data.prescription_rejection_reasons.getActiveRejectionReasons",
  "data.prescriptions.getOrderItemsForPrescription",
  "data.prescriptions.getOrdersAwaitingPrescription",
  "data.prescriptions.getPrescriptionDocumentUrl",
  "data.prescriptions.getPrescriptionForOrderItem",
  "data.prescriptions.updatePrescriptionStatusWithReason",
  "data.push_tokens.deregisterMyDevice",
  "data.push_tokens.registerMyPushToken",
  "data.rider_analytics.getRiderDashboard",
  "data.rider_analytics.updateRiderOnlineStatus",
  "data.riders.reportMyLocation",
  "data.schedules.createOrUpdateSchedule",
  "data.schedules.getUserSchedule",
  "data.shipments.getCrewDeliveryDetail",
  "data.shipments.listRiderDeliveries",
  "data.tracking.confirmDelivery",
  "data.user_notifications.getMyNotifications",
  "data.user_notifications.getMyUnreadCount",
  "data.user_notifications.markAllMyNotificationsRead",
  "data.vendors.getHubForCrew",
  "user.users.getCurrentUser",
]);

/** Queries that exist and return too much — named so the failure is obvious. */
const BANNED = new Map<string, string>([
  [
    "data.vendors.getVendorById",
    "returns the whole vendor document, including commission and bank details — use getHubForCrew",
  ],
  [
    "data.shipments.getShipmentDetails",
    "returns four whole documents with no auth check — use getCrewDeliveryDetail",
  ],
  [
    "data.vendors.getAllVendors",
    "returns every vendor in full; nothing in a crew app needs it",
  ],
  [
    "data.vendors.getVendors",
    "returns vendor documents in full; nothing in a crew app needs it",
  ],
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".expo" || entry === "_generated") {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const CALL = /api\.([a-z_]+)\.([a-z_]+)\.([A-Za-z_]+)/g;

function calledFunctions(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(APP)) {
    // Skip this test's own allowlist.
    if (file.endsWith("no-vendor-leak.test.ts")) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(CALL)) {
      const name = `${m[1]}.${m[2]}.${m[3]}`;
      const where = found.get(name) ?? [];
      where.push(file.slice(APP.length + 1));
      found.set(name, where);
    }
  }
  return found;
}

function handlerSource(name: string): string | null {
  const parts = name.split(".");
  const fn = parts.pop()!;
  const path = join(CONVEX, ...parts) + ".ts";
  let src: string;
  try {
    src = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const decl = new RegExp(`export\\s+const\\s+${fn}\\s*=\\s*\\w+\\(\\{`);
  const at = src.search(decl);
  if (at === -1) return null;
  const rest = src.slice(at);
  const end = rest.indexOf("\n});");
  return end === -1 ? rest : rest.slice(0, end + 4);
}

describe("the crew app cannot read vendor-confidential data", () => {
  const called = calledFunctions();

  it("calls at least the functions we know about", () => {
    // Guards against the scan silently matching nothing and passing vacuously.
    expect(called.size).toBeGreaterThan(25);
  });

  it("calls nothing outside the allowlist", () => {
    const unexpected = [...called.keys()].filter((n) => !ALLOWED.has(n));
    expect(unexpected, "new backend calls — check what they return first").toEqual(
      [],
    );
  });

  it("calls none of the over-returning admin queries", () => {
    for (const [name, why] of BANNED) {
      const sites = called.get(name);
      expect(sites, `${name} is called from ${sites?.join(", ")} — ${why}`).toBe(
        undefined,
      );
    }
  });

  it("no called handler mentions a forbidden field", () => {
    const offenders: string[] = [];
    for (const name of called.keys()) {
      const body = handlerSource(name);
      if (body === null) continue;
      const hits = FORBIDDEN.filter((f) => body.includes(f));
      if (hits.length > 0) offenders.push(`${name}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no called handler returns a whole vendor document", () => {
    // The usual way this leaks is a spread, which names no field at all.
    const offenders: string[] = [];
    for (const name of called.keys()) {
      const body = handlerSource(name);
      if (body === null) continue;
      if (/\.\.\.vendor\b/.test(body) || /^\s*vendor,\s*$/m.test(body)) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only lib/data and the providers import the api at all", () => {
    // Keeps the surface auditable: if any screen could call the backend
    // directly, the allowlist above stops being the whole story.
    const importers = sourceFiles(APP)
      .filter((f) => readFileSync(f, "utf8").includes('from "@repo/backend"'))
      .map((f) => f.slice(APP.length + 1).replace(/\\/g, "/"))
      .filter((f) => !f.startsWith("tests/"));

    for (const file of importers) {
      expect(
        file.startsWith("lib/") || file.startsWith("providers/"),
        `${file} imports the api directly`,
      ).toBe(true);
    }
  });
});
