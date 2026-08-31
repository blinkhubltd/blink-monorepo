/**
 * How an order's status is presented to a customer.
 *
 * ── Why a typed lookup rather than an interpolated class ─────────────────
 *
 * The app this replaces built class names by interpolation — `bg-${status}-500`
 * — which is why its Tailwind config carried a safelist regex covering every
 * colour-scale combination. Those are unsafe by construction: a status the map
 * does not know yields an invisibly unstyled badge, and no test catches it.
 *
 * `satisfies Record<OrderStatus, …>` makes a missing status a TYPE error, which
 * is what lets the safelist go.
 */

export type OrderStatus =
  | "Pending"
  | "Confirmed"
  | "Processing"
  | "Pickup"
  | "Delivery"
  | "Delivered"
  | "Cancelled"
  | "Refunded";

export interface StatusPresentation {
  label: string;
  /** What it means for the customer, in their terms rather than the system's. */
  helper: string;
  variant: "secondary" | "success" | "warning" | "destructive" | "info";
  /** Position on the progress track, or null when the order left the track. */
  step: number | null;
}

/** The happy path, in order. Cancelled and Refunded sit outside it. */
export const ORDER_JOURNEY: OrderStatus[] = [
  "Confirmed",
  "Processing",
  "Pickup",
  "Delivery",
  "Delivered",
];

export const ORDER_STATUS: Record<OrderStatus, StatusPresentation> = {
  Pending: {
    label: "Awaiting payment",
    helper: "We are waiting for your payment to clear.",
    variant: "warning",
    step: 0,
  },
  Confirmed: {
    label: "Confirmed",
    helper: "The shop has your order and will start picking it shortly.",
    variant: "info",
    step: 1,
  },
  Processing: {
    label: "Being picked",
    helper: "Someone is collecting your items from the shelves.",
    variant: "info",
    step: 2,
  },
  Pickup: {
    label: "Ready for a rider",
    helper: "Your order is packed and waiting to be collected.",
    variant: "info",
    step: 3,
  },
  Delivery: {
    label: "On the way",
    helper: "A rider has your order and is heading to you.",
    variant: "info",
    step: 4,
  },
  Delivered: {
    label: "Delivered",
    helper: "Your order arrived. Thanks for shopping with Blink.",
    variant: "success",
    step: 5,
  },
  Cancelled: {
    label: "Cancelled",
    helper: "This order was cancelled and will not be delivered.",
    variant: "destructive",
    step: null,
  },
  Refunded: {
    label: "Refunded",
    helper: "This order was refunded.",
    variant: "secondary",
    step: null,
  },
} satisfies Record<OrderStatus, StatusPresentation>;

/**
 * Present a status that may not be one we know.
 *
 * The status comes from the database, so a value added server-side before this
 * map is updated is a real possibility. Falling back to the raw string is
 * honest; guessing a colour for it is not.
 */
export function presentStatus(status: string): StatusPresentation {
  // `hasOwn`, not a bare index: indexing an object literal with
  // "constructor" reaches Object.prototype and returns a truthy function, so
  // the `??` fallback never fires and the badge renders `undefined`.
  if (Object.prototype.hasOwnProperty.call(ORDER_STATUS, status)) {
    return ORDER_STATUS[status as OrderStatus]!;
  }
  return {
    label: status,
    helper: "",
    variant: "secondary" as const,
    step: null,
  };
}

/** Whether this order is still expected to arrive. */
export function isLive(status: string): boolean {
  return !["Delivered", "Cancelled", "Refunded"].includes(status);
}
