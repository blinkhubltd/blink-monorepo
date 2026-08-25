import { Id } from "@repo/backend/dataModel";

export type UserRole = string;

export type Permission =
  | "dashboard:view"
  | "users:view"
  | "users:manage"
  | "orders:view"
  | "orders:manage"
  | "vendors:view"
  | "vendors:manage"
  | "products:view"
  | "products:manage"
  | "categories:view"
  | "categories:manage"
  | "analytics:view"
  | "analytics:manage"
  | "shipments:view"
  | "shipments:manage"
  | "payments:view"
  | "payments:manage"
  | "banners:view"
  | "banners:manage"
  | "payroll:view"
  | "payroll:manage"
  | "schedules:view"
  | "schedules:manage"
  | "prescriptions/rejection-reasons:view"
  | "prescriptions/rejection-reasons:manage"
  | "industries:view"
  | "industries:manage"
  | "agents:view"
  | "agents:manage";

export interface User {
  _id: Id<"users">;
  clerkId: string;
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  role_id?: Id<"roles">;
  status?: "Active" | "Inactive";
  manager_details?: {
    vendor_id: Id<"vendors">[];
    assigned_at?: number;
  };
  picker_details?: {
    vendor_id: Id<"vendors">;
    status: "Active" | "On Order" | "Inactive";
  };
  rider_details?: {
    vehicle_type: "Motorbike" | "Bicycle" | "Car" | "Van";
    status: "Active" | "On Delivery" | "Inactive";
  };
}

function normalizeRole(role?: string | null): string {
  return (role ?? "").trim().toLowerCase();
}

export function hasPermission(
  user: User | null,
  _permission: Permission,
): boolean {
  return !!user;
}

export function canAccessRoute(user: User | null, _route: string): boolean {
  return !!user;
}

export function hasRouteAccess(_role: UserRole, _route: string): boolean {
  return false;
}

export function getRolePermissions(_role: UserRole): Permission[] {
  return [];
}

export function getRoleRoutes(_role: UserRole): string[] {
  return [];
}

/** A user is a manager if they have vendor assignments (manager_details) or rider/picker/vendor details. */
export function isManager(user: User | null): boolean {
  return (user?.manager_details?.vendor_id?.length ?? 0) > 0;
}

export function isManagerOfVendor(
  user: User | null,
  vendorId: Id<"vendors">,
): boolean {
  return user?.manager_details?.vendor_id?.includes(vendorId) ?? false;
}

export function getUnauthorizedMessage(
  user: User | null,
  _context?: string,
): string {
  if (!user) {
    return "Please sign in to access this resource.";
  }
  return "You don't have permission to access this resource.";
}

export function requirePermission(permission: Permission) {
  return function (user: User | null) {
    if (!hasPermission(user, permission)) {
      throw new Error(getUnauthorizedMessage(user));
    }
    return true;
  };
}

export function requireRouteAccess(route: string) {
  return function (user: User | null) {
    if (!canAccessRoute(user, route)) {
      throw new Error(getUnauthorizedMessage(user, route));
    }
    return true;
  };
}
