import { describe, expect, it } from "vitest";
import {
  ORDER_TO_SHIPMENT_STATUS,
  SHIPMENT_TO_ORDER_STATUS,
  isTerminalShipmentStatus,
  nextShipmentStatus,
  orderStatuses,
  orderStatusToShipmentStatus,
  shipmentStatuses,
  shipmentStatusToOrderStatus,
} from "../convex/lib/status_mapping";

/**
 * The exhaustiveness tests below are the reason this file exists. Two verbatim
 * copies of the shipment->order map had drifted apart across `shipments.ts` and
 * `helpers/statusSync.ts`, with the literals hardcoded again in six other
 * modules. A key-set assertion catches that class of bug; a spot-check does not.
 */

describe("shipment -> order", () => {
  it.each([
    ["Awaiting Pickup", "Pending"],
    ["Picked Up", "Confirmed"],
    ["Out for Delivery", "Processing"],
    ["Delivered", "Delivered"],
    ["Failed Delivery", "Cancelled"],
  ] as const)("%s -> %s", (shipment, order) => {
    expect(shipmentStatusToOrderStatus(shipment)).toBe(order);
  });

  it("covers every shipment status — no gaps", () => {
    expect(Object.keys(SHIPMENT_TO_ORDER_STATUS).sort()).toEqual(
      [...shipmentStatuses].sort(),
    );
  });

  it("only ever produces a valid order status", () => {
    for (const v of Object.values(SHIPMENT_TO_ORDER_STATUS)) {
      expect(orderStatuses).toContain(v);
    }
  });

  it("falls back to Pending for unrecognised input", () => {
    // Preserves the previous `statusMap[s] || "Pending"` behaviour in
    // shipments.ts. Should be unreachable now the input is typed, but the data
    // predates the type.
    expect(shipmentStatusToOrderStatus("Nonsense")).toBe("Pending");
    expect(shipmentStatusToOrderStatus("")).toBe("Pending");
  });
});

describe("order -> shipment", () => {
  it.each([
    ["Pending", "Awaiting Pickup"],
    ["Confirmed", "Awaiting Pickup"],
    ["Processing", "Awaiting Pickup"],
    ["Pickup", "Picked Up"],
    ["Delivery", "Out for Delivery"],
    ["Delivered", "Delivered"],
    ["Cancelled", "Failed Delivery"],
    ["Refunded", "Failed Delivery"],
  ] as const)("%s -> %s", (order, shipment) => {
    expect(orderStatusToShipmentStatus(order)).toBe(shipment);
  });

  it("covers every order status — no gaps", () => {
    expect(Object.keys(ORDER_TO_SHIPMENT_STATUS).sort()).toEqual(
      [...orderStatuses].sort(),
    );
  });

  it("only ever produces a valid shipment status or null", () => {
    for (const v of Object.values(ORDER_TO_SHIPMENT_STATUS)) {
      if (v !== null) expect(shipmentStatuses).toContain(v);
    }
  });

  it("returns null for unrecognised input rather than guessing", () => {
    expect(orderStatusToShipmentStatus("Nonsense")).toBeNull();
  });
});

describe("the asymmetry is intentional", () => {
  // Locked in deliberately. statusSync.ts recorded the decision:
  // "Could arguably be Processing; business chose Confirmed earlier".
  it("shipment Picked Up maps to order Confirmed", () => {
    expect(shipmentStatusToOrderStatus("Picked Up")).toBe("Confirmed");
  });

  it("but order Confirmed maps back to Awaiting Pickup, not Picked Up", () => {
    expect(orderStatusToShipmentStatus("Confirmed")).toBe("Awaiting Pickup");
  });

  it("so the round trip is not the identity", () => {
    const order = shipmentStatusToOrderStatus("Picked Up");
    expect(orderStatusToShipmentStatus(order)).not.toBe("Picked Up");
  });

  it("three order statuses collapse onto Awaiting Pickup", () => {
    const collapsed = orderStatuses.filter(
      (o) => ORDER_TO_SHIPMENT_STATUS[o] === "Awaiting Pickup",
    );
    expect(collapsed).toEqual(["Pending", "Confirmed", "Processing"]);
  });
});

describe("progression", () => {
  it("advances through the rider workflow", () => {
    expect(nextShipmentStatus("Awaiting Pickup")).toBe("Picked Up");
    expect(nextShipmentStatus("Picked Up")).toBe("Out for Delivery");
    expect(nextShipmentStatus("Out for Delivery")).toBe("Delivered");
  });

  it("stops at Delivered", () => {
    expect(nextShipmentStatus("Delivered")).toBeNull();
  });

  it("has no successor for Failed Delivery", () => {
    // Failed Delivery is off the progression entirely. Per the rider design
    // audit, no UI anywhere can currently set it.
    expect(nextShipmentStatus("Failed Delivery")).toBeNull();
  });

  it("identifies terminal states", () => {
    expect(isTerminalShipmentStatus("Delivered")).toBe(true);
    expect(isTerminalShipmentStatus("Failed Delivery")).toBe(true);
    expect(isTerminalShipmentStatus("Awaiting Pickup")).toBe(false);
    expect(isTerminalShipmentStatus("Out for Delivery")).toBe(false);
  });

  it("every non-terminal status has a successor", () => {
    for (const s of shipmentStatuses) {
      if (isTerminalShipmentStatus(s)) continue;
      expect(nextShipmentStatus(s), `no successor for ${s}`).not.toBeNull();
    }
  });
});
