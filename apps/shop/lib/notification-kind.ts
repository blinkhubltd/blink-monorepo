/**
 * How a notification is presented.
 *
 * A typed lookup rather than interpolated class names, for the same reason
 * `order-status.ts` is one: the app this replaces built `bg-${type}-500` strings,
 * which meant an unknown type rendered as an invisible unstyled row and the
 * Tailwind config needed a safelist regex to keep the known ones alive. Here an
 * unhandled type is a compile error, and an unrecognised one at runtime falls
 * back to something legible.
 */

/** The `notificationTypes` union in the backend validators. */
export const NOTIFICATION_TYPES = [
  "order_update",
  "delivery",
  "promotion",
  "system",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationIcon = "package" | "bike" | "tag" | "info";

interface Presentation {
  icon: NotificationIcon;
  /** Badge variant from the design system. */
  tone: "default" | "success" | "warning" | "info" | "secondary";
  /** Short label for the eyebrow. */
  label: string;
}

const PRESENTATION = {
  order_update: { icon: "package", tone: "info", label: "Order" },
  delivery: { icon: "bike", tone: "success", label: "Delivery" },
  promotion: { icon: "tag", tone: "default", label: "Offer" },
  system: { icon: "info", tone: "secondary", label: "Blink" },
} as const satisfies Record<NotificationType, Presentation>;

const FALLBACK: Presentation = {
  icon: "info",
  tone: "secondary",
  label: "Blink",
};

export function presentNotification(type: string): Presentation {
  // `hasOwn`, not a bare index: `PRESENTATION["constructor"]` reaches
  // Object.prototype and returns a truthy function, so `?? FALLBACK` never
  // fires and the caller reads `.label` off a constructor. Server-supplied
  // strings make that unlikely rather than impossible.
  return Object.prototype.hasOwnProperty.call(PRESENTATION, type)
    ? (PRESENTATION as Record<string, Presentation>)[type]!
    : FALLBACK;
}

/**
 * Where tapping a notification goes.
 *
 * The stored `route` is written by the backend and points at the OLD app's paths
 * (`/order-details/<id>`), which do not exist here — following it verbatim would
 * land every order notification on the not-found screen. So the order id is used
 * when present and the stored route is translated, never trusted.
 *
 * Returns null when there is nowhere sensible to go, and the row is then not
 * pressable rather than pressable-and-inert.
 */
export function routeForNotification(input: {
  orderId: string | null;
  route: string | null;
}): string | null {
  if (input.orderId) return `/order/${input.orderId}`;

  const route = input.route;
  if (!route) return null;

  // Translate the paths the backend still writes.
  const orderDetails = /^\/order-details\/([A-Za-z0-9_-]+)$/.exec(route);
  if (orderDetails) return `/order/${orderDetails[1]}`;

  const orderTracking = /^\/order-tracking\/([A-Za-z0-9_-]+)$/.exec(route);
  if (orderTracking) return `/order/${orderTracking[1]}/track`;

  const productDetails = /^\/product-details\/([A-Za-z0-9_-]+)$/.exec(route);
  if (productDetails) return `/product/${productDetails[1]}`;

  // Anything else is only followed if it is a path this app actually serves.
  // A stored route is data, not a command: honouring an arbitrary string would
  // let whatever wrote it choose where the app navigates.
  const ALLOWED = ["/orders", "/cart", "/saved", "/addresses", "/"];
  return ALLOWED.includes(route) ? route : null;
}
