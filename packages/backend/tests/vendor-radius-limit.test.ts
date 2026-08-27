import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The vendor service-radius limit: enforcement and the auth it depends on.
 *
 * Source-scan style, matching `role-mutation-guards.test.ts` — these mutations
 * cannot be exercised without a running Convex deployment, but a regression
 * where the gate or the enforcement is silently dropped from one of these
 * functions is exactly the kind of change that compiles, type-checks, and
 * looks correct in review.
 */

const VENDORS_PATH = join(
  __dirname,
  "..",
  "convex",
  "data",
  "vendors.ts",
);
const SETTINGS_PATH = join(
  __dirname,
  "..",
  "convex",
  "data",
  "platform_settings.ts",
);

const vendorsSource = readFileSync(VENDORS_PATH, "utf8");
const settingsSource = readFileSync(SETTINGS_PATH, "utf8");

function body(source: string, exportName: string): string {
  const match = source.match(
    new RegExp(
      `export const ${exportName} = (?:internalMutation|mutation|query)\\(\\{[\\s\\S]*?\\n\\}\\);`,
    ),
  );
  if (!match) throw new Error(`could not find export "${exportName}"`);
  return match[0];
}

describe("vendors.ts: write mutations are gated", () => {
  for (const name of ["addVendor", "updateVendor", "updateVendorStatus"]) {
    it(`${name} calls assertPermission`, () => {
      expect(body(vendorsSource, name)).toMatch(/assertPermission\(/);
    });
  }
});

describe("vendors.ts: the radius limit is enforced on write", () => {
  it("addVendor reads and checks the limit before inserting", () => {
    const fn = body(vendorsSource, "addVendor");
    expect(fn).toContain("readVendorServiceRadiusLimit");
    expect(fn).toContain("args.service_radius > radiusLimit");
    // Enforced before the insert, not after — a check that runs after
    // ctx.db.insert would still write the offending row.
    expect(fn.indexOf("radiusLimit")).toBeLessThan(fn.indexOf("ctx.db.insert"));
  });

  it("updateVendor checks the limit only when service_radius is part of the edit", () => {
    const fn = body(vendorsSource, "updateVendor");
    expect(fn).toContain("readVendorServiceRadiusLimit");
    // Guarded by an `updates.service_radius !== undefined` check — an
    // unconditional re-check here would un-grandfather every existing vendor
    // whose radius already exceeds a since-lowered limit on their NEXT
    // unrelated edit (e.g. changing their phone number).
    expect(fn).toContain("updates.service_radius !== undefined");
    expect(fn.indexOf("radiusLimit")).toBeLessThan(fn.indexOf("ctx.db.patch"));
  });
});

describe("platform_settings.ts: settings writes and the radius-warning query are gated", () => {
  it("upsert requires super admin", () => {
    expect(body(settingsSource, "upsert")).toMatch(/assertSuperAdmin\(/);
  });

  it("getVendorsExceedingRadius requires super admin", () => {
    expect(body(settingsSource, "getVendorsExceedingRadius")).toMatch(
      /assertSuperAdmin\(/,
    );
  });

  it("getVendorServiceRadiusLimit stays unguarded (informational, needed by the vendor form)", () => {
    // Deliberately the OPPOSITE assertion from the two above: this one must
    // NOT require super admin, or a hub manager editing their own vendor could
    // not see the ceiling their input is validated against. Asserting the
    // absence catches someone "fixing" this by gating it for consistency with
    // its neighbours.
    const fn = body(settingsSource, "getVendorServiceRadiusLimit");
    expect(fn).not.toMatch(/assertSuperAdmin\(|assertPermission\(/);
  });

  it("both vendors.ts and platform_settings.ts key off the same exported constant", () => {
    // The whole scheme — enforcement in vendors.ts, the confirmation dialog in
    // the settings UI, the seeded default — depends on all three reading and
    // writing the identical setting key. A hardcoded second copy of the string
    // in vendors.ts could drift from this one with no error anywhere.
    expect(vendorsSource).not.toMatch(/["']vendor_service_radius_limit_m["']/);
    expect(settingsSource).toContain(
      'export const VENDOR_SERVICE_RADIUS_LIMIT_KEY = "vendor_service_radius_limit_m"',
    );
  });

  it("seeds a default for the limit", () => {
    const seedFn = body(settingsSource, "seed");
    expect(seedFn).toContain("VENDOR_SERVICE_RADIUS_LIMIT_KEY");
  });
});
