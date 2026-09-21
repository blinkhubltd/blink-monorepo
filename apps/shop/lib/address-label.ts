import { isUsablePoint, type Point } from "./address";

/**
 * The precedence behind the header's address text, pulled out as a pure
 * function so it is directly testable. `useAddressLabel` wires real
 * Convex/Clerk/location state into it — none of which a unit test can
 * construct cheaply, and none of which this logic actually needs.
 *
 * A saved default address beats a live GPS fix: a customer who set one did so
 * on purpose, and a GPS reading a block away from their actual door shouldn't
 * override that on every app open. It shows as the name the customer gave it
 * ("Home", "Work") rather than the street line underneath — that name is
 * what they recognise at a glance; the street is what the rider needs, and
 * is still shown wherever the address is looked at in full (the picker, the
 * "Delivering to" card). Below the saved address, a reverse-geocoded street
 * address beats the raw point — coordinates are correct but unreadable, and
 * this is the one place in the app they were still shown directly.
 */

export type AddressLabelState = "loading" | "denied" | "resolved" | "empty";

export function pickAddressLabel(input: {
  defaultAddressLabel: string | null;
  geocoded: string | null;
  denied: boolean;
  loading: boolean;
  point: Point | null;
}): { label: string; state: AddressLabelState } {
  if (input.defaultAddressLabel) {
    return { label: input.defaultAddressLabel, state: "resolved" };
  }
  if (input.geocoded) {
    return { label: input.geocoded, state: "resolved" };
  }
  if (input.denied) {
    return { label: "Set your location", state: "denied" };
  }
  if (input.loading) {
    return { label: "Finding you…", state: "loading" };
  }
  if (isUsablePoint(input.point)) {
    return {
      label: `${input.point.lat.toFixed(3)}, ${input.point.lng.toFixed(3)}`,
      state: "loading",
    };
  }
  return { label: "Set your location", state: "empty" };
}
