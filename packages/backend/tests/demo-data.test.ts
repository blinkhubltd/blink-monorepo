import { describe, expect, it } from "vitest";
import {
  buildDemoPlan,
  categories,
  customers,
  makeRng,
  products,
  summarisePlan,
  vendors,
} from "../convex/lib/demo_data";
import { resolvePeriod, dayKey } from "../convex/lib/time_range";
import { leafCategoryKeys } from "../convex/lib/demo_data";
import {
  assertCategoryPlacement,
  breadcrumbOf,
  depthOf,
  indexById,
  productPlacementError,
} from "../convex/lib/category_tree";

/**
 * What a demo dataset has to prove.
 *
 * The failure mode is not a crash. It is a dashboard that looks full and
 * demonstrates nothing: every order Delivered so the pipeline bar is one block,
 * nothing in the previous period so every delta reads "No prior period", every
 * product sold so "not selling" is zero, every customer new so the returning
 * split is 100%/0%.
 *
 * Each of those reads as plausible on screen, which is exactly why they need
 * asserting rather than eyeballing. These tests describe the dataset in terms of
 * the widgets that consume it.
 */

// A fixed instant, so the assertions do not drift with the clock. Mid-month
// deliberately: on the 1st, "this month" has almost nothing in it and several
// assertions below would be testing the calendar rather than the dataset.
const NOW = new Date("2026-08-18T14:30:00+03:00").getTime();

const plan = buildDemoPlan({ now: NOW });

describe("buildDemoPlan", () => {
  it("produces a substantial number of orders", () => {
    expect(plan.orders.length).toBeGreaterThan(150);
  });

  it("stays inside the per-mutation write budget", () => {
    // The seeder refuses above 6000. If the generator ever grows past that, this
    // fails here rather than halfway through a mutation on someone's deployment.
    expect(summarisePlan(plan).totalWrites).toBeLessThan(6000);
  });

  it("never places an order in the future", () => {
    for (const order of plan.orders) {
      expect(order.orderDate).toBeLessThanOrEqual(NOW);
    }
  });

  it("is deterministic for a given seed and now", () => {
    const again = buildDemoPlan({ now: NOW });
    expect(again.orders.length).toBe(plan.orders.length);
    expect(again.orders[0]?.reference).toBe(plan.orders[0]?.reference);
    expect(again.orders.at(-1)?.total).toBe(plan.orders.at(-1)?.total);
  });

  it("changes with the seed", () => {
    // Otherwise "deterministic" could be satisfied by ignoring the seed
    // entirely, and the previous test would pass on a constant dataset.
    const other = buildDemoPlan({ now: NOW, seed: 999 });
    const same = other.orders.length === plan.orders.length;
    const sameFirst = other.orders[0]?.total === plan.orders[0]?.total;
    expect(same && sameFirst).toBe(false);
  });

  it("gives references that are unique", () => {
    const refs = plan.orders.map((o) => o.reference);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe("what the KPI comparisons need", () => {
  it("has orders in this month AND last month", () => {
    // Without both, every StatCard falls back to "No prior period to compare"
    // and the whole point of the delta is invisible.
    const thisMonth = resolvePeriod("thisMonth", NOW);
    const lastMonth = resolvePeriod("lastMonth", NOW);

    const inWindow = (start: number, end: number) =>
      plan.orders.filter((o) => o.orderDate >= start && o.orderDate <= end)
        .length;

    expect(inWindow(thisMonth.start, thisMonth.end)).toBeGreaterThan(10);
    expect(inWindow(lastMonth.start, lastMonth.end)).toBeGreaterThan(10);
  });

  it("has orders in the window before this month, so this month has a delta", () => {
    const thisMonth = resolvePeriod("thisMonth", NOW);
    expect(thisMonth.previous).not.toBeNull();
    const previous = thisMonth.previous!;
    const count = plan.orders.filter(
      (o) => o.orderDate >= previous.start && o.orderDate <= previous.end,
    ).length;
    expect(count).toBeGreaterThan(10);
  });

  it("has orders in this week and today's week-to-date", () => {
    for (const range of ["thisWeek", "lastWeek"] as const) {
      const period = resolvePeriod(range, NOW);
      const count = plan.orders.filter(
        (o) => o.orderDate >= period.start && o.orderDate <= period.end,
      ).length;
      expect(count, `${range} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("spans enough distinct days to draw a trend", () => {
    // A one-point trend renders the "one day of data" fallback instead of a
    // chart, which is correct behaviour but not what a demo should show.
    const days = new Set(plan.orders.map((o) => dayKey(o.orderDate)));
    expect(days.size).toBeGreaterThan(60);
  });

  it("trends upward, so the deltas are not noise", () => {
    const sorted = [...plan.orders].sort((a, b) => a.orderDate - b.orderDate);
    const half = Math.floor(sorted.length / 2);
    const early = sorted.slice(0, half).reduce((s, o) => s + o.total, 0);
    const late = sorted.slice(half).reduce((s, o) => s + o.total, 0);
    expect(late).toBeGreaterThan(early);
  });
});

describe("what the status widgets need", () => {
  it("spreads across at least five order statuses", () => {
    const statuses = new Set(plan.orders.map((o) => o.orderStatus));
    expect(statuses.size).toBeGreaterThanOrEqual(5);
  });

  it("is mostly delivered but not entirely", () => {
    const delivered = plan.orders.filter(
      (o) => o.orderStatus === "Delivered",
    ).length;
    const share = delivered / plan.orders.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.9);
  });

  it("has open orders, so the operations tiles are non-zero", () => {
    const open = plan.orders.filter(
      (o) => o.orderStatus !== "Delivered" && o.orderStatus !== "Cancelled",
    ).length;
    expect(open).toBeGreaterThan(5);
  });

  it("has some orders awaiting a picker, and most with one", () => {
    // The awaiting-picker callout only renders when the count is non-zero, so a
    // dataset where every order has a picker hides that widget entirely.
    const awaiting = plan.orders.filter(
      (o) =>
        o.pickerIndex === null &&
        (o.orderStatus === "Pending" || o.orderStatus === "Confirmed"),
    ).length;
    expect(awaiting).toBeGreaterThan(0);

    const assigned = plan.orders.filter((o) => o.pickerIndex !== null).length;
    expect(assigned / plan.orders.length).toBeGreaterThan(0.7);
  });

  it("has unpaid and cancelled orders", () => {
    expect(plan.orders.some((o) => o.paymentStatus === "Unpaid")).toBe(true);
    expect(plan.orders.some((o) => o.orderStatus === "Cancelled")).toBe(true);
  });

  it("uses at least four payment methods", () => {
    const methods = new Set(plan.orders.map((o) => o.paymentMethod));
    expect(methods.size).toBeGreaterThanOrEqual(4);
  });
});

describe("payment state is consistent with the lifecycle", () => {
  it("never marks a cancelled order as paid", () => {
    // A dashboard reader who spots one paid cancelled order stops trusting every
    // other figure on the screen, and rightly so.
    const wrong = plan.orders.filter(
      (o) => o.orderStatus === "Cancelled" && o.paymentStatus === "Paid",
    );
    expect(wrong).toEqual([]);
  });

  it("marks every refunded order's payment as refunded", () => {
    const wrong = plan.orders.filter(
      (o) => o.orderStatus === "Refunded" && o.paymentStatus !== "Refunded",
    );
    expect(wrong).toEqual([]);
  });

  it("never leaves a delivered pay-on-delivery order unpaid", () => {
    const wrong = plan.orders.filter(
      (o) =>
        o.paymentMode === "pay_on_delivery" &&
        o.orderStatus === "Delivered" &&
        o.paymentStatus !== "Paid",
    );
    expect(wrong).toEqual([]);
  });

  it("writes a payment row for exactly the paid orders", () => {
    for (const order of plan.orders) {
      expect(order.paid).toBe(order.paymentStatus === "Paid");
    }
  });

  it("uses pay_on_delivery only for Cash on Delivery", () => {
    const wrong = plan.orders.filter(
      (o) =>
        (o.paymentMode === "pay_on_delivery") !==
        (o.paymentMethod === "Cash on Delivery"),
    );
    expect(wrong).toEqual([]);
  });
});

describe("what the shipments page needs", () => {
  const shipments = plan.orders
    .map((o) => o.shipment)
    .filter((s): s is NonNullable<typeof s> => s !== null);

  it("has shipments in more than one state", () => {
    expect(new Set(shipments.map((s) => s.status)).size).toBeGreaterThanOrEqual(3);
  });

  it("has some failed deliveries, so the success rate is under 100%", () => {
    const failed = shipments.filter((s) => s.status === "Failed Delivery");
    expect(failed.length).toBeGreaterThan(0);
    // And not so many that the hub looks broken.
    expect(failed.length / shipments.length).toBeLessThan(0.2);
  });

  it("has in-flight shipments, so the rate is not simply delivered/total", () => {
    // This is the dataset half of the success-rate fix: if nothing were ever
    // in flight, dividing by all shipments and dividing by finished ones would
    // give the same answer and the bug would be invisible.
    const inFlight = shipments.filter(
      (s) =>
        s.status === "Awaiting Pickup" ||
        s.status === "Picked Up" ||
        s.status === "Out for Delivery",
    );
    expect(inFlight.length).toBeGreaterThan(0);
  });

  it("never delivers before it was created", () => {
    for (const shipment of shipments) {
      expect(shipment.updatedAt).toBeGreaterThan(shipment.createdAt);
    }
  });

  it("has a skewed transit distribution, so a median differs from a mean", () => {
    const finished = shipments.filter(
      (s) => s.status === "Delivered" || s.status === "Failed Delivery",
    );
    const durations = finished
      .map((s) => s.updatedAt - s.createdAt)
      .sort((a, b) => a - b);
    expect(durations.length).toBeGreaterThan(20);

    const median = durations[Math.floor(durations.length / 2)]!;
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    // The long tail must actually pull the mean clear of the median, or the
    // "we report a median" claim on the card is untested by this data.
    expect(mean).toBeGreaterThan(median * 1.2);
  });

  it("leaves a few orders without a shipment", () => {
    // So the shipments page's "orders with no shipment" integrity figure has
    // something in it.
    const shipped = plan.orders.filter(
      (o) =>
        o.orderStatus === "Delivered" ||
        o.orderStatus === "Delivery" ||
        o.orderStatus === "Pickup" ||
        o.orderStatus === "Refunded",
    );
    const without = shipped.filter((o) => o.shipment === null);
    expect(without.length).toBeGreaterThan(0);
    expect(without.length / shipped.length).toBeLessThan(0.1);
  });

  it("spreads work across every rider", () => {
    const perRider = new Map<number, number>();
    for (const s of shipments) {
      perRider.set(s.riderIndex, (perRider.get(s.riderIndex) ?? 0) + 1);
    }
    expect(perRider.size).toBe(5);
  });
});

describe("what the products page needs", () => {
  it("leaves some in-stock products unsold, so 'not selling' is non-zero", () => {
    const soldIndexes = new Set(
      plan.orders.flatMap((o) => o.items.map((i) => i.productIndex)),
    );
    const idle = products.filter(
      (p, index) => p.quantity > 0 && !soldIndexes.has(index),
    );
    expect(idle.length).toBeGreaterThan(0);
  });

  it("has low-stock and out-of-stock products", () => {
    expect(products.some((p) => p.quantity > 0 && p.quantity < 10)).toBe(true);
    expect(products.some((p) => p.quantity === 0)).toBe(true);
  });

  it("never sells a product marked popularity 0", () => {
    const soldIndexes = new Set(
      plan.orders.flatMap((o) => o.items.map((i) => i.productIndex)),
    );
    for (const [index, product] of products.entries()) {
      if (product.popularity === 0) {
        expect(soldIndexes.has(index), `${product.name} should not sell`).toBe(
          false,
        );
      }
    }
  });

  it("spans a wide price range, so basket bands and unit/revenue disagree", () => {
    const prices = products.map((p) => p.price);
    expect(Math.min(...prices)).toBeLessThan(200);
    expect(Math.max(...prices)).toBeGreaterThan(20000);
  });

  it("only ever puts a vendor's own products in that vendor's order", () => {
    // The vendor-scoped queries read order_items through orders, so a
    // cross-vendor item would make a scoped total disagree with the unscoped one
    // and look like a scoping bug.
    for (const order of plan.orders) {
      for (const item of order.items) {
        expect(products[item.productIndex]!.vendorKey).toBe(order.vendorKey);
      }
    }
  });

  it("gives every product a real category and vendor", () => {
    const categoryKeys = new Set(categories.map((c) => c.key));
    const vendorKeys = new Set(vendors.map((v) => v.key));
    for (const product of products) {
      expect(categoryKeys.has(product.categoryKey)).toBe(true);
      expect(vendorKeys.has(product.vendorKey)).toBe(true);
    }
  });

  it("keeps each product's category in its vendor's industry", () => {
    // Otherwise the industries page double-counts: a product's revenue reaches
    // the industry through the vendor, while its category claims another.
    const industryOfCategory = new Map(
      categories.map((c) => [c.key, c.industryKey]),
    );
    const industryOfVendor = new Map(vendors.map((v) => [v.key, v.industryKey]));
    for (const product of products) {
      expect(industryOfCategory.get(product.categoryKey)).toBe(
        industryOfVendor.get(product.vendorKey),
      );
    }
  });
});

describe("what the customers page needs", () => {
  it("has repeat customers, so the returning split is not 100% new", () => {
    const counts = new Map<number, number>();
    for (const order of plan.orders) {
      counts.set(
        order.customerIndex,
        (counts.get(order.customerIndex) ?? 0) + 1,
      );
    }
    const repeat = [...counts.values()].filter((n) => n > 1).length;
    expect(repeat).toBeGreaterThan(5);
  });

  it("has an uneven spend distribution, so the top-customers table ranks", () => {
    const spend = new Map<number, number>();
    for (const order of plan.orders) {
      if (!order.paid) continue;
      spend.set(
        order.customerIndex,
        (spend.get(order.customerIndex) ?? 0) + order.total,
      );
    }
    const totals = [...spend.values()].sort((a, b) => b - a);
    expect(totals.length).toBeGreaterThan(8);
    // The top spender should be clearly ahead of the median, or the table is a
    // flat list and its ordering says nothing.
    const median = totals[Math.floor(totals.length / 2)]!;
    expect(totals[0]!).toBeGreaterThan(median * 1.5);
  });

  it("uses every customer at least once", () => {
    const used = new Set(plan.orders.map((o) => o.customerIndex));
    expect(used.size).toBe(customers.length);
  });
});

describe("money adds up", () => {
  it("computes the total from its parts on every order", () => {
    for (const order of plan.orders) {
      expect(order.total).toBe(
        order.subtotal + order.tax - order.discount + order.deliveryFee,
      );
    }
  });

  it("matches the subtotal to the sum of its items", () => {
    for (const order of plan.orders) {
      const sum = order.items.reduce(
        (total, item) =>
          total + products[item.productIndex]!.price * item.quantity,
        0,
      );
      expect(order.subtotal).toBe(sum);
    }
  });

  it("waives delivery above the threshold and charges below it", () => {
    for (const order of plan.orders) {
      expect(order.deliveryFee).toBe(order.subtotal >= 2000 ? 0 : 150);
    }
  });

  it("has baskets on both sides of the free-delivery threshold", () => {
    // Otherwise the delivery-fee logic above is only exercised in one direction
    // and the basket bands collapse into one bar.
    expect(plan.orders.some((o) => o.subtotal < 2000)).toBe(true);
    expect(plan.orders.some((o) => o.subtotal >= 2000)).toBe(true);
  });

  it("never writes an order with no items", () => {
    for (const order of plan.orders) {
      expect(order.items.length).toBeGreaterThan(0);
    }
  });
});

describe("makeRng", () => {
  it("is reproducible and reasonably uniform", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const first = Array.from({ length: 5 }, () => a());
    const second = Array.from({ length: 5 }, () => b());
    expect(first).toEqual(second);

    const rng = makeRng(7);
    const samples = Array.from({ length: 4000 }, () => rng());
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
    const mean = samples.reduce((x, y) => x + y, 0) / samples.length;
    // Loose bound: this is checking the generator is not obviously broken, not
    // that it passes a statistical battery.
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe("holds up on any date", () => {
  // NOW above is mid-month on purpose, which is the friendly case. These
  // invariants must not depend on where in the calendar the seed happens — a
  // demo seeded on the 1st, or across a year boundary, must still be coherent.
  const dates = [
    "2026-01-01T09:00:00+03:00", // year boundary, first of the month
    "2026-02-28T23:30:00+03:00", // end of a short month, late evening
    "2026-03-01T00:30:00+03:00", // just past midnight
    "2026-06-30T12:00:00+03:00",
    "2026-12-31T21:00:00+03:00", // late evening, year end
  ];

  for (const iso of dates) {
    const at = new Date(iso).getTime();
    const p = buildDemoPlan({ now: at });

    it(`is coherent when seeded at ${iso}`, () => {
      expect(p.orders.length).toBeGreaterThan(100);

      for (const order of p.orders) {
        // Never in the future, however the local time falls.
        expect(order.orderDate).toBeLessThanOrEqual(at);
        // Money still reconciles.
        expect(order.total).toBe(
          order.subtotal + order.tax - order.discount + order.deliveryFee,
        );
        expect(order.items.length).toBeGreaterThan(0);
        // And the lifecycle stays consistent.
        if (order.orderStatus === "Cancelled") {
          expect(order.paymentStatus).not.toBe("Paid");
        }
      }

      // Statuses still spread, and a shipment still exists.
      expect(new Set(p.orders.map((o) => o.orderStatus)).size).toBeGreaterThanOrEqual(5);
      expect(p.orders.some((o) => o.shipment !== null)).toBe(true);
    });
  }
});

describe("the category tree is three levels, and products sit on the third", () => {
  // Validated with the SAME functions the mutations use, not a reimplementation
  // — otherwise the seed could satisfy a local idea of the rule and still be
  // rejected by createProduct on a real deployment.
  const nodes = categories.map((c) => ({
    _id: c.key,
    name: c.name,
    parent_category_id: c.parentKey,
  }));
  const byId = indexById(nodes);

  it("has all three levels populated", () => {
    const depths = new Set(nodes.map((n) => depthOf(byId, n._id)));
    expect([...depths].sort()).toEqual([1, 2, 3]);
  });

  it("agrees with its own declared depth on every category", () => {
    // `depth` is redundant with `parentKey` on purpose — it is the readable
    // half, and this is what stops the two drifting when the tree is edited.
    for (const spec of categories) {
      expect(depthOf(byId, spec.key), `${spec.name} declared depth`).toBe(
        spec.depth,
      );
    }
  });

  it("resolves every declared parent key", () => {
    const keys = new Set(categories.map((c) => c.key));
    for (const spec of categories) {
      if (spec.parentKey) {
        expect(keys.has(spec.parentKey), `${spec.name} -> ${spec.parentKey}`).toBe(
          true,
        );
      }
    }
  });

  it("passes the real placement rule for every category", () => {
    for (const spec of categories) {
      expect(() =>
        assertCategoryPlacement(nodes, spec.parentKey, spec.key),
      ).not.toThrow();
    }
  });

  it("puts every product on a level-3 category", () => {
    // The requirement itself: Supermarkets › Groceries › Bread & Bakery ›
    // product. A product on level 1 or 2 saves fine but is unreachable from the
    // customer app's deepest drill-down.
    for (const product of products) {
      expect(
        productPlacementError(nodes, product.categoryKey),
        `${product.name} -> ${product.categoryKey}`,
      ).toBeNull();
    }
  });

  it("derives leafCategoryKeys as exactly the level-3 categories", () => {
    const expected = nodes
      .filter((n) => depthOf(byId, n._id) === 3)
      .map((n) => n._id)
      .sort();
    expect([...leafCategoryKeys].sort()).toEqual(expected);
  });

  it("gives every level-3 category at least one product", () => {
    // An empty aisle in a demo is a screen with nothing on it. Every leaf being
    // populated is what makes the customer app's drill-down worth clicking
    // through.
    const used = new Set(products.map((p) => p.categoryKey));
    for (const key of leafCategoryKeys) {
      expect(used.has(key), `${key} has no products`).toBe(true);
    }
  });

  it("keeps a category in the same industry as its parent", () => {
    // The industries dashboard reaches a product's industry through its VENDOR,
    // while the category tree carries its own industryKey. If a child sat in a
    // different industry from its parent the two would disagree and the same
    // revenue would appear under two industries.
    const byKey = new Map(categories.map((c) => [c.key, c]));
    for (const spec of categories) {
      if (!spec.parentKey) continue;
      expect(
        byKey.get(spec.parentKey)?.industryKey,
        `${spec.name} vs its parent`,
      ).toBe(spec.industryKey);
    }
  });

  it("builds the breadcrumb the requirement describes", () => {
    // Named explicitly so the example in the request is a test, not a comment.
    expect(breadcrumbOf(byId, "bakery")).toBe(
      "Supermarkets › Groceries › Bread & Bakery",
    );
  });
});
