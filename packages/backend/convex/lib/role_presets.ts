import {
  WILDCARD_PERMISSION,
  isSystemRoleName,
} from "@repo/lib/utils";

/**
 * The roles a Blink deployment cannot function without.
 *
 * ── Why these four, and why as data ───────────────────────────────────────
 *
 * A fresh deployment has an empty `roles` table, which means a signed-up user
 * gets `role_id: undefined` and every gate in the app denies them. There is no
 * way out through the UI, because the roles page is itself behind a gate. So the
 * first four roles have to come from somewhere that is not the UI.
 *
 * Pure data in `lib/` rather than inline in a mutation, so the shapes are
 * testable without a database: the invariants below are the sort of thing that
 * is wrong once and then wrong forever, since roles are seeded a single time and
 * nobody re-reads them.
 *
 * ── The wildcard ─────────────────────────────────────────────────────────
 *
 * Super Admin holds `"*"`, which `hasPermission` short-circuits on. This is the
 * first role in Blink to hold it — `RoleForm` builds permissions from checkboxes
 * over `resource:ACTION` pairs and cannot emit a bare asterisk, which is exactly
 * why the old admin had to fake absolute access with "any role that is not
 * Rider/Picker/Customer counts as admin". That definition granted total access to
 * every non-system role regardless of what its `permissions` array said.
 *
 * ── The three system roles ───────────────────────────────────────────────
 *
 * Customer, Rider and Picker hold NO permissions, deliberately. They are gated
 * by role name through `isSystemRoleName`, because their access is to their own
 * app rather than to dashboard resources. Giving them permissions here would let
 * them through admin gates that check permissions rather than names.
 *
 * Customer is `is_default: true`, which is what `upsertUser` reads when the Clerk
 * webhook creates a user. Without exactly one default, every new signup lands
 * with no role at all — which is the state this file exists to prevent.
 */

export interface RolePreset {
  name: string;
  description: string;
  permissions: string[];
  is_default: boolean;
  manages_vendor: boolean;
}

export const SUPER_ADMIN_ROLE_NAME = "Super Admin";

export const rolePresets: RolePreset[] = [
  {
    name: SUPER_ADMIN_ROLE_NAME,
    description:
      "Absolute access to every module and action. Held by the platform owner.",
    permissions: [WILDCARD_PERMISSION],
    is_default: false,
    manages_vendor: false,
  },
  {
    name: "Customer",
    description:
      "Shops on the Blink app. Assigned automatically to every new signup.",
    permissions: [],
    // The role the Clerk webhook assigns to a new user. Exactly one role may
    // carry this.
    is_default: true,
    manages_vendor: false,
  },
  {
    name: "Rider",
    description: "Delivers orders. Uses the crew app, not the dashboard.",
    permissions: [],
    is_default: false,
    manages_vendor: false,
  },
  {
    name: "Picker",
    description:
      "Picks and packs orders at a hub. Uses the crew app, not the dashboard.",
    permissions: [],
    is_default: false,
    manages_vendor: false,
  },
];

/**
 * Does this role grant everything?
 *
 * By permission, not by name. A role called "Super Admin" with an empty
 * permissions array grants nothing, and a role called anything at all with `"*"`
 * grants everything — the array is the authority, and treating the name as the
 * authority is the bug this replaces.
 */
export function isSuperAdminPermissions(
  permissions: readonly string[] | null | undefined,
): boolean {
  return (permissions ?? []).includes(WILDCARD_PERMISSION);
}

/**
 * Invariants the presets must satisfy.
 *
 * Exported so a test can assert them, and called by the seeder so a bad edit
 * fails at seed time rather than producing a deployment nobody can sign in to.
 */
export function validateRolePresets(presets: RolePreset[] = rolePresets): string[] {
  const problems: string[] = [];

  const defaults = presets.filter((p) => p.is_default);
  if (defaults.length !== 1) {
    problems.push(
      `exactly one preset must be is_default, found ${defaults.length}` +
        ` (${defaults.map((d) => d.name).join(", ") || "none"})`,
    );
  }

  const wildcards = presets.filter((p) => isSuperAdminPermissions(p.permissions));
  if (wildcards.length !== 1) {
    problems.push(
      `exactly one preset must hold the wildcard, found ${wildcards.length}`,
    );
  }

  const names = presets.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    problems.push("preset names must be unique, case-insensitively");
  }

  for (const preset of presets) {
    // A system role that also holds permissions would pass BOTH the name bypass
    // and permission checks, which is a rider reaching admin mutations.
    if (isSystemRoleName(preset.name) && preset.permissions.length > 0) {
      problems.push(
        `${preset.name} is a system role and must hold no permissions`,
      );
    }
    // Conversely the wildcard holder must not be a system role, or the bypass
    // would make its permissions irrelevant.
    if (
      isSuperAdminPermissions(preset.permissions) &&
      isSystemRoleName(preset.name)
    ) {
      problems.push(`${preset.name} must not be both a system role and wildcard`);
    }
  }

  return problems;
}
