/**
 * Frontend role helpers.
 *
 * Role names are stored in Title Case in the database ("Rider", "Picker", etc.).
 * All comparisons are case-insensitive so callers don't need to worry about casing.
 */

export const SYSTEM_ROLES = {
  RIDER: "Rider",
  PICKER: "Picker",
  CUSTOMER: "Customer",
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

function eq(a: string | null | undefined, b: string): boolean {
  return !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function isRider(roleName: string | null | undefined): boolean {
  return eq(roleName, SYSTEM_ROLES.RIDER);
}

export function isPicker(roleName: string | null | undefined): boolean {
  return eq(roleName, SYSTEM_ROLES.PICKER);
}

export function isCustomer(roleName: string | null | undefined): boolean {
  return eq(roleName, SYSTEM_ROLES.CUSTOMER);
}

export function isSystemRole(roleName: string | null | undefined): boolean {
  return isRider(roleName) || isPicker(roleName) || isCustomer(roleName);
}
