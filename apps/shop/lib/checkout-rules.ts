/**
 * Checkout business rules, as pure functions.
 *
 * Extracted rather than inlined because a rule buried in a 1,448-line component
 * does not survive a rewrite — which is exactly what happened to the screen this
 * replaces, where the receiver rule, the phone gate and the prescription state
 * machine all shared one scope with the Paystack lifecycle.
 */

/** Beyond this, the order is presumed to be for someone else. */
export const RECEIVER_DISTANCE_THRESHOLD_METRES = 150;

/**
 * Typical GPS error at the accuracy the app requests.
 *
 * The old screen used `Accuracy.Balanced` — roughly 100m of error — against a
 * 150m threshold, and never looked at the reported accuracy. So a customer
 * standing at their own door could be told they were 140m away. Surfaced here
 * so the UI can say "we are not sure" rather than asserting a distance it
 * cannot support.
 */
export const GPS_UNCERTAINTY_METRES = 100;

export type ReceiverRequirement =
  /** Device location unknown — the rule cannot be evaluated. */
  | { kind: "unknown"; distanceMetres: null; required: boolean }
  /** Comfortably at the delivery address. */
  | { kind: "at_address"; distanceMetres: number; required: false }
  /** Far enough that receiver details are required. */
  | { kind: "away"; distanceMetres: number; required: true }
  /** Within GPS error of the threshold — too close to call. */
  | { kind: "uncertain"; distanceMetres: number; required: boolean };

/**
 * Whether receiver details are required.
 *
 * ── The old rule failed open, twice ──────────────────────────────────────
 *
 * `if (distanceFromDevice === null) return false;` meant that a denied
 * permission, a GPS timeout, or an emulator with no fix silently switched the
 * rule off and let the order through with no receiver contact. And a reading
 * near the threshold was treated as exact despite ~100m of error.
 *
 * Both are now explicit outcomes. `unknown` still does not *require* the fields
 * — blocking checkout because a phone could not get a fix would be worse — but
 * the caller can see it is unknown and ask anyway, rather than the question
 * silently disappearing.
 */
export function receiverRequirement(
  distanceMetres: number | null,
): ReceiverRequirement {
  if (distanceMetres === null || !Number.isFinite(distanceMetres)) {
    return { kind: "unknown", distanceMetres: null, required: false };
  }

  const margin = Math.abs(distanceMetres - RECEIVER_DISTANCE_THRESHOLD_METRES);
  if (margin <= GPS_UNCERTAINTY_METRES) {
    // Too close to call. Required, because asking for a contact the customer
    // may not need is a smaller harm than a parcel nobody can hand over.
    return { kind: "uncertain", distanceMetres, required: true };
  }

  return distanceMetres > RECEIVER_DISTANCE_THRESHOLD_METRES
    ? { kind: "away", distanceMetres, required: true }
    : { kind: "at_address", distanceMetres, required: false };
}

/** Kenyan mobile numbers, plus international. Matches the old screen's rule. */
const PHONE_PATTERN = /^\+?\d{7,15}$/;

export interface ReceiverErrors {
  name?: string;
  phone?: string;
}

export function validateReceiver(
  name: string,
  phone: string,
  required: boolean,
): ReceiverErrors {
  const errors: ReceiverErrors = {};
  if (!required) return errors;

  if (!name.trim()) errors.name = "Receiver name is required";

  const cleaned = phone.replace(/[\s-]/g, "");
  if (!cleaned) errors.phone = "Receiver phone is required";
  else if (!PHONE_PATTERN.test(cleaned)) {
    errors.phone = "Enter a valid phone number (7–15 digits)";
  }

  return errors;
}

/** Equirectangular approximation. Accurate well within GPS error at these ranges. */
export function distanceMetres(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
): number | null {
  if (!a || !b) return null;
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return null;

  const latRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos(latRad);
  return Math.hypot(dLat, dLng);
}

/**
 * Whether the order can be placed.
 *
 * Collected in one place so the button's disabled state and the reason shown to
 * the customer cannot disagree — the old screen had five separate conditions
 * across two buttons and displayed none of them.
 */
export function checkoutBlockers(input: {
  hasQuote: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  receiverErrors: ReceiverErrors;
  prescriptionStatus:
    "none" | "missing" | "pending" | "rejected" | "approved" | "loading";
}): string[] {
  const blockers: string[] = [];

  if (!input.hasQuote) blockers.push("Your basket is empty");
  if (!input.hasAddress) blockers.push("Choose a delivery address");
  if (!input.hasPhone) blockers.push("Add a phone number we can reach you on");
  if (Object.keys(input.receiverErrors).length > 0) {
    blockers.push("Add the receiver's name and phone");
  }
  // `pending` deliberately does NOT block: the order can be placed and held for
  // dispatch. Blocking would mean a customer waiting on a pharmacist cannot
  // check out at all, and the server refuses dispatch anyway.
  if (input.prescriptionStatus === "missing") {
    blockers.push("Upload a prescription for the items that need one");
  }
  if (input.prescriptionStatus === "rejected") {
    blockers.push("Your prescription was not accepted — upload another");
  }

  return blockers;
}
