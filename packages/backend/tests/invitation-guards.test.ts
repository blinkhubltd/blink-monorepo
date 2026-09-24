import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The invitation flow's two security properties, checked from source:
 *
 *  1. `inviteUser` (the public action) is gated by the SAME permission check
 *     that guards ordinary role assignment (`assertPermission` inside
 *     `validateInvite`, called via `ctx.runQuery` before Clerk is ever
 *     touched) — an action has no `ctx.db`, so there is no way to inline the
 *     check the way a mutation would; it is easy to forget the `runQuery`
 *     call entirely and ship an action anyone signed in can call.
 *
 *  2. `validateInvite` refuses to let a non-super-admin invite someone as a
 *     role that holds the wildcard permission. Without this, anyone holding
 *     `users:CREATE` — a permission far short of full access — could invite
 *     themselves a second account with full access.
 */

const INVITATIONS_PATH = join(
  __dirname,
  "..",
  "convex",
  "user",
  "invitations.ts",
);
const source = readFileSync(INVITATIONS_PATH, "utf8");

describe("user/invitations.ts", () => {
  it("exists and defines both functions this file checks", () => {
    expect(source).toMatch(/export const validateInvite = internalQuery\(/);
    expect(source).toMatch(/export const inviteUser = action\(/);
  });

  it("inviteUser calls validateInvite before it ever reaches Clerk", () => {
    const actionMatch = source.match(
      /export const inviteUser = action\(\{[\s\S]*?\n\}\);/,
    );
    expect(actionMatch).not.toBeNull();
    const body = actionMatch![0];

    const runQueryIndex = body.indexOf("ctx.runQuery");
    const fetchIndex = body.indexOf("fetch(");
    expect(runQueryIndex, "inviteUser never calls ctx.runQuery").toBeGreaterThan(
      -1,
    );
    expect(fetchIndex, "inviteUser never calls Clerk").toBeGreaterThan(-1);
    expect(
      runQueryIndex,
      "inviteUser reaches Clerk before checking the caller's permission",
    ).toBeLessThan(fetchIndex);
    expect(body).toMatch(/internal\.user\.invitations\.validateInvite/);
  });

  it("validateInvite is gated on a real permission check", () => {
    const queryMatch = source.match(
      /export const validateInvite = internalQuery\(\{[\s\S]*?\n\}\);/,
    );
    expect(queryMatch).not.toBeNull();
    expect(queryMatch![0]).toMatch(/assertPermission\(/);
  });

  it("refuses a wildcard-permission role unless the caller already holds one", () => {
    const queryMatch = source.match(
      /export const validateInvite = internalQuery\(\{[\s\S]*?\n\}\);/,
    );
    const body = queryMatch![0];

    // Both checks must read `isSuperAdminPermissions` -- once for the role
    // being granted, once for the caller granting it -- and the second must
    // gate a throw. A single call here (checking only one side) would either
    // let anyone invite a super admin, or block even a real super admin from
    // inviting one.
    const calls = body.match(/isSuperAdminPermissions\(/g) ?? [];
    expect(
      calls.length,
      "expected two isSuperAdminPermissions checks: the target role and the caller",
    ).toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/isSuperAdminPermissions\(role\.permissions\)/);
    expect(body).toMatch(/isSuperAdminPermissions\(authed\.permissions\)/);
    expect(body).toMatch(/throw new ConvexError/);
  });
});

describe("user/clerk.ts honours an invited role only on account CREATION", () => {
  const CLERK_PATH = join(__dirname, "..", "convex", "user", "clerk.ts");
  const clerkSource = readFileSync(CLERK_PATH, "utf8");

  it("reads invited_role only from public_metadata, never from a client-writable field", () => {
    expect(clerkSource).toMatch(/data\.public_metadata\?\.\s*invited_role/);
  });

  it("passes roleName through to upsertUser for both created and updated events", () => {
    // Safe to pass on both: the enforcement point is inside upsertUser
    // itself (checked below), not here.
    const caseMatch = clerkSource.match(
      /case "user\.created":\s*case "user\.updated": \{[\s\S]*?\n {6}\}/,
    );
    expect(caseMatch, "expected the shared created/updated case block").not.toBeNull();
    expect(caseMatch![0]).toMatch(/roleName: invitedRole\(event\.data\)/);
  });
});

describe("user/users.ts upsertUser applies an invited role only when creating", () => {
  const USERS_PATH = join(__dirname, "..", "convex", "user", "users.ts");
  const usersSource = readFileSync(USERS_PATH, "utf8");

  it("resolves roleName inside the CREATE branch, not the update branches", () => {
    const upsertMatch = usersSource.match(
      /export const upsertUser = internalMutation\(\{[\s\S]*?\n\}\);/,
    );
    expect(upsertMatch).not.toBeNull();
    const body = upsertMatch![0];

    // The create branch is the `else` after the two existing-user branches;
    // `invitedRoleId` must be resolved and used inside it, and nowhere
    // earlier in the function (which would mean an update path saw it too).
    const createBranchStart = body.indexOf("// Create new user");
    const invitedRoleIndex = body.indexOf("args.roleName");
    expect(createBranchStart, "expected the 'Create new user' branch").toBeGreaterThan(-1);
    expect(
      invitedRoleIndex,
      "args.roleName is read before the create branch -- it may be reachable from an update",
    ).toBeGreaterThan(createBranchStart);
    expect(body).toMatch(/role_id: invitedRoleId \?\? defaultRole\?\._id/);
  });
});

describe("rider and picker invitations require a vendor", () => {
  const INVITATIONS_SOURCE = readFileSync(
    join(__dirname, "..", "convex", "user", "invitations.ts"),
    "utf8",
  );
  const USERS_SOURCE = readFileSync(
    join(__dirname, "..", "convex", "user", "users.ts"),
    "utf8",
  );

  it("validateInvite refuses a rider/picker invite with no vendor, before Clerk is ever touched", () => {
    const queryMatch = INVITATIONS_SOURCE.match(
      /export const validateInvite = internalQuery\(\{[\s\S]*?\n\}\);/,
    );
    expect(queryMatch).not.toBeNull();
    const body = queryMatch![0];

    expect(body).toMatch(/roleLower === "rider" \|\| roleLower === "picker"/);
    expect(body).toMatch(/if \(!args\.vendorId\)/);
    expect(body).toMatch(/throw new ConvexError\(`Select a vendor/);

    // The action must call this query — and therefore run this check — before
    // it ever calls `fetch` against Clerk's API. Covered again here because
    // it is the one property that makes the guard actually load-bearing: a
    // check that runs after the invite email is already sent is too late.
    const actionMatch = INVITATIONS_SOURCE.match(
      /export const inviteUser = action\(\{[\s\S]*?\n\}\);/,
    );
    const actionBody = actionMatch![0];
    const runQueryIndex = actionBody.indexOf("ctx.runQuery");
    const fetchIndex = actionBody.indexOf("fetch(");
    expect(runQueryIndex).toBeLessThan(fetchIndex);
  });

  it("upsertUser carries the invited vendor onto rider_details/picker_details, only on CREATE", () => {
    const upsertMatch = USERS_SOURCE.match(
      /export const upsertUser = internalMutation\(\{[\s\S]*?\n\}\);/,
    );
    expect(upsertMatch).not.toBeNull();
    const body = upsertMatch![0];

    const createBranchStart = body.indexOf("// Create new user");
    const vendorIdIndex = body.indexOf("args.vendorId");
    expect(createBranchStart).toBeGreaterThan(-1);
    expect(
      vendorIdIndex,
      "args.vendorId is read before the create branch -- it may be reachable from an update",
    ).toBeGreaterThan(createBranchStart);

    expect(body).toMatch(/invitedRoleLower === "rider" && args\.vendorId/);
    expect(body).toMatch(/invitedRoleLower === "picker" && args\.vendorId/);
    expect(body).toMatch(/rider_details: riderDetails/);
    expect(body).toMatch(/picker_details: pickerDetails/);
  });
});
