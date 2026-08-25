import { describe, expect, it } from "vitest";
import {
  FALLBACK_ROUTE,
  resolveNotificationTarget,
} from "../lib/notification-route";

const ORDER = "k17abc9xyz0000000000000000";
const SHIPMENT = "k57def1uvw0000000000000000";

describe("resolveNotificationTarget", () => {
  it("maps the old picker tab group onto this app's single one", () => {
    // The backend stores "/(picker-tabs)/orders" — written by the previous app,
    // which had two tab groups. Following it here lands on +not-found.
    expect(
      resolveNotificationTarget({ route: "/(picker-tabs)/orders" }, "picker"),
    ).toEqual({ route: "/(tabs)/deliveries" });
  });

  it("passes through a route this app still has", () => {
    expect(
      resolveNotificationTarget({ route: "/(tabs)/deliveries" }, "rider"),
    ).toEqual({ route: "/(tabs)/deliveries" });
  });

  it("prefers the specific record over the stored tab", () => {
    // A rider tapping "Order #BR-4821 assigned" wants that delivery, not a list.
    expect(
      resolveNotificationTarget(
        { route: "/(tabs)/deliveries", shipmentId: SHIPMENT },
        "rider",
      ),
    ).toEqual({ route: "/delivery/[id]", params: { id: SHIPMENT } });
  });

  it("sends a picker to the pick list for the same notification shape", () => {
    expect(
      resolveNotificationTarget(
        { route: "/(picker-tabs)/orders", orderId: ORDER },
        "picker",
      ),
    ).toEqual({ route: "/picklist/[id]", params: { id: ORDER } });
  });

  it("does not send a rider to a pick list, or a picker to a delivery", () => {
    // Both ids can be present on one notification. Role decides which is
    // actionable — a rider has no business on a pick list.
    const both = { orderId: ORDER, shipmentId: SHIPMENT };
    expect(resolveNotificationTarget(both, "rider").route).toBe(
      "/delivery/[id]",
    );
    expect(resolveNotificationTarget(both, "picker").route).toBe(
      "/picklist/[id]",
    );
  });

  it("refuses customer-app routes", () => {
    // "/orders" and "/clearance" are in the notifications table because the
    // customer app writes there too. A crew member has no such screen.
    for (const route of ["/orders", "/clearance", "/cart"]) {
      expect(resolveNotificationTarget({ route }, "rider")).toEqual({
        route: FALLBACK_ROUTE,
      });
    }
  });

  it("refuses a route it does not know", () => {
    // `data` is v.any() on the notifications table, so an arbitrary string can
    // reach here. Navigating to an unvetted path is how a notification becomes a
    // way to drive the app somewhere it should not go.
    expect(
      resolveNotificationTarget({ route: "/../admin/secrets" }, "rider"),
    ).toEqual({ route: FALLBACK_ROUTE });
    expect(
      resolveNotificationTarget({ route: "https://evil.example" }, "rider"),
    ).toEqual({ route: FALLBACK_ROUTE });
  });

  it("rejects an id carrying path characters", () => {
    // An id field is interpolated into a route, so a traversal attempt there has
    // to be refused rather than passed to the router.
    expect(
      resolveNotificationTarget({ shipmentId: "../../admin" }, "rider"),
    ).toEqual({ route: FALLBACK_ROUTE });
    expect(
      resolveNotificationTarget({ shipmentId: "abc/def" }, "rider"),
    ).toEqual({ route: FALLBACK_ROUTE });
  });

  it("rejects an absurdly long id", () => {
    expect(
      resolveNotificationTarget({ shipmentId: "a".repeat(200) }, "rider"),
    ).toEqual({ route: FALLBACK_ROUTE });
  });

  it("ignores a non-string id or route", () => {
    expect(resolveNotificationTarget({ shipmentId: 42 }, "rider")).toEqual({
      route: FALLBACK_ROUTE,
    });
    expect(resolveNotificationTarget({ route: 42 }, "rider")).toEqual({
      route: FALLBACK_ROUTE,
    });
  });

  it("falls back for a payload with nothing usable", () => {
    // Real cases: an older notification written before `route` existed, or a
    // push delivered with an empty data bag.
    expect(resolveNotificationTarget({}, "rider")).toEqual({
      route: FALLBACK_ROUTE,
    });
    expect(resolveNotificationTarget(null, "rider")).toEqual({
      route: FALLBACK_ROUTE,
    });
    expect(resolveNotificationTarget(undefined, "rider")).toEqual({
      route: FALLBACK_ROUTE,
    });
    expect(resolveNotificationTarget("nonsense", "rider")).toEqual({
      route: FALLBACK_ROUTE,
    });
  });

  it("never returns a route the app cannot navigate to", () => {
    // The fallback is a real screen, not a tab group root that might not resolve.
    expect(FALLBACK_ROUTE).toBe("/notifications");
  });
});
