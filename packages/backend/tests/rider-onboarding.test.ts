import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { missingRiderDocuments } from "../convex/user/rider_onboarding";

/**
 * Rider onboarding (`user/rider_onboarding.ts`): the rider submits documents,
 * an admin approves. The guard properties are checked from source, like this
 * directory's other guard tests; the document rule is a pure function.
 */

const source = readFileSync(
  join(__dirname, "..", "convex", "user", "rider_onboarding.ts"),
  "utf8",
);

function body(name: string): string {
  const match = source.match(
    new RegExp(`export const ${name} = (?:query|mutation)\\(\\{[\\s\\S]*?\\n\\}\\);`),
  );
  expect(match, `${name} should exist`).not.toBeNull();
  return match![0];
}

describe("missingRiderDocuments", () => {
  it("names everything missing on an empty profile", () => {
    expect(missingRiderDocuments({})).toEqual([
      "Phone number",
      "ID photo",
      "Licence photo",
    ]);
  });

  it("is empty once phone and both photos are in", () => {
    expect(
      missingRiderDocuments({
        phone: "+254712345678",
        rider_details: { id_image: "a", license_image: "b" },
      }),
    ).toEqual([]);
  });
});

describe("the rider's own functions", () => {
  it("derive the rider from the session and take no user id", () => {
    for (const name of ["getMyRiderOnboarding", "submitMyRiderDocuments"]) {
      const b = body(name);
      expect(b, `${name} must resolve the caller`).toMatch(/getAuthUser\(ctx\)/);
      expect(b, `${name} must not accept a user id`).not.toMatch(/userId: v\.id/);
    }
  });

  it("refuses to change documents after approval", () => {
    expect(body("submitMyRiderDocuments")).toMatch(/approved_at\)\s*\{\s*throw/);
  });
});

describe("the admin's functions", () => {
  // With the system-role bypass in `assertPermission`, a rider would pass it
  // and could approve themselves. These must be staff-only.
  it("are staff-only, never plain assertPermission", () => {
    for (const name of ["getRiderDocuments", "approveRider", "revokeRiderApproval"]) {
      const b = body(name);
      expect(b, `${name} must be staff-only`).toMatch(/assertStaffPermission\(/);
      expect(b).not.toMatch(/\bassertPermission\(/);
    }
  });

  it("approveRider refuses a rider with documents missing", () => {
    const b = body("approveRider");
    expect(b).toMatch(/missingRiderDocuments\(user\)/);
    expect(b).toMatch(/throw new ConvexError/);
  });
});
