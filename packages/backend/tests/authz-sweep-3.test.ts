import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Third and final slice of the wider authorization audit — the picker and
 * rider operational modules.
 *
 * ── The pattern here is different from sweeps 1 and 2 ────────────────────
 *
 * Every function in scope took `pickerId`/`riderId`/`userId`/`user_id` as a
 * plain client argument and verified it only by loading THAT record and
 * checking its role or vendor — never against the caller's own identity via
 * `ctx.auth.getUserIdentity()`. So a signed-in rider or picker could pass
 * ANOTHER rider or picker's id and view their orders, mark their items
 * picked, toggle their status, or read their earnings.
 *
 * `assertSelfOrPermission(ctx, args.pickerId, "resource:ACTION")` closes it:
 * the caller must either BE that id, or hold staff override. Applied
 * alongside — not instead of — the existing `hasRoleName`/
 * `assertPickerOwnsOrder` checks, which answer a different question (does
 * this picker own this specific order) than who may act as the picker at
 * all.
 *
 * `shift_utils.ts` and most of `rider_analytics.ts`/`picker_assignment.ts`
 * have zero callers in any app and become internal instead — there was no
 * "self" to check against a caller that does not exist.
 *
 * `incentives.ts` is split deliberately: its ten `roleName !== "Admin"` gates
 * are already broken (no production role is named "Admin") but that denies
 * everyone rather than granting access, and `auth.helpers.ts`'s own comment
 * says fixing it needs product sign-off — untouched here. Only the seven
 * functions with NO gate of any kind are in scope.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fnBody(source: string, name: string): string {
  const pattern = new RegExp(
    `export const ${name} = (?:mutation|query|action|internalMutation|internalQuery|internalAction)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

const shiftUtils = stripComments(read("data", "shift_utils.ts"));
const riderAnalytics = stripComments(read("data", "rider_analytics.ts"));
const schedules = stripComments(read("data", "schedules.ts"));
const pickerOrders = stripComments(read("data", "picker_orders.ts"));
const pickerAssignment = stripComments(read("data", "picker_assignment.ts"));
const incentives = stripComments(read("data", "incentives.ts"));
const paymentFinalization = stripComments(
  read("data", "payment_finalization.ts"),
);
const prescriptions = stripComments(read("data", "prescriptions.ts"));

describe("shift_utils.ts — all four internal, zero live callers", () => {
  for (const [name, kind] of [
    ["getUserShiftStatus", "internalQuery"],
    ["autoUpdateStatusByShift", "internalMutation"],
    ["enableOvertimeMode", "internalMutation"],
    ["disableOvertimeMode", "internalMutation"],
  ] as const) {
    it(`${name} is ${kind}`, () => {
      expect(shiftUtils, name).toMatch(
        new RegExp(`export const ${name} = ${kind}\\(`),
      );
    });
  }
});

describe("rider_analytics.ts", () => {
  it("the two live-called functions require the caller to be that rider", () => {
    expect(fnBody(riderAnalytics, "updateRiderOnlineStatus")).toMatch(
      /assertSelfOrPermission\(ctx, args\.riderId, "riders:UPDATE"\)/,
    );
    expect(fnBody(riderAnalytics, "getRiderDashboard")).toMatch(
      /assertSelfOrPermission\(ctx, args\.riderId, "riders:READ"\)/,
    );
  });

  it("the guard runs before any data is read", () => {
    for (const name of ["updateRiderOnlineStatus", "getRiderDashboard"]) {
      const body = fnBody(riderAnalytics, name);
      expect(body.indexOf("assertSelfOrPermission")).toBeLessThan(
        body.indexOf("ctx.db"),
      );
    }
  });

  it("the six with no caller are internal", () => {
    for (const name of [
      "getRiderDailyStats",
      "getRiderPerformanceStats",
      "getRiderWeeklyStats",
      "getRiderRecentActivity",
      "getDeliveryTimeStats",
      "getActiveHoursBreakdown",
    ]) {
      expect(riderAnalytics, name).toMatch(
        new RegExp(`export const ${name} = internalQuery\\(`),
      );
    }
  });
});

describe("schedules.ts", () => {
  it("a rider reading or setting their OWN schedule is allowed; another rider's is not", () => {
    expect(fnBody(schedules, "getUserSchedule")).toMatch(
      /assertSelfOrPermission\(ctx, args\.userId, "schedules:READ"\)/,
    );
    expect(fnBody(schedules, "createOrUpdateSchedule")).toMatch(
      /assertSelfOrPermission\(ctx, args\.userId, "schedules:UPDATE"\)/,
    );
  });

  it("admin-only surfaces require the permission outright", () => {
    expect(fnBody(schedules, "getAllSchedules")).toMatch(
      /assertPermission\(ctx, "schedules:READ"\)/,
    );
    expect(fnBody(schedules, "createBulkSchedules")).toMatch(
      /assertPermission\(ctx, "schedules:UPDATE"\)/,
    );
    expect(fnBody(schedules, "deleteSchedule")).toMatch(
      /assertPermission\(ctx, "schedules:DELETE"\)/,
    );
    expect(fnBody(schedules, "getVendorStaffWithSchedules")).toMatch(
      /assertPermission\(ctx, "schedules:READ"\)/,
    );
  });

  it("the two with no caller are internal", () => {
    expect(schedules).toMatch(
      /export const getVendorSchedules = internalQuery\(/,
    );
    expect(schedules).toMatch(
      /export const updateSchedule = internalMutation\(/,
    );
  });
});

describe("picker_orders.ts", () => {
  const selfGated: [string, string][] = [
    ["getPickerOrders", "READ"],
    ["getPickerOrderDetails", "READ"],
    ["startPicking", "UPDATE"],
    ["markReadyForPickup", "UPDATE"],
    ["markItemPicked", "UPDATE"],
    ["scanItem", "UPDATE"],
    ["recordItemPick", "UPDATE"],
  ];

  for (const [name, action] of selfGated) {
    it(`${name} requires the caller to be that picker`, () => {
      expect(fnBody(pickerOrders, name)).toMatch(
        new RegExp(`assertSelfOrPermission\\(ctx, args\\.pickerId, "pickers:${action}"\\)`),
      );
    });
  }

  it("the guard runs before the existing order-ownership check, not after", () => {
    // A guard that runs second still leaked whatever the first check touched.
    for (const name of ["scanItem", "recordItemPick"]) {
      const body = fnBody(pickerOrders, name);
      expect(body.indexOf("assertSelfOrPermission")).toBeLessThan(
        body.indexOf("assertPickerOwnsOrder"),
      );
    }
  });

  it("the four with no caller are internal", () => {
    for (const [name, kind] of [
      ["updatePickerOrderStatus", "internalMutation"],
      ["handOverToRider", "internalMutation"],
      ["getPickerCompletedOrders", "internalQuery"],
      ["getAvailableRiders", "internalQuery"],
    ] as const) {
      expect(pickerOrders, name).toMatch(
        new RegExp(`export const ${name} = ${kind}\\(`),
      );
    }
  });

  it("getAvailableRiders returned every active rider's phone with no scoping — the reason it closed", () => {
    const body = fnBody(pickerOrders, "getAvailableRiders");
    expect(body).toMatch(/phone: rider\.phone/);
  });
});

describe("picker_assignment.ts is internal end to end", () => {
  it("every export is internal", () => {
    for (const [name, kind] of [
      ["getNextPickerForVendor", "internalQuery"],
      ["assignOrderToPicker", "internalMutation"],
      ["assignPrescriptionToPicker", "internalMutation"],
      ["getPickerAssignedOrders", "internalQuery"],
      ["getPickerAssignedPrescriptions", "internalQuery"],
      ["getVendorAssignmentStats", "internalQuery"],
    ] as const) {
      expect(pickerAssignment, name).toMatch(
        new RegExp(`export const ${name} = ${kind}\\(`),
      );
      expect(pickerAssignment, name).not.toMatch(
        new RegExp(`export const ${name} = (?:mutation|query)\\(`),
      );
    }
  });

  it("nextPickerForVendor is still a plain function, called directly", () => {
    // From the prescription-routing fix: referencing `api` from inside the
    // module that defines these functions makes their types circular.
    expect(pickerAssignment).toMatch(/async function nextPickerForVendor\(/);
    expect(pickerAssignment).toMatch(
      /nextPickerForVendor\(ctx, args\.vendorId\)/,
    );
  });

  it("both cross-module callers reach it through internal, never api", () => {
    expect(paymentFinalization).not.toMatch(
      /api\.data\.picker_assignment\./,
    );
    expect(paymentFinalization).toMatch(
      /internal\.data\.picker_assignment\.assignOrderToPicker/,
    );
    expect(prescriptions).not.toMatch(/api\.data\.picker_assignment\./);
    expect(prescriptions).toMatch(
      /internal\.data\.picker_assignment\.assignPrescriptionToPicker/,
    );
  });
});

describe("incentives.ts — only the fully unauthed subset was touched", () => {
  it("the broken-but-safe Admin gate is untouched, as documented", () => {
    // Fixing this widens access and needs product sign-off — not this pass.
    const occurrences = (incentives.match(/roleName !== "Admin"/g) || [])
      .length;
    expect(occurrences).toBeGreaterThan(0);
  });

  it("setUserTargets and getIncentiveDashboard require the caller to be that user", () => {
    expect(fnBody(incentives, "setUserTargets")).toMatch(
      /assertSelfOrPermission\(ctx, args\.user_id, "payroll:UPDATE"\)/,
    );
    expect(fnBody(incentives, "getIncentiveDashboard")).toMatch(
      /assertSelfOrPermission\(ctx, args\.user_id, "payroll:READ"\)/,
    );
  });

  it("getPickerItemStats requires the caller to be that picker", () => {
    expect(fnBody(incentives, "getPickerItemStats")).toMatch(
      /assertSelfOrPermission\(ctx, args\.pickerId, "payroll:READ"\)/,
    );
  });

  it("the three with no caller are internal", () => {
    expect(incentives).toMatch(
      /export const getIncentiveConfig = internalQuery\(/,
    );
    expect(incentives).toMatch(
      /export const setIncentiveConfig = internalMutation\(/,
    );
    expect(incentives).toMatch(
      /export const getUserTargets = internalQuery\(/,
    );
  });

  it("logPickerActivity is internal, reached only from picker_orders.ts", () => {
    expect(incentives).toMatch(
      /export const logPickerActivity = internalMutation\(/,
    );
    expect(pickerOrders).not.toMatch(/api\.data\.incentives\./);
    expect(pickerOrders).toMatch(
      /internal\.data\.incentives\.logPickerActivity/,
    );
  });
});
