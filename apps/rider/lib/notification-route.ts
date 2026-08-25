/**
 * Turning a notification's stored route into one this app actually has.
 *
 * The backend writes a `route` string into `notifications.data` at creation
 * time, so the strings in the table were written for whichever app version
 * created them. Two of the four in use do not exist here:
 *
 *   /(tabs)/deliveries      exists
 *   /(picker-tabs)/orders   the old app's second tab group — this app has one
 *   /orders                 a customer-app route
 *   /clearance              a customer-app route
 *
 * Following them blindly lands a picker on +not-found when they tap an
 * assignment. Rewriting the backend instead would couple stored data to a
 * navigator and break the moment either app's routes change, so the app — which
 * is the only thing that knows its own routes — maps them here.
 *
 * Pure, so the mapping is checkable without a navigator.
 */
import type { CrewRole } from "./roles";

/** Where a notification with no usable route sends the crew member. */
export const FALLBACK_ROUTE = "/notifications";

/**
 * Routes this app can navigate to from a notification.
 *
 * An allowlist, not a passthrough: `data` is free-form on the notifications
 * table, so an arbitrary string could arrive there. Navigating to an unvetted
 * path is how a notification becomes a way to drive the app somewhere it should
 * not go.
 */
const KNOWN_ROUTES = new Set<string>([
  "/(tabs)",
  "/(tabs)/deliveries",
  "/(tabs)/incentives",
  "/(tabs)/profile",
  "/notifications",
  "/prescriptions",
  "/shifts",
  "/payout-details",
  "/personal-details",
]);

/**
 * Legacy routes that have a real equivalent here.
 *
 * `(picker-tabs)/orders` is the interesting one: it maps to the same tab a rider
 * uses, because this app unified the two groups and the tab renames itself.
 */
const LEGACY: Record<string, string> = {
  "/(picker-tabs)/orders": "/(tabs)/deliveries",
  "/(picker-tabs)": "/(tabs)",
  "/(picker-tabs)/incentives": "/(tabs)/incentives",
  "/(picker-tabs)/profile": "/(tabs)/profile",
  "/(picker-tabs)/prescriptions": "/prescriptions",
};

/** Routes belonging to the customer app, which a crew member cannot use. */
const CUSTOMER_ONLY = new Set<string>(["/orders", "/clearance", "/cart"]);

export interface NotificationTarget {
  route: string;
  /** Params to pass, when the payload identifies a specific record. */
  params?: Record<string, string>;
}

/**
 * Resolves where tapping a notification should go.
 *
 * Prefers a specific record over a tab: a rider tapping "Order #BR-4821
 * assigned" wants that delivery, not the list. The ids in `data` are written by
 * the notification creators (`shipmentId`, `orderId`), so a deep link is only
 * built when one is present and the role can act on it.
 */
export function resolveNotificationTarget(
  data: unknown,
  role: CrewRole,
): NotificationTarget {
  if (typeof data !== "object" || data === null) {
    return { route: FALLBACK_ROUTE };
  }
  const payload = data as Record<string, unknown>;

  // A specific record beats a list.
  const shipmentId = asId(payload.shipmentId);
  if (role === "rider" && shipmentId) {
    return { route: "/delivery/[id]", params: { id: shipmentId } };
  }
  const orderId = asId(payload.orderId);
  if (role === "picker" && orderId) {
    return { route: "/picklist/[id]", params: { id: orderId } };
  }

  const stored = typeof payload.route === "string" ? payload.route : null;
  if (!stored) return { route: FALLBACK_ROUTE };

  const mapped = LEGACY[stored] ?? stored;
  if (CUSTOMER_ONLY.has(mapped)) return { route: FALLBACK_ROUTE };
  if (!KNOWN_ROUTES.has(mapped)) return { route: FALLBACK_ROUTE };

  return { route: mapped };
}

/**
 * A Convex id arrives as a string. Only shape is checked, not existence — the
 * screen handles a missing record already, and a lookup here would mean a query
 * from a notification handler.
 */
function asId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return null;
  // Convex ids are URL-safe base32-ish; reject anything with path characters so
  // a payload cannot smuggle a route fragment through an id field.
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}
