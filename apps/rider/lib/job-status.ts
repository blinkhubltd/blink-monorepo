/**
 * How a shipment's status reads to a rider, and where it sits on the track.
 *
 * The backend's statuses are system states ("Awaiting Pickup", "Out for
 * Delivery"). The design speaks the rider's language — "Awaiting pickup",
 * "On the way" — and draws a four-step track: Assigned, At hub, On the way,
 * Delivered. Both live here, typed as total records over the backend's own
 * status list, so a status added to the backend without wording here is a
 * compile error rather than a blank pill.
 */

export type ShipmentStatus =
  | "Awaiting Pickup"
  | "Picked Up"
  | "Out for Delivery"
  | "Delivered"
  | "Failed Delivery";

/**
 * The pill's colour role. A typed lookup maps these onto classes in the
 * component, the same way the shop's order pills do.
 */
export type JobTone = "ink" | "neutral" | "brand" | "success" | "danger";

const STATUS: Record<ShipmentStatus, { label: string; tone: JobTone }> = {
  // Ink and gold: the one that needs the rider, now.
  "Awaiting Pickup": { label: "Awaiting pickup", tone: "ink" },
  "Picked Up": { label: "Picked up", tone: "neutral" },
  "Out for Delivery": { label: "On the way", tone: "brand" },
  Delivered: { label: "Delivered", tone: "success" },
  "Failed Delivery": { label: "Failed", tone: "danger" },
};

export function jobStatus(status: string): { label: string; tone: JobTone } {
  return (
    STATUS[status as ShipmentStatus] ?? { label: status, tone: "neutral" }
  );
}

export type StepState = "done" | "now" | "todo";

export const JOB_STEPS = ["Assigned", "At hub", "On the way", "Delivered"] as const;

/**
 * The track, from the shipment status.
 *
 * "Assigned" is always done — a shipment only exists once it has been. A
 * failed delivery stops the track where the ride was, rather than pretending
 * it reached the door.
 */
export function jobSteps(status: string): StepState[] {
  switch (status as ShipmentStatus) {
    case "Awaiting Pickup":
      return ["done", "now", "todo", "todo"];
    case "Picked Up":
      return ["done", "done", "now", "todo"];
    case "Out for Delivery":
      return ["done", "done", "now", "todo"];
    case "Delivered":
      return ["done", "done", "done", "done"];
    case "Failed Delivery":
      return ["done", "done", "done", "todo"];
    default:
      return ["done", "now", "todo", "todo"];
  }
}

/** True once the rider has set off — the ride screen is where they belong. */
export function isOnTheWay(status: string): boolean {
  return status === "Out for Delivery";
}

/** True while the rider can still start the ride. */
export function canStartRide(status: string): boolean {
  return status === "Awaiting Pickup" || status === "Picked Up";
}
