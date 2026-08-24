/**
 * Role-based access control — the single authority for both the Convex guards
 * and the admin roles form.
 *
 * Permission format: `resource:ACTION`, e.g. `orders:CREATE`.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 *
 * Blink had three competing permission vocabularies before this file:
 *
 *   1. `convex/lib/permissions.ts` — 17 resources x CREATE|READ|UPDATE, UPPERCASE.
 *      This is what `blink-admin/components/roles/RoleForm.tsx` writes, so it is
 *      what is actually sitting in the production `roles` table.
 *   2. `blink-admin/lib/dashboard-permissions.ts` — added inheritance rules
 *      (CREATE satisfies UPDATE, CREATE satisfies DELETE) that a flat
 *      `Array.includes` check does not reproduce.
 *   3. `blink-admin/lib/auth/permissions.ts` — a third, lowercase `view|manage`
 *      vocabulary used by exactly one page. Not ported. Tombstone it.
 *
 * Backend and frontend evaluating access differently is how you get a screen
 * that renders but whose mutations reject, or worse the reverse. So: one module,
 * imported by both.
 *
 * ── Why the resource list has 21 entries ──────────────────────────────────
 *
 * The Phase B0 production audit dumped the live `roles` table and found the
 * database grants **19** distinct resources while the old code declared **17**.
 * Four resources were granted in production but absent from the type:
 * `customers`, `pickers`, `riders`, `staff`. A template-literal union built from
 * the old 17 would therefore have rejected live data on the first deploy.
 *
 * `transactions` and `payroll` are declared but currently unused in the data —
 * kept because their dashboard routes exist.
 *
 * ── Casing is deliberate ──────────────────────────────────────────────────
 *
 * UPPERCASE actions are kept even though the sydia convention is lowercase.
 * Renaming would mean migrating every `roles.permissions` array in production
 * plus a coordinated admin deploy, with lockout risk, to buy consistency with a
 * different codebase. Not worth it. See §11 of the migration plan.
 */

// ── Resources ─────────────────────────────────────────────────────────────

export const permissionResources = [
  "agents",
  "banners",
  "categories",
  "clearance",
  "customers",
  "industries",
  "insights",
  "orders",
  "payments",
  "payroll",
  "pickers",
  "prescriptions",
  "products",
  "riders",
  "roles",
  "schedules",
  "shipments",
  "staff",
  "transactions",
  "users",
  "vendors",
] as const;

export type PermissionResource = (typeof permissionResources)[number];

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * Actions a role can actually be *granted*. This is what the admin roles form
 * emits and what is stored in `roles.permissions`.
 */
export const grantableActions = ["CREATE", "READ", "UPDATE"] as const;
export type GrantableAction = (typeof grantableActions)[number];

/**
 * Actions a guard can *check*. `DELETE` is checkable but not grantable — it is
 * satisfied by holding `CREATE` on the same resource, matching the behaviour of
 * `blink-admin/lib/dashboard-permissions.ts`.
 */
export const permissionActions = ["CREATE", "READ", "UPDATE", "DELETE"] as const;
export type PermissionAction = (typeof permissionActions)[number];

/** A permission string a guard may assert. */
export type Permission = `${PermissionResource}:${PermissionAction}`;

/** A permission string that may be stored on a role. */
export type GrantablePermission = `${PermissionResource}:${GrantableAction}`;

/** Grants everything. No role holds this in production yet — see `seed.ts`. */
export const WILDCARD_PERMISSION = "*";

// ── Inheritance ───────────────────────────────────────────────────────────

/**
 * Which stored actions satisfy a requested action.
 *
 * Ported verbatim in behaviour from `dashboard-permissions.ts`:
 *   - CREATE implies UPDATE and DELETE (if you can create it, you can change it)
 *   - UPDATE does NOT imply CREATE
 *   - READ stands alone
 *
 * Getting this wrong silently revokes update and delete from every role that
 * was granted only CREATE — which is most of them.
 */
const SATISFIED_BY: Record<PermissionAction, readonly GrantableAction[]> = {
  CREATE: ["CREATE"],
  READ: ["READ"],
  UPDATE: ["UPDATE", "CREATE"],
  DELETE: ["CREATE"],
};

// ── Route mapping (admin navigation only — the backend never reads this) ──

export const RESOURCE_ROUTES: Record<PermissionResource, string> = {
  agents: "/agents",
  banners: "/banners",
  categories: "/categories",
  clearance: "/clearance",
  customers: "/users",
  industries: "/industries",
  insights: "/insights",
  orders: "/orders",
  payments: "/payments",
  payroll: "/payroll",
  pickers: "/staff",
  prescriptions: "/prescriptions/rejection-reasons",
  products: "/products",
  riders: "/riders",
  roles: "/roles",
  schedules: "/schedules",
  shipments: "/shipments",
  staff: "/staff",
  transactions: "/transactions",
  users: "/users",
  vendors: "/vendors",
};

// ── System roles ──────────────────────────────────────────────────────────

/**
 * Roles that bypass permission checks entirely — they have full access to their
 * own portal and hold zero permissions. Compared case-insensitively because the
 * database stores them Title Case ("Rider") while older code compared lowercase.
 */
export const SYSTEM_ROLE_NAMES = ["rider", "picker", "customer"] as const;

export function isSystemRoleName(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  return SYSTEM_ROLE_NAMES.some((r) => r === lower);
}

// ── Evaluation ────────────────────────────────────────────────────────────

function parse(
  permission: string,
): { resource: string; action: string } | null {
  const idx = permission.indexOf(":");
  if (idx <= 0 || idx === permission.length - 1) return null;
  return {
    resource: permission.slice(0, idx),
    action: permission.slice(idx + 1),
  };
}

/**
 * Does this permission list satisfy `permission`?
 *
 * Accepts `string` rather than `Permission` for the stored list because
 * `roles.permissions` is `v.array(v.string())` in the schema and is therefore
 * unvalidated — junk may exist. Unrecognised entries simply never match.
 */
export function hasPermission(
  permissions: readonly string[],
  permission: Permission,
): boolean {
  if (permissions.includes(WILDCARD_PERMISSION)) return true;
  if (permissions.includes(permission)) return true;

  const parsed = parse(permission);
  if (!parsed) return false;

  const satisfiers = SATISFIED_BY[parsed.action as PermissionAction];
  if (!satisfiers) return false;

  return satisfiers.some((a) => permissions.includes(`${parsed.resource}:${a}`));
}

export function hasAnyPermission(
  permissions: readonly string[],
  wanted: readonly Permission[],
): boolean {
  return wanted.some((p) => hasPermission(permissions, p));
}

/**
 * Full access decision, including the system-role bypass.
 *
 * Riders and pickers hold no permissions, so a permission check can never pass
 * for them — they are gated by role name instead. Keeping that bypass here
 * preserves exactly who can do what today.
 */
export function isAllowed(
  roleName: string | null | undefined,
  permissions: readonly string[],
  permission: Permission,
): boolean {
  if (isSystemRoleName(roleName)) return true;
  return hasPermission(permissions, permission);
}

/** Dashboard route prefixes a permission list grants access to. */
export function getAccessibleRoutes(
  permissions: readonly string[],
): string[] {
  if (permissions.includes(WILDCARD_PERMISSION)) {
    return [...new Set(Object.values(RESOURCE_ROUTES))];
  }
  const routes = new Set<string>();
  for (const resource of permissionResources) {
    if (permissions.some((p) => p.startsWith(`${resource}:`))) {
      routes.add(RESOURCE_ROUTES[resource]);
    }
  }
  return [...routes];
}

// ── Construction helpers (used by the roles form and by seed.ts) ──────────

export function buildPermissions(
  resources: readonly PermissionResource[],
  actions: readonly GrantableAction[],
): GrantablePermission[] {
  return resources.flatMap((r) =>
    actions.map((a) => `${r}:${a}` as GrantablePermission),
  );
}

export function buildAllPermissions(): GrantablePermission[] {
  return buildPermissions(permissionResources, grantableActions);
}

/**
 * Is every entry a well-formed grantable permission?
 *
 * `RolesValidator.permissions` is an unvalidated `v.array(v.string())`, so this
 * exists to be called at the write boundary in `roles.createRole` /
 * `roles.updateRole` rather than trusting the client.
 */
export function findMalformedPermissions(
  permissions: readonly string[],
): string[] {
  const valid = new Set<string>([
    WILDCARD_PERMISSION,
    ...buildAllPermissions(),
  ]);
  return permissions.filter((p) => !valid.has(p));
}
