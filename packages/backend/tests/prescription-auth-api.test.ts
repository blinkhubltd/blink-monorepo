import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The prescription path did not work at all.
 *
 * Seven cross-module calls in `prescriptions.ts` and `picker_assignment.ts` were
 * STRINGS cast through `as any`:
 *
 *   ctx.runQuery("pickerAssignment:getNextPickerForVendor" as any, …)
 *   ctx.scheduler.runAfter(0, "notifications:notifyUser" as any, …)
 *
 * Both module names were wrong — these live at `data/picker_assignment` and
 * `data/notifications` — so every call threw at runtime, and the `as any` meant
 * the type checker could not say so. `uploadPrescriptionForVerification` wrapped
 * its assignment in a catch that still returned `success: true`, so an upload
 * that reached nobody was indistinguishable from one that worked. Which was all
 * of them: no prescription has ever been routed to a picker.
 *
 * The same wrong reference sat in `assignOrderToPicker`, so ORDER routing was
 * broken too.
 *
 * Fixing the references made the type checker visible again, and it immediately
 * found two more: two `notifyUser` calls passed `type: "prescription_update"`,
 * which is not in `notificationTypes` and would have failed validation even with
 * a correct reference.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const prescriptions = read("data", "prescriptions.ts");
const pickers = read("data", "picker_assignment.ts");
const validators = read("validators.ts");

/**
 * Comments stripped.
 *
 * Both modules now carry a note QUOTING the broken string references they used
 * to contain, so a scan for those patterns matches the explanation of the fix.
 * Same trap the delivery-fee wiring test hit: an assertion that matches its own
 * documentation passes for the wrong reason, or fails for one.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const prescriptionsCode = stripComments(prescriptions);
const pickersCode = stripComments(pickers);

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

function fnBody(source: string, name: string): string {
  const pattern = new RegExp(
    `export const ${name} = (?:mutation|query|internalMutation|internalQuery)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

describe("no function is reached by string any more", () => {
  it("neither module contains a stringly function reference", () => {
    for (const [name, source] of [
      ["prescriptions", prescriptionsCode],
      ["picker_assignment", pickersCode],
    ] as const) {
      expect(source, name).not.toMatch(/runQuery\(\s*"/);
      expect(source, name).not.toMatch(/runMutation\(\s*"/);
      expect(source, name).not.toMatch(/runAfter\(\s*0,\s*"/);
      // The cast that hid it.
      expect(source, name).not.toMatch(/" as any/);
    }
  });

  it("picker selection is a direct call, not a query into its own module", () => {
    // Referencing `api` from inside the module that defines these functions
    // makes their types circular, which is what the `as any` was papering over.
    expect(pickers).toMatch(/async function nextPickerForVendor\(/);
    expect(pickers).toMatch(/nextPickerForVendor\(ctx, args\.vendorId\)/);
  });

  it("no notification uses a type the union does not contain", () => {
    const union = /export const notificationTypes = \[([\s\S]*?)\] as const;/.exec(
      validators,
    );
    expect(union, "notificationTypes not found").not.toBeNull();
    const allowed = [...union![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

    for (const used of [...prescriptions.matchAll(/type: "([a-z_]+)" as const/g)]) {
      expect(allowed, `unknown notification type ${used[1]}`).toContain(used[1]);
    }
  });
});

describe("uploading a prescription", () => {
  it("is auth-derived and takes no identity", () => {
    const body = fnBody(prescriptions, "uploadMyPrescription");
    expect(body).toMatch(/getAuthUser\(ctx\)/);
    expect(argsOf(body)).not.toMatch(/clerkId|user_id|userId/);
  });

  it("reports whether a picker was actually assigned", () => {
    // `assigned: false` means stored but unreviewed. The old version returned
    // `success: true` in that case, so the customer waited for a review nobody
    // had been asked for.
    const body = fnBody(prescriptions, "uploadMyPrescription");
    expect(body).toMatch(/routePrescription\(/);
    expect(prescriptions).toMatch(/assigned: false, assignedPickerId: null/);
  });

  it("checks the vendor exists", () => {
    // A prescription filed against a stray id is invisible to every queue.
    expect(fnBody(prescriptions, "uploadMyPrescription")).toMatch(
      /if \(!vendor\) throw new ConvexError/,
    );
  });

  it("leaves the clerkId version tagged", () => {
    const declaration = prescriptions.indexOf(
      "export const uploadPrescriptionForVerification = mutation({",
    );
    const preamble = prescriptions.slice(
      Math.max(0, declaration - 600),
      declaration,
    );
    expect(preamble.slice(preamble.lastIndexOf("});"))).toMatch(/@deprecated/);
  });
});

describe("reading a prescription", () => {
  it("getMyPrescription is keyed on the prescription, not the vendor", () => {
    // `getPrescriptionStatus` returns the most recent for a {clerkId, vendorId}
    // pair, so a previously approved document made a brand-new upload report
    // itself approved the instant it was made.
    const body = fnBody(prescriptions, "getMyPrescription");
    expect(argsOf(body)).toMatch(/prescriptionId: v\.id\("prescriptions"\)/);
    expect(argsOf(body)).not.toMatch(/vendorId/);
  });

  it("both readers are owner-scoped", () => {
    for (const name of ["getMyPrescription", "getMyPrescriptionsByVendor"]) {
      expect(fnBody(prescriptions, name), name).toMatch(
        /getAuthUserOrNull\(ctx\)/,
      );
    }
    expect(fnBody(prescriptions, "getMyPrescription")).toMatch(
      /prescription\.user_id !== caller\.user\._id/,
    );
  });

  it("the per-vendor reader is bounded and capped", () => {
    const body = fnBody(prescriptions, "getMyPrescriptionsByVendor");
    expect(body).not.toMatch(/\.collect\(\)/);
    expect(body).toMatch(/vendorIds\.slice\(0, 25\)/);
  });

  it("returns uploadedAt, so a stale approval is distinguishable", () => {
    expect(fnBody(prescriptions, "getMyPrescriptionsByVendor")).toMatch(
      /uploadedAt/,
    );
  });
});
