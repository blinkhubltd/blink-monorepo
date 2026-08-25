/**
 * Backend documents -> view models.
 *
 * Every function here is pure and takes plain objects, so the awkward parts of
 * the data model are tested rather than discovered on a rider's phone. The
 * structural mismatches these functions absorb are called out at each site.
 */
import type { Id } from "@repo/backend/dataModel";
import type {
  CrewNotification,
  CrewNotificationKind,
  DeliveryDetail,
  PickItem,
  QueueItem,
  QueueTone,
} from "./types";

// ---------------------------------------------------------------------------
// Status -> tone
// ---------------------------------------------------------------------------

/**
 * Shipment statuses, exactly as `shipmentStatus` declares them in the backend
 * validators. Typed as a total record so adding a status to the backend without
 * giving it a tone here becomes a compile error rather than an unstyled chip.
 */
export type ShipmentStatus =
  | "Awaiting Pickup"
  | "Picked Up"
  | "Out for Delivery"
  | "Delivered"
  | "Failed Delivery";

const SHIPMENT_TONE: Record<ShipmentStatus, QueueTone> = {
  "Awaiting Pickup": "neutral",
  "Picked Up": "warning",
  "Out for Delivery": "success",
  Delivered: "success",
  "Failed Delivery": "neutral",
};

export type OrderStatus =
  | "Pending"
  | "Confirmed"
  | "Processing"
  | "Pickup"
  | "Delivery"
  | "Delivered"
  | "Cancelled";

const ORDER_TONE: Record<OrderStatus, QueueTone> = {
  Pending: "neutral",
  Confirmed: "neutral",
  Processing: "warning",
  Pickup: "success",
  Delivery: "success",
  Delivered: "success",
  Cancelled: "neutral",
};

export function shipmentTone(status: string): QueueTone {
  return SHIPMENT_TONE[status as ShipmentStatus] ?? "neutral";
}

export function orderTone(status: string): QueueTone {
  return ORDER_TONE[status as OrderStatus] ?? "neutral";
}

/** The picker's own vocabulary for an order status, per the design. */
const PICKER_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  Pending: "Queued",
  Confirmed: "Queued",
  Processing: "Picking",
  Pickup: "Packed",
};

export function pickerStatusLabel(status: string): string {
  return PICKER_STATUS_LABEL[status as OrderStatus] ?? status;
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export interface AddressDoc {
  address_1?: string;
  address_2?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

/**
 * Joins whichever address parts are present into one line.
 *
 * Every field on the shipment address is optional, so a naive template produces
 * strings like ", Nairobi, ,". Empty and whitespace-only parts are dropped and
 * duplicates collapsed, since `street` and `address_1` frequently hold the same
 * value.
 */
export function formatAddress(address: AddressDoc | null | undefined): string {
  if (!address) return "No address on this order";
  const parts = [
    address.address_1,
    address.address_2,
    address.street,
    address.city,
    address.state,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);

  const seen = new Set<string>();
  const unique = parts.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.length > 0 ? unique.join(", ") : "No address on this order";
}

/**
 * Coordinates, only when both are usable numbers.
 *
 * `lat`/`lng` are optional floats and 0/0 is in the Gulf of Guinea, not Nairobi
 * — treating a partially-written address as a location is how the reference app
 * ended up drawing routes from the wrong continent.
 */
export function coordinatesOf(
  address: AddressDoc | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!address) return null;
  const { lat, lng } = address;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

// ---------------------------------------------------------------------------
// Rider queue
// ---------------------------------------------------------------------------

export interface RiderDeliveryDoc {
  _id: string;
  status: string;
  updated_at: number;
  delivery_address?: AddressDoc;
  order_ref?: string;
  customer_name?: string;
  payment_method?: string;
  is_clearance?: boolean;
}

export function toQueueItem(doc: RiderDeliveryDoc): QueueItem {
  return {
    id: doc._id,
    // `order_ref` is the order's human reference and is optional on the join;
    // the shipment id is never shown to a rider as a fallback.
    reference: doc.order_ref ?? "—",
    subtitle: formatAddress(doc.delivery_address),
    status: doc.status,
    tone: shipmentTone(doc.status),
  };
}

/**
 * A rider's queue, newest first, with completed work after live work.
 *
 * `listRiderDeliveries` returns every shipment ever assigned in index order, so
 * without this a rider opening the app sees months-old deliveries above today's.
 */
const LIVE_STATUSES = new Set<string>([
  "Awaiting Pickup",
  "Picked Up",
  "Out for Delivery",
]);

export function sortRiderQueue(docs: RiderDeliveryDoc[]): RiderDeliveryDoc[] {
  return [...docs].sort((a, b) => {
    const aLive = LIVE_STATUSES.has(a.status) ? 0 : 1;
    const bLive = LIVE_STATUSES.has(b.status) ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    return b.updated_at - a.updated_at;
  });
}

// ---------------------------------------------------------------------------
// Picker queue
// ---------------------------------------------------------------------------

export interface PickerOrderDoc {
  _id: string;
  reference: string;
  order_status: string;
  updated_at?: number;
  _creationTime?: number;
  items?: unknown[];
  total_items?: number;
}

export function toPickerQueueItem(doc: PickerOrderDoc): QueueItem {
  const count = doc.total_items ?? doc.items?.length ?? 0;
  return {
    id: doc._id,
    reference: doc.reference,
    subtitle: `${count} ${count === 1 ? "item" : "items"}`,
    status: pickerStatusLabel(doc.order_status),
    tone: orderTone(doc.order_status),
  };
}

/** Being picked first, then queued, then done. */
const PICKER_STATUS_RANK: Record<string, number> = {
  Processing: 0,
  Confirmed: 1,
  Pending: 2,
};

export function sortPickerQueue(docs: PickerOrderDoc[]): PickerOrderDoc[] {
  return [...docs].sort((a, b) => {
    const ra = PICKER_STATUS_RANK[a.order_status] ?? 9;
    const rb = PICKER_STATUS_RANK[b.order_status] ?? 9;
    if (ra !== rb) return ra - rb;
    return (b.updated_at ?? b._creationTime ?? 0) - (a.updated_at ?? a._creationTime ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Delivery detail
// ---------------------------------------------------------------------------

export interface ShipmentDetailDoc {
  _id: string;
  status: string;
  delivery_address?: AddressDoc;
  order?: {
    _id: string;
    reference: string;
    payment_mode?: string;
    payment_method?: string;
    payment_status?: string;
    total_amount?: number;
    delivery_code_verified?: boolean;
    special_instructions?: string;
  } | null;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  } | null;
  itemCount?: number;
}

export function toDeliveryDetail(doc: ShipmentDetailDoc): DeliveryDetail {
  const customerName = [doc.customer?.first_name, doc.customer?.last_name]
    .filter((p) => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .trim();

  return {
    id: doc._id,
    reference: doc.order?.reference ?? "—",
    // No backend query returns an ETA. Rendering a fabricated one is worse than
    // rendering none, so this stays null until there is a real source.
    etaMinutes: null,
    addressLine: formatAddress(doc.delivery_address),
    coordinates: coordinatesOf(doc.delivery_address),
    customerName: customerName.length > 0 ? customerName : "Customer",
    customerPhone: doc.customer?.phone ?? null,
    itemCount: doc.itemCount ?? 0,
    total: doc.order?.total_amount ?? 0,
    // `orders.notes` does not exist — the field is `special_instructions`, so
    // this read `undefined` and the customer's delivery instruction never
    // appeared on the screen that exists to show it.
    note: doc.order?.special_instructions ?? null,
    verified: doc.order?.delivery_code_verified === true,
  };
}

/**
 * Which confirmation path a delivery takes.
 *
 * `orders.verifyDeliveryCode` throws a ConvexError unless
 * `payment_mode === "pay_now"`, so a pay-on-delivery order can only be
 * completed through `tracking.confirmDelivery`. Calling the wrong one is a
 * hard failure in the rider's hands, so the choice is made explicitly here
 * rather than inline at the button.
 */
export type ConfirmationMode = "delivery_code" | "confirm_only";

export function confirmationMode(
  order: { payment_mode?: string } | null | undefined,
): ConfirmationMode {
  return order?.payment_mode === "pay_now" ? "delivery_code" : "confirm_only";
}

// ---------------------------------------------------------------------------
// Pick list
// ---------------------------------------------------------------------------

export interface OrderItemDoc {
  _id: Id<"order_items">;
  name?: string;
  product_name?: string;
  quantity: number;
  is_picked?: boolean;
  picked_quantity?: number;
  barcodeVerified?: boolean;
  requires_prescription?: boolean;
  aisle?: string;
  unit_type?: string;
  unit_value?: number;
}

/**
 * `getPickerOrderDetails` synthesises `aisle` as the literal "A1" or "General"
 * from whether the product has a category — there is no shelf-location field on
 * products at all. Rather than print a fake aisle number, an unknown location
 * reads as "Pharmacy counter" for a prescription item (which is true — that is
 * where it is dispensed) and "In store" otherwise.
 */
export function itemLocation(doc: OrderItemDoc): string {
  if (doc.requires_prescription) return "Pharmacy counter";
  const aisle = doc.aisle?.trim();
  if (!aisle || aisle === "A1" || aisle === "General") return "In store";
  return aisle;
}

export function toPickItem(doc: OrderItemDoc): PickItem {
  const quantity = Math.max(0, doc.quantity);
  // Clamped against quantity rather than trusted: is_picked and picked_quantity
  // are separate columns and markItemPicked writes both, so a legacy row can
  // carry a count above the order quantity. A progress bar reading 4 of 3 is
  // worse than one that reads 3 of 3.
  const raw = doc.picked_quantity ?? (doc.is_picked === true ? quantity : 0);
  const pickedQuantity = Math.max(0, Math.min(quantity, raw));
  return {
    id: doc._id,
    name: doc.product_name ?? doc.name ?? "Item",
    location: itemLocation(doc),
    quantity,
    pickedQuantity,
    requiresPrescription: doc.requires_prescription === true,
    // Derived from the count, not read from is_picked. Those two can disagree on
    // an older row, and the count is the one a picker can verify on the shelf.
    picked: quantity > 0 && pickedQuantity >= quantity,
    scanned: doc.barcodeVerified === true,
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * The backend has four notification types (`order_update`, `delivery`,
 * `promotion`, `system`) while the design distinguishes assignment, incentive,
 * shift and payout. The extra distinction lives in the title, so it is recovered
 * from there — explicitly and in one place, rather than with an inline regex at
 * the render site.
 */
export function notificationKind(doc: {
  type: string;
  title: string;
}): CrewNotificationKind {
  const title = doc.title.toLowerCase();
  if (/payout|payment sent|paid/.test(title)) return "payout";
  if (/shift|schedule/.test(title)) return "shift";
  if (/bonus|boost|incentive|target/.test(title)) return "incentive";
  if (doc.type === "promotion") return "incentive";
  if (doc.type === "delivery" || doc.type === "order_update") {
    return "assignment";
  }
  return "shift";
}

export interface NotificationDoc {
  _id: string;
  type: string;
  status: string;
  title: string;
  created_at: number;
}

export function toCrewNotification(doc: NotificationDoc): CrewNotification {
  return {
    id: doc._id,
    kind: notificationKind(doc),
    title: doc.title,
    createdAt: doc.created_at,
    read: doc.status === "read",
  };
}
