import { describe, expect, it } from "vitest";
import type { Id } from "@repo/backend/dataModel";
import {
  confirmationMode,
  coordinatesOf,
  formatAddress,
  itemLocation,
  notificationKind,
  orderTone,
  pickerStatusLabel,
  shipmentTone,
  sortPickerQueue,
  sortRiderQueue,
  toCrewNotification,
  toDeliveryDetail,
  toPickItem,
  toQueueItem,
} from "../lib/data/map";

/** Branded ids are opaque strings at runtime; tests only need the brand. */
const itemId = (s: string) => s as unknown as Id<"order_items">;

describe("formatAddress", () => {
  it("joins only the parts that are present", () => {
    expect(
      formatAddress({ address_1: "Mombasa Road", city: "Nairobi" }),
    ).toBe("Mombasa Road, Nairobi");
  });

  it("does not emit empty segments when fields are missing", () => {
    // Every field on a shipment address is optional, so a naive template yields
    // strings like ", Nairobi, ,".
    const line = formatAddress({ city: "Nairobi" });
    expect(line).toBe("Nairobi");
    expect(line).not.toContain(", ,");
    expect(line.startsWith(",")).toBe(false);
  });

  it("collapses a duplicate street and address_1", () => {
    expect(
      formatAddress({
        address_1: "Mombasa Road",
        street: "mombasa road",
        city: "Nairobi",
      }),
    ).toBe("Mombasa Road, Nairobi");
  });

  it("ignores whitespace-only fields", () => {
    expect(formatAddress({ address_1: "   ", city: "Nairobi" })).toBe("Nairobi");
  });

  it("says so rather than returning an empty string", () => {
    expect(formatAddress(null)).toBe("No address on this order");
    expect(formatAddress({})).toBe("No address on this order");
  });
});

describe("coordinatesOf", () => {
  it("returns a usable pair", () => {
    expect(coordinatesOf({ lat: -1.3193, lng: 36.8524 })).toEqual({
      latitude: -1.3193,
      longitude: 36.8524,
    });
  });

  it("rejects a partially written address", () => {
    expect(coordinatesOf({ lat: -1.3 })).toBeNull();
    expect(coordinatesOf({ lng: 36.8 })).toBeNull();
    expect(coordinatesOf({})).toBeNull();
    expect(coordinatesOf(null)).toBeNull();
  });

  it("rejects 0,0", () => {
    // Null Island is in the Gulf of Guinea. Treating an unset pair as a location
    // is how the reference app drew routes from the wrong continent.
    expect(coordinatesOf({ lat: 0, lng: 0 })).toBeNull();
  });

  it("rejects out-of-range and non-finite values", () => {
    expect(coordinatesOf({ lat: 91, lng: 36 })).toBeNull();
    expect(coordinatesOf({ lat: -1.3, lng: 181 })).toBeNull();
    expect(coordinatesOf({ lat: NaN, lng: 36 })).toBeNull();
  });
});

describe("confirmationMode", () => {
  it("asks for a code only on a pay_now order", () => {
    // verifyDeliveryCode throws a ConvexError for anything else, which would
    // strand the rider at the door.
    expect(confirmationMode({ payment_mode: "pay_now" })).toBe(
      "delivery_code",
    );
  });

  it("confirms directly for payment on delivery", () => {
    expect(confirmationMode({ payment_mode: "pay_on_delivery" })).toBe(
      "confirm_only",
    );
  });

  it("defaults to confirm-only when the mode is absent", () => {
    // payment_mode is optional on the orders table, and guessing pay_now would
    // demand a code the order does not have.
    expect(confirmationMode({})).toBe("confirm_only");
    expect(confirmationMode(null)).toBe("confirm_only");
  });
});

describe("tones", () => {
  it("maps every shipment status the backend declares", () => {
    for (const status of [
      "Awaiting Pickup",
      "Picked Up",
      "Out for Delivery",
      "Delivered",
      "Failed Delivery",
    ]) {
      expect(["success", "warning", "neutral"]).toContain(
        shipmentTone(status),
      );
    }
  });

  it("falls back to neutral for an unknown status rather than throwing", () => {
    expect(shipmentTone("Teleported")).toBe("neutral");
    expect(orderTone("Teleported")).toBe("neutral");
  });

  it("uses the picker's vocabulary for order statuses", () => {
    expect(pickerStatusLabel("Processing")).toBe("Picking");
    expect(pickerStatusLabel("Pending")).toBe("Queued");
    expect(pickerStatusLabel("Pickup")).toBe("Packed");
    // Unmapped statuses pass through rather than becoming blank.
    expect(pickerStatusLabel("Cancelled")).toBe("Cancelled");
  });
});

describe("sortRiderQueue", () => {
  it("puts live deliveries above completed ones, newest first", () => {
    const sorted = sortRiderQueue([
      { _id: "old-done", status: "Delivered", updated_at: 100 },
      { _id: "new-done", status: "Delivered", updated_at: 300 },
      { _id: "live", status: "Out for Delivery", updated_at: 200 },
    ]);
    expect(sorted.map((d) => d._id)).toEqual(["live", "new-done", "old-done"]);
  });
});

describe("sortPickerQueue", () => {
  it("puts the order being picked first", () => {
    const sorted = sortPickerQueue([
      { _id: "a", reference: "A", order_status: "Pending", updated_at: 300 },
      { _id: "b", reference: "B", order_status: "Processing", updated_at: 100 },
      { _id: "c", reference: "C", order_status: "Confirmed", updated_at: 200 },
    ]);
    expect(sorted.map((o) => o._id)).toEqual(["b", "c", "a"]);
  });
});

describe("toQueueItem", () => {
  it("does not show a shipment id when the order reference is missing", () => {
    const item = toQueueItem({
      _id: "shp_123",
      status: "Delivered",
      updated_at: 1,
    });
    expect(item.reference).toBe("—");
    expect(item.reference).not.toContain("shp_");
  });
});

describe("itemLocation", () => {
  it("does not print the backend's synthetic aisle values", () => {
    // getPickerOrderDetails sets aisle to the literal "A1" or "General" from
    // whether the product has a category. There is no shelf field at all.
    expect(itemLocation({ _id: itemId("1"), quantity: 1, aisle: "A1" })).toBe(
      "In store",
    );
    expect(itemLocation({ _id: itemId("1"), quantity: 1, aisle: "General" })).toBe(
      "In store",
    );
  });

  it("keeps a real aisle if one ever arrives", () => {
    expect(itemLocation({ _id: itemId("1"), quantity: 1, aisle: "Aisle 3" })).toBe(
      "Aisle 3",
    );
  });

  it("sends a prescription item to the counter", () => {
    expect(
      itemLocation({ _id: itemId("1"), quantity: 1, requires_prescription: true }),
    ).toBe("Pharmacy counter");
  });
});

describe("toPickItem", () => {
  it("prefers the joined product name over the snapshot name", () => {
    const item = toPickItem({
      _id: itemId("i1"),
      name: "old snapshot",
      product_name: "Blue Band 500g",
      quantity: 2,
    });
    expect(item.name).toBe("Blue Band 500g");
    expect(item.quantity).toBe(2);
  });

  it("treats absent flags as false, not undefined", () => {
    const item = toPickItem({ _id: itemId("i1"), quantity: 1 });
    expect(item.picked).toBe(false);
    expect(item.requiresPrescription).toBe(false);
    expect(item.scanned).toBe(false);
    expect(item.pickedQuantity).toBe(0);
  });

  it("is not picked until every unit is accounted for", () => {
    // Three loaves is one line item but three picks. Marking it done at the
    // first is what let the old app send short orders out.
    const partial = toPickItem({
      _id: itemId("i1"),
      quantity: 3,
      picked_quantity: 1,
    });
    expect(partial.pickedQuantity).toBe(1);
    expect(partial.picked).toBe(false);

    const full = toPickItem({
      _id: itemId("i1"),
      quantity: 3,
      picked_quantity: 3,
    });
    expect(full.picked).toBe(true);
  });

  it("derives picked from the count, not from is_picked", () => {
    // The two are separate columns and can disagree on an older row. The count
    // is the one a picker can verify against the shelf, so it wins.
    const lying = toPickItem({
      _id: itemId("i1"),
      quantity: 3,
      picked_quantity: 1,
      is_picked: true,
    });
    expect(lying.picked).toBe(false);
  });

  it("falls back to is_picked when no count was ever written", () => {
    // markItemPicked writes both, but rows predating picked_quantity have only
    // the flag. Those should still read as done rather than resetting to zero.
    const legacy = toPickItem({
      _id: itemId("i1"),
      quantity: 2,
      is_picked: true,
    });
    expect(legacy.pickedQuantity).toBe(2);
    expect(legacy.picked).toBe(true);
  });

  it("clamps a count above the order quantity", () => {
    // A progress bar reading 4 of 3 is worse than one reading 3 of 3.
    const over = toPickItem({
      _id: itemId("i1"),
      quantity: 3,
      picked_quantity: 7,
    });
    expect(over.pickedQuantity).toBe(3);
    expect(over.picked).toBe(true);
  });

  it("clamps a negative count", () => {
    const under = toPickItem({
      _id: itemId("i1"),
      quantity: 3,
      picked_quantity: -2,
    });
    expect(under.pickedQuantity).toBe(0);
    expect(under.picked).toBe(false);
  });

  it("does not report a zero-quantity item as picked", () => {
    // Nothing to take is not the same as taken, and reading it as done would
    // let an order complete with a line nobody looked at.
    const zero = toPickItem({ _id: itemId("i1"), quantity: 0 });
    expect(zero.picked).toBe(false);
  });

  it("reports a barcode-confirmed item as scanned", () => {
    const scanned = toPickItem({
      _id: itemId("i1"),
      quantity: 1,
      picked_quantity: 1,
      barcodeVerified: true,
    });
    expect(scanned.scanned).toBe(true);
  });
});

describe("toDeliveryDetail", () => {
  it("never invents an ETA", () => {
    // No backend query returns one, and a fabricated ETA is worse than none.
    const detail = toDeliveryDetail({ _id: "s1", status: "Picked Up" });
    expect(detail.etaMinutes).toBeNull();
  });

  it("falls back to a generic label rather than an empty name", () => {
    const detail = toDeliveryDetail({
      _id: "s1",
      status: "Picked Up",
      customer: { first_name: "  ", last_name: "" },
    });
    expect(detail.customerName).toBe("Customer");
  });

  it("joins a partial customer name", () => {
    const detail = toDeliveryDetail({
      _id: "s1",
      status: "Picked Up",
      customer: { first_name: "Grace" },
    });
    expect(detail.customerName).toBe("Grace");
  });
});

describe("notificationKind", () => {
  it("recovers the design's categories from four backend types", () => {
    expect(
      notificationKind({ type: "system", title: "Payout sent · Ksh 8,420" }),
    ).toBe("payout");
    expect(
      notificationKind({ type: "system", title: "Shift starts in 1 hour" }),
    ).toBe("shift");
    expect(
      notificationKind({ type: "promotion", title: "Weekend boost unlocked" }),
    ).toBe("incentive");
    expect(
      notificationKind({ type: "delivery", title: "Order #BR-4821 assigned" }),
    ).toBe("assignment");
  });
});

describe("toCrewNotification", () => {
  it("reads the read flag from the status enum, not a boolean", () => {
    expect(
      toCrewNotification({
        _id: "n1",
        type: "delivery",
        status: "read",
        title: "Order assigned",
        created_at: 5,
      }).read,
    ).toBe(true);
    expect(
      toCrewNotification({
        _id: "n2",
        type: "delivery",
        status: "unread",
        title: "Order assigned",
        created_at: 5,
      }).read,
    ).toBe(false);
  });
});
