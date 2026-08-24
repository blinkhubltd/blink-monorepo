/**
 * ============================================================================
 * FIXTURES — not production data.
 * ============================================================================
 *
 * Every screen renders through `lib/data/index.ts`, which currently returns
 * these. They exist so the design can be built and reviewed before the Convex
 * queries are wired, and they use the same view-model types the real mappers
 * will produce — so swapping the source is a change in one file, not fifteen.
 *
 * Values match the approved prototype so a side-by-side against the design is
 * meaningful. Do not import this module from a screen.
 */
import type {
  ActiveWork,
  BoostCampaign,
  Crew,
  CrewNotification,
  DeliveryDetail,
  HomeSummary,
  PickList,
  PrescriptionReview,
  QueueItem,
  Shift,
} from "./types";
import type { CrewRole } from "../roles";

export const FIXTURE_CREW: Record<CrewRole, Crew> = {
  rider: {
    id: "crew_rider_1",
    name: "Kevin Otieno",
    role: "rider",
    hubName: "Westlands hub",
    avatarUrl: null,
    onShiftSince: null,
  },
  picker: {
    id: "crew_picker_1",
    name: "Amina Hassan",
    role: "picker",
    hubName: "Westlands hub",
    avatarUrl: null,
    onShiftSince: null,
  },
};

export const FIXTURE_HOME_SUMMARY: Record<CrewRole, HomeSummary> = {
  rider: {
    primary: { label: "Today", value: "Ksh 1,240", deltaPct: 18 },
    secondary: { label: "Deliveries", value: "6", unit: "today" },
  },
  picker: {
    primary: { label: "Picked today", value: "42", unit: "items" },
    secondary: { label: "Accuracy", value: "99", unit: "%", deltaPct: 1 },
  },
};

export const FIXTURE_ACTIVE_WORK: Record<CrewRole, ActiveWork | null> = {
  rider: {
    reference: "BR-4821",
    addressLine: "MRGV+FJV, Mombasa Road, Nairobi",
    badgeLabel: "ETA 6 min",
    badgeTone: "success",
    progress: null,
    targetId: "BR-4821",
  },
  picker: {
    reference: "BR-4820",
    addressLine: null,
    badgeLabel: "8 items",
    badgeTone: "neutral",
    progress: { done: 3, total: 8 },
    targetId: "BR-4820",
  },
};

export const FIXTURE_BOOST: BoostCampaign = {
  title: "Weekend boost",
  bonusLabel: "Ksh 300 bonus",
  description: "Complete 3 more deliveries by 6pm to unlock the bonus.",
  done: 6,
  target: 9,
};

export const FIXTURE_QUEUE: Record<CrewRole, QueueItem[]> = {
  rider: [
    { id: "BR-4821", reference: "BR-4821", subtitle: "MRGV+FJV, Mombasa Road", status: "In transit", tone: "success" },
    { id: "BR-4825", reference: "BR-4825", subtitle: "Westlands, Nairobi", status: "Assigned", tone: "neutral" },
    { id: "BR-4818", reference: "BR-4818", subtitle: "Kasarani, Nairobi", status: "Delivered", tone: "success" },
    { id: "BR-4812", reference: "BR-4812", subtitle: "Parklands, Nairobi", status: "Delivered", tone: "success" },
  ],
  picker: [
    { id: "BR-4820", reference: "BR-4820", subtitle: "8 items", status: "Picking", tone: "warning" },
    { id: "BR-4823", reference: "BR-4823", subtitle: "5 items", status: "Queued", tone: "neutral" },
    { id: "BR-4825", reference: "BR-4825", subtitle: "12 items", status: "Queued", tone: "neutral" },
    { id: "BR-4819", reference: "BR-4819", subtitle: "4 items", status: "Packed", tone: "success" },
  ],
};

export const FIXTURE_DELIVERY: DeliveryDetail = {
  id: "BR-4821",
  reference: "BR-4821",
  etaMinutes: 6,
  addressLine: "MRGV+FJV, Mombasa Road, Nairobi",
  // Nairobi, not the library default. The reference app rendered route stats
  // computed from a Singapore origin because the fallback was never replaced.
  coordinates: { latitude: -1.3193, longitude: 36.8524 },
  customerName: "Grace Wanjiru",
  customerPhone: "+254 722 456 789",
  itemCount: 3,
  total: 1860,
  note: "Leave at the gate, call on arrival.",
  verified: false,
};

export const FIXTURE_PICKLIST: PickList = {
  id: "BR-4820",
  reference: "BR-4820",
  items: [
    { id: "a", name: "Blue Band margarine 500g", location: "Aisle 3", quantity: 1, requiresPrescription: false, picked: true },
    { id: "b", name: "Amoxicillin 500mg", location: "Pharmacy counter", quantity: 1, requiresPrescription: true, picked: false },
    { id: "c", name: "Sukari sugar 2kg", location: "Aisle 1", quantity: 2, requiresPrescription: false, picked: true },
    { id: "d", name: "Rina cooking oil 1L", location: "Aisle 2", quantity: 1, requiresPrescription: false, picked: true },
    { id: "e", name: "Supa Loaf bread", location: "Bakery", quantity: 3, requiresPrescription: false, picked: false },
  ],
};

export const FIXTURE_PRESCRIPTION: PrescriptionReview = {
  id: "b",
  orderReference: "BR-4820",
  productName: "Amoxicillin 500mg",
  dosageNote: "21 capsules",
  imageUrls: [],
};

export const FIXTURE_SHIFTS: Shift[] = [
  { id: "s1", dayLabel: "Today", timeLabel: "07:00 – 15:00", hubName: "Westlands hub", enabled: true },
  { id: "s2", dayLabel: "Tomorrow", timeLabel: "07:00 – 15:00", hubName: "Westlands hub", enabled: true },
  { id: "s3", dayLabel: "Thursday", timeLabel: "14:00 – 22:00", hubName: "Westlands hub", enabled: false },
];

const HOUR = 60 * 60 * 1000;

/**
 * `now` is a parameter because these are relative timestamps and the grouping
 * into Today / Earlier must be reproducible in a test.
 */
export function fixtureNotifications(now: number): CrewNotification[] {
  return [
    { id: "n1", kind: "assignment", title: "Order #BR-4821 assigned", createdAt: now - 2 * HOUR, read: false },
    { id: "n2", kind: "incentive", title: "Weekend boost unlocked", createdAt: now - 3 * HOUR, read: false },
    { id: "n3", kind: "shift", title: "Shift starts in 1 hour", createdAt: now - 26 * HOUR, read: true },
    { id: "n4", kind: "payout", title: "Payout sent · Ksh 8,420", createdAt: now - 30 * HOUR, read: true },
  ];
}
