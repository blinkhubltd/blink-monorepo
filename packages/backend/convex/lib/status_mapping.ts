import { orderStatus, shipmentStatus } from "../validators";

/**
 * The single authority for order <-> shipment status translation.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * Two verbatim copies of the shipment->order map existed:
 *   - `shipments.ts:46-53` (inline, inside `mapShipmentStatusToOrderStatus`)
 *   - `helpers/statusSync.ts:23-29`, whose own comment admitted the duplication:
 *     "already exists in shipments.ts; replicate for central reference"
 *
 * The "central reference" was exported as `StatusMappings` and imported by
 * nothing. Meanwhile the literals were hardcoded again at `dispatch.ts:193,203`,
 * `orders.ts:1158`, `pickerOrders.ts:473,484`, `shipments.ts:416` and
 * `tracking.ts:200,220`.
 *
 * Both directions now live here, typed as exhaustive `Record`s so adding a
 * status to either enum without adding its mapping is a compile error. That
 * exhaustiveness is the whole point — it is the check that would have caught the
 * drift in the first place.
 *
 * ── The asymmetry is deliberate, not a bug ────────────────────────────────
 *
 * These maps are NOT inverses of each other:
 *
 *   shipment "Picked Up"  -> order    "Confirmed"
 *   order    "Pickup"     -> shipment "Picked Up"
 *   order    "Confirmed"  -> shipment "Awaiting Pickup"   <- not "Picked Up"
 *
 * So a round trip from the order side does not return where it started. The
 * original comment in `statusSync.ts` flagged this ("Could arguably be
 * Processing; business chose Confirmed earlier"), so it is a recorded business
 * decision. Preserved exactly, and asserted in the tests so nobody "fixes" it by
 * accident.
 */

// ── Enums ─────────────────────────────────────────────────────────────────

/**
 * Re-exported from `../validators`, which is the single source of truth for every
 * enum in the schema. This file previously declared its own copies of both
 * tuples — a fourth copy of the same tables, introduced by the very commit that
 * existed to remove copies. `validators.ts` imports nothing but `convex/values`,
 * so depending on it does not breach the rule that `lib/` stays testable without
 * `_generated`.
 */
export const shipmentStatuses = shipmentStatus;
export const orderStatuses = orderStatus;

export type ShipmentStatus = (typeof shipmentStatuses)[number];

export type OrderStatus = (typeof orderStatuses)[number];

// ── Shipment -> Order ─────────────────────────────────────────────────────

export const SHIPMENT_TO_ORDER_STATUS: Record<ShipmentStatus, OrderStatus> = {
  "Awaiting Pickup": "Pending",
  "Picked Up": "Confirmed",
  "Out for Delivery": "Processing",
  Delivered: "Delivered",
  "Failed Delivery": "Cancelled",
};

/**
 * Translate a shipment status to the order status that should mirror it.
 *
 * Falls back to `"Pending"` for an unrecognised input, matching the previous
 * behaviour of `shipments.ts` (`statusMap[s] || "Pending"`). The fallback should
 * be unreachable now that the input is typed, but the data predates the type.
 */
export function shipmentStatusToOrderStatus(
  status: ShipmentStatus | string,
): OrderStatus {
  return SHIPMENT_TO_ORDER_STATUS[status as ShipmentStatus] ?? "Pending";
}

// ── Order -> Shipment ─────────────────────────────────────────────────────

/**
 * `null` means "intentionally no shipment analog" — payment-only or terminal
 * order states that must not touch the shipment. A missing key and an explicit
 * `null` are different things, which is why every order status is listed.
 */
export const ORDER_TO_SHIPMENT_STATUS: Record<
  OrderStatus,
  ShipmentStatus | null
> = {
  Pending: "Awaiting Pickup",
  Confirmed: "Awaiting Pickup",
  Processing: "Awaiting Pickup",
  Pickup: "Picked Up",
  Delivery: "Out for Delivery",
  Delivered: "Delivered",
  Cancelled: "Failed Delivery",
  Refunded: "Failed Delivery",
};

export function orderStatusToShipmentStatus(
  status: OrderStatus | string,
): ShipmentStatus | null {
  return ORDER_TO_SHIPMENT_STATUS[status as OrderStatus] ?? null;
}

// ── Progression ───────────────────────────────────────────────────────────

/**
 * The forward shipment progression the rider app walks.
 *
 * `blink-rider/app/(tabs)/deliveries.tsx` reimplements this client-side to drive
 * its "Continue" button. Exporting it through `@repo/backend/validators` lets the
 * app consume one definition instead of copying it.
 *
 * `Failed Delivery` is deliberately absent: it is terminal, and — per the rider
 * design audit — no UI anywhere can currently set it.
 */
const SHIPMENT_PROGRESSION: readonly ShipmentStatus[] = [
  "Awaiting Pickup",
  "Picked Up",
  "Out for Delivery",
  "Delivered",
];

export function nextShipmentStatus(
  current: ShipmentStatus,
): ShipmentStatus | null {
  const i = SHIPMENT_PROGRESSION.indexOf(current);
  if (i === -1 || i === SHIPMENT_PROGRESSION.length - 1) return null;
  return SHIPMENT_PROGRESSION[i + 1] ?? null;
}

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return status === "Delivered" || status === "Failed Delivery";
}
