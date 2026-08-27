import { ConvexError } from "convex/values";
import {
  isAllowed,
  isSystemRoleName,
  hasPermission as listHasPermission,
  type Permission,
} from "@repo/lib/utils";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isSuperAdminPermissions } from "./lib/role_presets";

/**
 * The single auth surface for every Convex function.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Convex exports every function publicly. Before this module there were four
 * mutually incompatible, hand-rolled auth patterns across 57 modules, and
 * `getUserIdentity()` appeared in only four of them — 452 of 471 functions had
 * no identity check at all. The Phase B0 audit confirmed an unauthenticated
 * agent payout chain live on the deployment the apps actually use.
 *
 * The four patterns being replaced, and what each maps to:
 *
 *   legalAcceptances.ts       identity -> user, throw    -> getAuthUser
 *   incentives.ts             roleName !== "Admin"       -> assertPermission
 *                             (but see the note below — that gate is dead)
 *   prescriptionRejection...  !user.isStaff              -> assertStaffOrPermission
 *   location.ts               auth?.subject || body      -> removed; never trust the body
 *
 * ── Field naming ──────────────────────────────────────────────────────────
 *
 * Blink stores `clerkId` (camelCase) indexed by `by_clerkId`, where sydia uses
 * `clerk_id` / `by_clerk_id`. Phase B5 renames it. Concentrating the lookup here
 * means that rename touches one line instead of the twenty hand-rolled copies it
 * would have.
 *
 * ── A gate that currently denies everyone ─────────────────────────────────
 *
 * `incentives.ts` guards ten mutations on `roleName !== "Admin"`. The audit
 * confirmed **no role in production is named exactly "Admin"** — the live roles
 * are SUPER ADMIN, GENERAL MANAGER, Hub Manager, Supervisor and Clearance Vendor
 * Manager. So those ten mutations are unreachable today. Replacing that check
 * with a working permission gate is a *widening* of access, not a refactor, and
 * needs product sign-off before it ships.
 */

// ── Shadow mode ───────────────────────────────────────────────────────────

/**
 * When `AUTH_SHADOW_MODE` is set to `"true"` on the deployment, permission
 * failures are logged and allowed instead of thrown.
 *
 * The audit showed the blast radius is small (5 admin users across 5 roles, all
 * holding real permissions) but not zero: **SUPER ADMIN is missing all three
 * `clearance:*` grants** while the current client-side `isAdminUser` check grants
 * it clearance access anyway. Enforcing without a soak would strip that.
 *
 * So: deploy with shadow mode on, read the denial log for a business week,
 * backfill the roles the log names, then set it to `"false"`. Rolling back is an
 * env-var change, not a redeploy.
 *
 * Authentication is never shadowed — an anonymous caller is always rejected.
 * Only *authorization* is soaked.
 */
function shadowMode(): boolean {
  return process.env.AUTH_SHADOW_MODE === "true";
}

// ── Core ──────────────────────────────────────────────────────────────────

export type AuthedUser = {
  user: {
    _id: Id<"users">;
    clerkId: string;
    role_id?: Id<"roles">;
    isStaff?: boolean;
    [k: string]: unknown;
  };
  roleName: string | null;
  permissions: string[];
};

/**
 * Resolve the calling identity to a Blink user, its role name and its permission
 * list. Throws if unauthenticated or if the Clerk identity has no user row.
 *
 * This is the one-line preamble every authenticated function starts with:
 *
 *   const { user } = await getAuthUser(ctx);
 */
export async function getAuthUser(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthedUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthorized");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new ConvexError("User not found");

  const role = user.role_id ? await ctx.db.get(user.role_id) : null;

  return {
    user: user as AuthedUser["user"],
    roleName: role?.name ?? null,
    permissions: role?.permissions ?? [],
  };
}

/**
 * Like `getAuthUser` but returns `null` instead of throwing.
 *
 * For queries that are legitimately public but personalise when signed in — a
 * product listing that also marks wishlist state, for example.
 */
export async function getAuthUserOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthedUser | null> {
  try {
    return await getAuthUser(ctx);
  } catch {
    return null;
  }
}

// ── Authorization ─────────────────────────────────────────────────────────

/**
 * Assert the caller holds `permission`.
 *
 * `permission` is the typed template union from `@repo/lib/utils`, so a guard
 * string that no role could ever be granted is a compile error rather than a
 * silent denial. System roles (rider, picker, customer) bypass — they hold zero
 * permissions by design.
 */
export async function assertPermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission,
): Promise<AuthedUser> {
  const authed = await getAuthUser(ctx);
  if (isAllowed(authed.roleName, authed.permissions, permission)) return authed;

  const detail = `role="${authed.roleName ?? "none"}" user=${authed.user._id} permission="${permission}"`;
  if (shadowMode()) {
    console.error(`[auth:shadow] WOULD DENY ${detail}`);
    return authed;
  }
  throw new ConvexError(`Forbidden: missing permission "${permission}"`);
}

/** Non-throwing variant, for conditionally shaping a response. */
export async function hasPermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission,
): Promise<boolean> {
  const authed = await getAuthUserOrNull(ctx);
  if (!authed) return false;
  return isAllowed(authed.roleName, authed.permissions, permission);
}

/**
 * Assert the caller holds the wildcard permission — nothing less.
 *
 * For actions with no corresponding entry in `permissionResources`, so there is
 * no `Permission` string `assertPermission` could check. Platform settings is
 * the case that motivated this: it is deliberately not a "module" in the
 * permission vocabulary (see `apps/admin/lib/navigation.ts`'s
 * `ADMIN_ONLY_LINKS` comment), so the only thing to gate it on is holding `"*"`
 * itself.
 *
 * No shadow mode. Everything else here can soft-fail into a logged denial while
 * the shadow log is validated, because the roles it protects already existed
 * with real permissions on them. Nothing did that for the wildcard — it did not
 * exist as a concept before this session's bootstrap work — so there is no
 * "existing behaviour" a shadow-mode escape hatch would be preserving.
 */
export async function assertSuperAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthedUser> {
  const authed = await getAuthUser(ctx);
  if (isSuperAdminPermissions(authed.permissions)) return authed;
  throw new ConvexError("Forbidden: super admin required");
}

/**
 * Bridge for the `isStaff` boolean, which gates prescription rejection reasons
 * independently of `role_id`.
 *
 * `isStaff` is orthogonal to role, so the set of staff users is almost certainly
 * not a subset of "users whose role grants this permission". Passing on either
 * condition preserves exactly today's access. Drop the `isStaff` leg once the
 * roles are backfilled and the shadow log is clean — tracked as an open product
 * question in §11 of the plan.
 */
export async function assertStaffOrPermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission,
): Promise<AuthedUser> {
  const authed = await getAuthUser(ctx);
  if (authed.user.isStaff === true) return authed;
  if (isAllowed(authed.roleName, authed.permissions, permission)) return authed;

  const detail = `role="${authed.roleName ?? "none"}" user=${authed.user._id} permission="${permission}" isStaff=false`;
  if (shadowMode()) {
    console.error(`[auth:shadow] WOULD DENY ${detail}`);
    return authed;
  }
  throw new ConvexError(`Forbidden: missing permission "${permission}"`);
}

/**
 * Admin-or-owner, the common shape for "a user may read their own record, staff
 * may read anyone's".
 */
export async function assertSelfOrPermission(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  permission: Permission,
): Promise<AuthedUser> {
  const authed = await getAuthUser(ctx);
  if (authed.user._id === userId) return authed;
  return assertPermission(ctx, permission);
}

// ── System-role gates ─────────────────────────────────────────────────────

/**
 * Riders and pickers hold zero permissions, so `assertPermission` can never gate
 * a rider or picker endpoint. They are gated by role name instead.
 */
async function assertSystemRole(
  ctx: QueryCtx | MutationCtx,
  expected: "Rider" | "Picker",
): Promise<AuthedUser> {
  const authed = await getAuthUser(ctx);
  const name = authed.roleName?.trim().toLowerCase();
  if (name === expected.toLowerCase()) return authed;
  // A staff role with the matching permission may also act on these endpoints.
  if (!isSystemRoleName(authed.roleName) && authed.permissions.length > 0) {
    const resource = expected === "Rider" ? "riders" : "pickers";
    if (listHasPermission(authed.permissions, `${resource}:UPDATE`)) {
      return authed;
    }
  }
  throw new ConvexError(`Forbidden: ${expected} role required`);
}

export function assertRider(ctx: QueryCtx | MutationCtx) {
  return assertSystemRole(ctx, "Rider");
}

export function assertPicker(ctx: QueryCtx | MutationCtx) {
  return assertSystemRole(ctx, "Picker");
}

// ── Ownership ─────────────────────────────────────────────────────────────

/**
 * Assert the caller owns the given agent record.
 *
 * This closes `agentPaymentRequests.createPaymentRequest`, which took `agentId`
 * as a client argument with no identity check — so any caller could open a payout
 * request against any agent. It needs no permission data, only authentication
 * plus an ownership comparison, which is why it can ship ahead of the RBAC work.
 */
export async function assertAgentOwner(
  ctx: QueryCtx | MutationCtx,
  agentId: Id<"agents">,
) {
  const authed = await getAuthUser(ctx);
  const agent = await ctx.db.get(agentId);
  if (!agent) throw new ConvexError("Agent not found");
  if (agent.user_id !== authed.user._id) throw new ConvexError("Forbidden");
  return { ...authed, agent };
}

/**
 * The acting user's id, for stamping audit fields.
 *
 * Use this instead of accepting `processedBy: v.id("users")` as an argument.
 * `updatePaymentRequestStatus` and `processPaymentRequest` both took a
 * client-supplied `processedBy`, which makes the approval trail forgeable.
 */
export async function actingUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const { user } = await getAuthUser(ctx);
  return user._id;
}

/**
 * Look up a user by Clerk id, throwing if absent.
 *
 * Moved from `helpers/userHelpers.ts`, where it took `ctx: any` — as did every
 * export in that file. It belongs here because it is the same lookup
 * `getAuthUser` performs, against the same `by_clerkId` index, so the Phase B5
 * rename of `clerkId` -> `clerk_id` now touches two adjacent lines in one file
 * instead of scattered copies.
 *
 * Note this trusts a `clerkId` passed as an argument, so it authenticates
 * nothing on its own. Prefer `getAuthUser`, which derives the identity from the
 * request. This exists for the ~4 call sites that still take `clerkId` as a
 * parameter (`data/cart.ts`, `data/orders.ts`, `data/wishlist.ts`); each is a
 * candidate for conversion to `getAuthUser` as guards are wired.
 */
export async function getUserByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();

  if (!user) throw new ConvexError("User not found. Please sign in again.");
  return user;
}
