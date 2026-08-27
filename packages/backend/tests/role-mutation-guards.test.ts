import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every function that writes `role_id` must be either gated or unreachable.
 *
 * Found by sweeping for other `isStaff`-shaped auth gaps after fixing
 * `data/prescription_rejection_reasons.ts`: nine functions in `user/users.ts`
 * patched a user's `role_id` with NO authorization check at all — not even a
 * signed-in requirement. `bulkAssignRole` in particular meant an
 * unauthenticated caller who knew a user id and the Super Admin role id could
 * grant it to themselves.
 *
 * This is exactly the class of bug source-scanning tests exist to prevent: it
 * compiles, it type-checks, and nothing about calling it looks wrong. The fix
 * was a split — gate the three with a live caller, make the five with none
 * `internal` — and this test is what stops a tenth one from being added the
 * same way.
 */

const USERS_PATH = join(__dirname, "..", "convex", "user", "users.ts");
const source = readFileSync(USERS_PATH, "utf8");

/** Every exported mutation, public or internal, with its body. */
function extractMutations(text: string): { name: string; body: string }[] {
  const pattern =
    /export const (\w+) = (mutation|internalMutation)\(\{([\s\S]*?)\n\}\);/g;
  const out: { name: string; body: string }[] = [];
  for (const match of text.matchAll(pattern)) {
    out.push({ name: match[1]!, body: match[3]! });
  }
  return out;
}

const mutations = extractMutations(source);

describe("user/users.ts role-assigning mutations", () => {
  it("finds the mutations (the extractor itself is not silently broken)", () => {
    expect(mutations.length).toBeGreaterThan(15);
    expect(mutations.some((m) => m.name === "bulkAssignRole")).toBe(true);
  });

  const roleWriters = mutations.filter((m) => /role_id:/.test(m.body));

  it("has role-writing mutations to check", () => {
    expect(roleWriters.length).toBeGreaterThanOrEqual(9);
  });

  it("gates every PUBLIC role-writing mutation on a permission check", () => {
    const isPublic = (name: string) =>
      new RegExp(`export const ${name} = mutation\\(`).test(source);

    const unguarded = roleWriters
      .filter((m) => isPublic(m.name))
      .filter(
        (m) =>
          !/assertPermission|assertStaffOrPermission|getAuthUser/.test(
            m.body,
          ),
      )
      .map((m) => m.name);

    expect(unguarded).toEqual([]);
  });

  it("confirms the specific functions this bug was found in stay fixed", () => {
    // Named individually rather than only via the generic scan above, so a
    // future refactor that accidentally renames or restructures one of these
    // fails here with the function's name in the assertion, not just "some
    // unguarded mutation exists".
    const guarded = [
      "assignRoleToUser",
      "assignRiderWithDetails",
      "assignPickerWithDetails",
      "bulkAssignRole",
    ];
    for (const name of guarded) {
      const fn = mutations.find((m) => m.name === name);
      expect(fn, `${name} should still exist`).toBeDefined();
      expect(
        /assertPermission|assertStaffOrPermission/.test(fn!.body),
        `${name} lost its permission check`,
      ).toBe(true);
    }

    const internalized = [
      "updateUserRole",
      "assignGeneralManager",
      "removeManagerRole",
      "assignHubManagerWithVendor",
      "assignVendorContactWithVendor",
    ];
    for (const name of internalized) {
      expect(
        new RegExp(`export const ${name} = internalMutation\\(`).test(source),
        `${name} should be internalMutation, not a public mutation`,
      ).toBe(true);
    }
  });

  it("gates the staff-listing queries too", () => {
    const queryNames = ["getAllStaff", "getVendorStaff"];
    for (const name of queryNames) {
      const match = source.match(
        new RegExp(
          `export const ${name} = query\\(\\{[\\s\\S]*?\\n\\}\\);`,
        ),
      );
      expect(match, `${name} should exist`).not.toBeNull();
      expect(
        /assertPermission|assertStaffOrPermission|getAuthUser/.test(match![0]),
        `${name} has no auth check`,
      ).toBe(true);
    }
  });
});
