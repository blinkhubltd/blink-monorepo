import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  NOTIFICATION_TYPES,
  presentNotification,
  routeForNotification,
} from "../lib/notification-kind";

describe("presentNotification", () => {
  it("covers every type the backend can write", () => {
    for (const type of NOTIFICATION_TYPES) {
      const presentation = presentNotification(type);
      expect(presentation.label.length).toBeGreaterThan(0);
    }
  });

  it("falls back legibly on an unknown type", () => {
    // Interpolated class names gave the old app an invisible unstyled row here,
    // which is why its Tailwind config carried a safelist regex.
    const presentation = presentNotification("something_new");
    expect(presentation.label).toBe("Blink");
    expect(presentation.icon).toBe("info");
  });

  it("is not fooled by inherited object keys", () => {
    expect(presentNotification("constructor").label).toBe("Blink");
    expect(presentNotification("toString").label).toBe("Blink");
  });
});

describe("the type list matches the backend union", () => {
  const validators = readFileSync(
    join(__dirname, "..", "..", "..", "packages", "backend", "convex", "validators.ts"),
    "utf8",
  );

  const backend = (() => {
    const match = /export const notificationTypes = \[([\s\S]*?)\] as const;/.exec(
      validators,
    );
    expect(match, "notificationTypes not found in validators.ts").not.toBeNull();
    return [...match![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  })();

  it("has no type the backend cannot produce", () => {
    // A presentation for a type that does not exist is dead code that reads as
    // coverage.
    expect([...NOTIFICATION_TYPES].sort()).toEqual([...backend].sort());
  });
});

describe("routeForNotification", () => {
  it("prefers the order id over the stored route", () => {
    expect(
      routeForNotification({ orderId: "j57abc", route: "/order-details/j57abc" }),
    ).toBe("/order/j57abc");
  });

  it("translates the old app's paths, which do not exist here", () => {
    // Followed verbatim, every order notification landed on not-found.
    expect(
      routeForNotification({ orderId: null, route: "/order-details/j9" }),
    ).toBe("/order/j9");
    expect(
      routeForNotification({ orderId: null, route: "/order-tracking/j9" }),
    ).toBe("/order/j9/track");
    expect(
      routeForNotification({ orderId: null, route: "/product-details/p1" }),
    ).toBe("/product/p1");
  });

  it("allows a short list of plain destinations", () => {
    expect(routeForNotification({ orderId: null, route: "/orders" })).toBe(
      "/orders",
    );
    expect(routeForNotification({ orderId: null, route: "/cart" })).toBe(
      "/cart",
    );
  });

  it("refuses anything else, because a stored route is data", () => {
    // Whatever writes the notification would otherwise choose where the app
    // navigates.
    for (const route of [
      "/admin",
      "https://evil.example/steal",
      "/order-details/../../secret",
      "/checkout",
      "javascript:alert(1)",
      "",
    ]) {
      expect(
        routeForNotification({ orderId: null, route }),
        route,
      ).toBeNull();
    }
  });

  it("returns null when there is nothing to open", () => {
    expect(routeForNotification({ orderId: null, route: null })).toBeNull();
  });
});
