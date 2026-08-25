/**
 * View models for the crew app.
 *
 * These are the shapes the screens render. They are intentionally NOT the raw
 * Convex documents: a screen should not care that `orders.payment_status` is
 * Title-case while `transactions.status` is lowercase, or that the delivery
 * address lives across four optional fields. The mapping from documents to
 * these types is the only place that has to change when the backend does.
 */
import type { Id } from "@repo/backend/dataModel";
import type { CrewRole } from "../roles";

export interface Crew {
  id: string;
  name: string;
  role: CrewRole;
  hubName: string;
  avatarUrl: string | null;
  /** Set when the crew member is clocked in. */
  onShiftSince: number | null;
}

export type QueueTone = "success" | "warning" | "neutral";

/** A row in the Deliveries (rider) / Orders (picker) queue. */
export interface QueueItem {
  id: string;
  /** Human order reference, e.g. "BR-4821". */
  reference: string;
  subtitle: string;
  status: string;
  tone: QueueTone;
}

export interface DeliveryDetail {
  id: string;
  reference: string;
  etaMinutes: number | null;
  addressLine: string;
  coordinates: { latitude: number; longitude: number } | null;
  customerName: string;
  customerPhone: string | null;
  itemCount: number;
  total: number;
  note: string | null;
  /** True once the customer's code has been verified. */
  verified: boolean;
}

export interface PickItem {
  /**
   * Typed as a real document id, not a string: this value is passed straight
   * back to markItemPicked and to the prescription lookup, and casting it at
   * each call site is how the wrong id ends up in a mutation.
   */
  id: Id<"order_items">;
  name: string;
  /** Shelf location, e.g. "Aisle 3" or "Pharmacy counter". */
  location: string;
  /** Units the customer ordered. */
  quantity: number;
  /** Units taken off the shelf so far, 0..quantity. */
  pickedQuantity: number;
  /** Needs a prescription check before it can be picked. */
  requiresPrescription: boolean;
  /** True only once every unit is accounted for. */
  picked: boolean;
  /** Barcode-confirmed at least once, rather than counted by hand. */
  scanned: boolean;
}

/**
 * The result of one barcode read, as the scanner needs to present it.
 *
 * Deliberately not the raw mutation return: the failure cases are ConvexErrors
 * whose messages are written for a developer, and the picker needs to know which
 * of three things went wrong — wrong order, already complete, or unknown code.
 */
export interface ScanOutcome {
  ok: boolean;
  /** Item name on success, or the reason it was rejected. */
  message: string;
  /** Units of that item now picked, when known. */
  picked?: number;
  total?: number;
  orderComplete?: boolean;
}

export interface PickList {
  id: string;
  reference: string;
  items: PickItem[];
}

export interface PrescriptionReview {
  id: string;
  orderReference: string;
  productName: string;
  dosageNote: string;
  /** Uploaded prescription images, in upload order. */
  imageUrls: string[];
}

export interface Shift {
  id: string;
  dayLabel: string;
  timeLabel: string;
  hubName: string;
  enabled: boolean;
}

export type CrewNotificationKind =
  | "assignment"
  | "incentive"
  | "shift"
  | "payout";

export interface CrewNotification {
  id: string;
  kind: CrewNotificationKind;
  title: string;
  /** Epoch ms; grouping into Today / Earlier is the screen's job. */
  createdAt: number;
  read: boolean;
}

export interface HomeSummary {
  /** Rider: earnings today. Picker: items picked today. */
  primary: { label: string; value: string; unit?: string; deltaPct?: number };
  secondary: { label: string; value: string; unit?: string; deltaPct?: number };
}

export interface ActiveWork {
  reference: string;
  /** Rider: destination address. Picker: null. */
  addressLine: string | null;
  /** Rider: "ETA 6 min". Picker: "8 items". */
  badgeLabel: string;
  badgeTone: QueueTone;
  /** Picker only: pick progress. */
  progress: { done: number; total: number } | null;
  targetId: string;
}

export interface BoostCampaign {
  title: string;
  bonusLabel: string;
  description: string;
  done: number;
  target: number;
}
