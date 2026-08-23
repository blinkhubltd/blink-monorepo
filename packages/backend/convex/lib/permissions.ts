/**
 * Permission system for role-based access control.
 *
 * Permission format:  resource:ACTION
 *   resource = lowercase, hyphenated plural noun
 *   ACTION   = CREATE | READ | UPDATE
 */

// ── Resources ──────────────────────────────────────────────────
export const RESOURCES = [
  "users",
  "roles",
  "orders",
  "categories",
  "shipments",
  "products",
  "vendors",
  "payments",
  "transactions",
  "banners",
  "payroll",
  "schedules",
  "prescriptions",
  "industries",
  "agents",
  "insights",
  "clearance",
] as const;

export type Resource = (typeof RESOURCES)[number];

// ── Actions ────────────────────────────────────────────────────
export const ACTIONS = ["CREATE", "READ", "UPDATE"] as const;
export type Action = (typeof ACTIONS)[number];

export type Permission = `${Resource}:${Action}`;

// ── Resource → dashboard route mapping ─────────────────────────
export const RESOURCE_ROUTES: Record<Resource, string> = {
  users: "/users",
  roles: "/roles",
  orders: "/orders",
  categories: "/categories",
  shipments: "/shipments",
  products: "/products",
  vendors: "/vendors",
  payments: "/payments",
  transactions: "/transactions",
  banners: "/banners",
  payroll: "/payroll",
  schedules: "/schedules",
  prescriptions: "/prescriptions/rejection-reasons",
  industries: "/industries",
  agents: "/agents",
  insights: "/insights",
  clearance: "/clearance",
};

// ── Helpers ────────────────────────────────────────────────────

/** Build every `resource:ACTION` combination for the given resources and actions. */
export function buildPermissions(
  resources: Resource[],
  actions: Action[],
): Permission[] {
  return resources.flatMap((r) =>
    actions.map((a) => `${r}:${a}` as Permission),
  );
}

/** Build ALL possible permission strings. */
export function buildAllPermissions(): Permission[] {
  return buildPermissions([...RESOURCES], [...ACTIONS]);
}

/** Check whether a permission list contains a specific permission. */
export function hasPermission(
  permissions: string[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}

/** Derive dashboard route prefixes the user may access based on their permission list. */
export function getAccessibleRoutes(permissions: string[]): string[] {
  const routes: string[] = [];
  for (const resource of RESOURCES) {
    if (permissions.some((p) => p.startsWith(`${resource}:`))) {
      routes.push(RESOURCE_ROUTES[resource]);
    }
  }
  return routes;
}

// ── Reserved / system role names (case-insensitive) ────────────
export const SYSTEM_ROLE_NAMES = ["rider", "picker", "customer"] as const;

export function isSystemRoleName(name: string): boolean {
  return SYSTEM_ROLE_NAMES.includes(
    name.trim().toLowerCase() as (typeof SYSTEM_ROLE_NAMES)[number],
  );
}

/**
 * Check whether a user with the given role name and permissions
 * is allowed to perform `permission`.
 *
 * System roles (rider, picker, customer) bypass permission checks entirely —
 * they have full access to their respective portals.
 * Permissions are only evaluated for admin / custom roles.
 */
export function isAllowed(
  roleName: string,
  permissions: string[],
  permission: Permission,
): boolean {
  if (isSystemRoleName(roleName)) return true;
  return hasPermission(permissions, permission);
}
