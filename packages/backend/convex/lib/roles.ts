import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ── System role names (Title Case, matching DB entries) ────────
export const SYSTEM_ROLES = {
  RIDER: "Rider",
  PICKER: "Picker",
  CUSTOMER: "Customer",
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

// ── Helpers ────────────────────────────────────────────────────

/** Check whether a role name is a system role (case-insensitive). */
export function isSystemRole(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return Object.values(SYSTEM_ROLES).some((r) => r.toLowerCase() === lower);
}

/** Fetch a role document by its ID. */
export async function getRoleById(
  ctx: QueryCtx | MutationCtx,
  roleId: Id<"roles">,
) {
  return await ctx.db.get(roleId);
}

/** Resolve a user's role name from their `role_id`. Returns `null` if unset. */
export async function getUserRoleName(
  ctx: QueryCtx | MutationCtx,
  user: { role_id?: Id<"roles"> } | null | undefined,
): Promise<string | null> {
  if (!user?.role_id) return null;
  const role = await ctx.db.get(user.role_id);
  return role?.name ?? null;
}

/** Check whether a user has a specific role name (case-insensitive). */
export async function hasRoleName(
  ctx: QueryCtx | MutationCtx,
  user: { role_id?: Id<"roles"> } | null | undefined,
  roleName: string,
): Promise<boolean> {
  const name = await getUserRoleName(ctx, user);
  if (!name) return false;
  return name.trim().toLowerCase() === roleName.trim().toLowerCase();
}

/** Shorthand: is the user a Rider? */
export async function isRider(
  ctx: QueryCtx | MutationCtx,
  user: { role_id?: Id<"roles"> } | null | undefined,
): Promise<boolean> {
  return hasRoleName(ctx, user, SYSTEM_ROLES.RIDER);
}

/** Shorthand: is the user a Picker? */
export async function isPicker(
  ctx: QueryCtx | MutationCtx,
  user: { role_id?: Id<"roles"> } | null | undefined,
): Promise<boolean> {
  return hasRoleName(ctx, user, SYSTEM_ROLES.PICKER);
}

/** Resolve a role name (case-insensitive) to its _id from the roles table. */
export async function getRoleIdByName(
  ctx: QueryCtx | MutationCtx,
  name: string,
): Promise<Id<"roles"> | null> {
  // Fast path: exact match via index
  const exactMatch = await ctx.db
    .query("roles")
    .withIndex("by_name", (q: any) => q.eq("name", name))
    .first();
  if (exactMatch) return exactMatch._id;

  // Fallback: case-insensitive scan
  const allRoles = await ctx.db.query("roles").collect();
  const match = allRoles.find(
    (r) => r.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  return match?._id ?? null;
}
