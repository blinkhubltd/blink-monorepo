/**
 * Address rules, pure and tested.
 *
 * ── Why the label carries so much weight ─────────────────────────────────
 *
 * An address book is stored as ONE document per customer holding an array, and
 * within it the `label` is the identity: the server replaces a same-labelled
 * entry rather than adding a second, and retirement matches on it. Placed orders
 * carry the label too, so the model is kept rather than corrected.
 *
 * The consequence for the UI is that saving "Home" when a "Home" exists is a
 * REPLACEMENT, and it has to say so. The old app's modal said "Save", added
 * silently, and the customer's actual home address was gone with no
 * confirmation and no undo.
 */

export interface AddressLines {
  address_1?: string;
  address_2?: string;
  city?: string;
  country?: string;
}

export interface Point {
  lat: number;
  lng: number;
}

/** The default country. Kenya-only for now, and stated once. */
export const DEFAULT_COUNTRY = "Kenya";

/**
 * Labels offered as chips. Free text is still allowed — a customer with two
 * jobs needs to say so — but three taps covers almost everyone.
 */
export const SUGGESTED_LABELS = ["Home", "Work", "Other"] as const;

/**
 * Mirrors `normaliseLabel` in `data/addresses.ts`.
 *
 * Duplicated deliberately rather than shared: the server's copy is the one that
 * enforces, and it must keep enforcing if this one is ever bypassed. This copy
 * exists so the screen can tell the customer they are about to REPLACE before
 * they commit, which needs the same normalisation the server will apply — "Home "
 * and "Home" must be recognised as the same entry here too, or the warning
 * silently fails to appear in exactly the case it matters.
 */
export function normaliseLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

export type LabelProblem = "empty" | "too-long";

export function labelProblem(label: string): LabelProblem | null {
  const normalised = normaliseLabel(label);
  if (!normalised) return "empty";
  if (normalised.length > 40) return "too-long";
  return null;
}

export function describeLabelProblem(problem: LabelProblem): string {
  return problem === "empty"
    ? "Give this address a name, like Home."
    : "That name is too long — 40 characters at most.";
}

/**
 * Does saving under this label overwrite an existing address?
 *
 * Case-insensitive, because "home" and "Home" are the same place to a person
 * while being two entries to the server — so the customer would get two rows
 * that look identical in a list and behave differently at checkout. Warning on
 * a case difference is the honest reading of their intent.
 */
export function replacementFor(
  label: string,
  existing: readonly { label: string }[],
): string | null {
  const target = normaliseLabel(label).toLowerCase();
  if (!target) return null;
  return (
    existing.find((a) => normaliseLabel(a.label).toLowerCase() === target)
      ?.label ?? null
  );
}

/**
 * Is a coordinate usable?
 *
 * `0, 0` is in the Atlantic and is what an uninitialised state variable looks
 * like, so it is rejected as a location rather than accepted as one — the old
 * app's map defaulted to the library's origin in Singapore, and every distance
 * computed from it was wrong while looking entirely plausible.
 */
export function isUsablePoint(point: Point | null): point is Point {
  if (!point) return false;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Trim to undefined, so an empty box is absent rather than an empty string. */
export function cleanLines(lines: AddressLines): AddressLines {
  const clean = (value: string | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  return {
    address_1: clean(lines.address_1),
    address_2: clean(lines.address_2),
    city: clean(lines.city),
    country: clean(lines.country),
  };
}

/**
 * Everything standing between this form and a saved address.
 *
 * Returned as a list of sentences the screen prints, the same pattern checkout
 * uses. The old modal had a disabled Save button with no explanation of what was
 * missing.
 */
export function addressBlockers(input: {
  label: string;
  point: Point | null;
  /** Null while coverage is still being checked. */
  covered: boolean | null;
}): string[] {
  const blockers: string[] = [];

  const problem = labelProblem(input.label);
  if (problem) blockers.push(describeLabelProblem(problem));

  if (!isUsablePoint(input.point)) {
    blockers.push("Pick the spot on the map, or use your current location.");
  } else if (input.covered === false) {
    // Stated before the save is attempted. The server enforces the same rule,
    // but discovering it only on submit means filling the whole form first.
    blockers.push("No shop delivers to this spot yet. Try somewhere closer.");
  }

  return blockers;
}

/** One line of address, for a list row. */
export function summariseAddress(lines: AddressLines | undefined): string {
  const parts = [lines?.address_1, lines?.address_2, lines?.city].filter(
    (part): part is string => !!part && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : "No street details";
}

/** Coordinates as a person can read them, for confirming a pin. */
export function formatPoint(point: Point | null): string {
  if (!isUsablePoint(point)) return "Not set";
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}
