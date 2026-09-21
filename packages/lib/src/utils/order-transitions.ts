/**
 * Which order-status changes a person may make by hand.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 *
 * An order moves along one track, one step at a time:
 *
 *   Pending → Confirmed → Processing → Pickup → Delivery → Delivered
 *
 * Skipping is refused. Marking a Confirmed order Delivered used to be one click
 * in the admin, and it silently skipped everything the steps in between stand
 * for: no picker assigned, no rider dispatched, no delivery code read at the
 * door, stock never moved through its reservation — and a customer told their
 * parcel had arrived when nobody had collected it.
 *
 * ── Deliberate allowances ────────────────────────────────────────────────
 *
 *   - One step back, to undo a mis-click, while the order is still moving.
 *     Delivered is not undone this way: once the parcel is with the customer
 *     the honest correction is a refund, not pretending it is still on a bike.
 *   - Cancelled from anywhere before Delivered. An order can fail at any stage.
 *   - Refunded from Delivered or Cancelled only — money is returned for an
 *     order that ended, not one still in flight (cancel it first).
 *   - Cancelled and Refunded are terminal apart from Cancelled → Refunded.
 *
 * ── Who this binds ───────────────────────────────────────────────────────
 *
 * Manual changes: the admin's single and bulk status updates. System writers
 * that encode a real operational event — a verified delivery code, a picker
 * handing straight to a rider — are not held to it, because the event itself is
 * the evidence. See the call sites in `packages/backend/convex/data/orders.ts`.
 *
 * Shared by the backend, which enforces it, and the admin, which uses it only
 * to grey out options the server would refuse anyway.
 */

export const ORDER_TRACK = [
  "Pending",
  "Confirmed",
  "Processing",
  "Pickup",
  "Delivery",
  "Delivered",
] as const;

export type OrderTrackStatus = (typeof ORDER_TRACK)[number];
export type OrderLifecycleStatus = OrderTrackStatus | "Cancelled" | "Refunded";

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

function trackIndex(status: string): number {
  return (ORDER_TRACK as readonly string[]).indexOf(status);
}

export function checkOrderTransition(
  from: string,
  to: string,
): TransitionCheck {
  if (from === to) {
    return { ok: false, reason: `The order is already ${to}.` };
  }

  if (from === "Refunded") {
    return { ok: false, reason: "A refunded order cannot be changed." };
  }

  if (from === "Cancelled") {
    return to === "Refunded"
      ? { ok: true }
      : {
          ok: false,
          reason: "A cancelled order can only be refunded.",
        };
  }

  if (to === "Refunded") {
    return from === "Delivered"
      ? { ok: true }
      : {
          ok: false,
          reason:
            "Only a delivered or cancelled order can be refunded. Cancel it first.",
        };
  }

  if (to === "Cancelled") {
    return from === "Delivered"
      ? {
          ok: false,
          reason: "A delivered order cannot be cancelled. Refund it instead.",
        }
      : { ok: true };
  }

  const fromIndex = trackIndex(from);
  const toIndex = trackIndex(to);
  if (fromIndex === -1 || toIndex === -1) {
    return { ok: false, reason: `Unknown status change: ${from} → ${to}.` };
  }

  if (from === "Delivered") {
    return {
      ok: false,
      reason: "A delivered order cannot be moved back. Refund it instead.",
    };
  }

  if (toIndex === fromIndex + 1 || toIndex === fromIndex - 1) {
    return { ok: true };
  }

  if (toIndex > fromIndex) {
    const next = ORDER_TRACK[fromIndex + 1];
    return {
      ok: false,
      reason: `Orders move one step at a time. From ${from}, the next step is ${next}.`,
    };
  }

  return {
    ok: false,
    reason: `An order can only be moved back one step. From ${from}, that is ${ORDER_TRACK[fromIndex - 1]}.`,
  };
}

export function canTransitionOrder(from: string, to: string): boolean {
  return checkOrderTransition(from, to).ok;
}
