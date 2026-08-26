import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUser } from "../auth.helpers";
import {
  dayKey,
  dayKeysInPeriod,
  resolvePeriod,
  timeRanges,
  type Period,
} from "../lib/time_range";

/**
 * Insights for the operations dashboard, scoped to what the caller may see.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 *
 * `data/insights.ts` takes the vendor scope as a CLIENT ARGUMENT and
 * authenticates nobody — `grep -c getAuthUser data/insights.ts` returns 0. Two
 * consequences:
 *
 *  1. Most of its queries have no vendor parameter at all, so a vendor manager
 *     calling `getTotalBlinkRevenue`, `getRevenueByCategory`,
 *     `getOrderStatusDistribution` or `getRiderPerformance` sees the WHOLE
 *     platform. The existing insights page does exactly that today.
 *
 *  2. Where a `vendorId` argument does exist it is advisory. Nothing stops a
 *     vendor manager passing a competitor's id.
 *
 * So scope here is never accepted from the client. It is derived from the
 * caller's own `manager_details.vendor_id`, server-side, on every query. A
 * business owner (no manager assignment) sees the platform; a vendor manager
 * sees exactly their vendors and cannot ask for anything else.
 *
 * ── Read volume ──────────────────────────────────────────────────────────
 *
 * Every read is bounded by the period, through `orders.by_order_date` — or by
 * `orders.by_vendor_order_date` when scoped, so a vendor manager's query touches
 * only their own rows. insights.ts does unindexed full-table scans (the plan
 * counted 33) and Convex's 16k-document read limit is a hard throw rather than a
 * slowdown, so bounding matters: this is the page every user opens.
 */

const TimeRange = v.union(...timeRanges.map((t) => v.literal(t)));

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

interface Scope {
  /** Null means the whole platform. */
  vendorIds: Id<"vendors">[] | null;
  restricted: boolean;
}

/**
 * What this caller is allowed to see.
 *
 * A non-empty `manager_details.vendor_id` is what makes someone a vendor
 * manager — the same signal the existing pages use, but read here once instead
 * of being re-derived in every page. That duplication is a security problem, not
 * just repetition: a new page that forgets it shows a vendor manager everything.
 */
async function resolveScope(ctx: QueryCtx): Promise<Scope> {
  const { user } = await getAuthUser(ctx);
  const doc = await ctx.db.get(user._id);
  const assigned = doc?.manager_details?.vendor_id ?? [];
  return assigned.length > 0
    ? { vendorIds: assigned, restricted: true }
    : { vendorIds: null, restricted: false };
}

/**
 * Orders in the period the caller may see.
 *
 * Scoped callers query per vendor on the composite index, so the read is bounded
 * by their own rows rather than filtered down from the platform's.
 */
async function ordersInPeriod(
  ctx: QueryCtx,
  scope: Scope,
  period: Period,
): Promise<Doc<"orders">[]> {
  if (scope.vendorIds === null) {
    return await ctx.db
      .query("orders")
      .withIndex("by_order_date", (q) =>
        q.gte("order_date", period.start).lte("order_date", period.end),
      )
      .collect();
  }

  const perVendor = await Promise.all(
    scope.vendorIds.map((vendorId) =>
      ctx.db
        .query("orders")
        .withIndex("by_vendor_order_date", (q) =>
          q
            .eq("vendor_id", vendorId)
            .gte("order_date", period.start)
            .lte("order_date", period.end),
        )
        .collect(),
    ),
  );
  return perVendor.flat();
}

/** Revenue counts only orders that were actually paid for. */
function isRealised(order: Doc<"orders">): boolean {
  return order.payment_status === "Paid" && order.order_status !== "Cancelled";
}

function sumRevenue(orders: Doc<"orders">[]): number {
  return orders.reduce(
    (total, o) => (isRealised(o) ? total + (o.total_amount ?? 0) : total),
    0,
  );
}

// ---------------------------------------------------------------------------
// Scope, exposed
// ---------------------------------------------------------------------------

/**
 * What the viewer is looking at, so the dashboard can say so.
 *
 * A vendor manager seeing smaller numbers than they expect needs to know the
 * figures are scoped rather than wrong.
 */
export const getInsightsScope = query({
  args: {},
  handler: async (ctx) => {
    const scope = await resolveScope(ctx);
    if (!scope.restricted) {
      return { restricted: false as const, vendors: [] };
    }
    const vendors = await Promise.all(
      (scope.vendorIds ?? []).map((id) => ctx.db.get(id)),
    );
    return {
      restricted: true as const,
      vendors: vendors
        .filter((v): v is Doc<"vendors"> => v !== null)
        // Name only. The vendor document carries commission, service_radius and
        // bank details, and none of that belongs in a dashboard payload.
        .map((v) => ({ _id: v._id, name: v.name })),
    };
  },
});

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

/**
 * Trading: revenue, orders, basket size, the daily trend, and what sells.
 */
export const getSalesInsights = query({
  args: { timeRange: TimeRange },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx);
    const now = Date.now();
    const period = resolvePeriod(args.timeRange, now);

    const orders = await ordersInPeriod(ctx, scope, period);
    const paid = orders.filter(isRealised);

    const revenue = sumRevenue(orders);
    const orderCount = paid.length;
    const basket = orderCount > 0 ? revenue / orderCount : 0;

    // Previous window, for period-over-period. Skipped for "all", which has no
    // previous — a growth figure against zero is noise.
    let previous = { revenue: 0, orders: 0, basket: 0, available: false };
    if (period.previous) {
      const prevOrders = await ordersInPeriod(ctx, scope, {
        start: period.previous.start,
        end: period.previous.end,
        previous: null,
      });
      const prevPaid = prevOrders.filter(isRealised);
      const prevRevenue = sumRevenue(prevOrders);
      previous = {
        revenue: prevRevenue,
        orders: prevPaid.length,
        basket: prevPaid.length > 0 ? prevRevenue / prevPaid.length : 0,
        available: true,
      };
    }

    // Daily trend, gaps included so the axis does not compress.
    const byDay = new Map<string, { revenue: number; orders: number }>();
    for (const key of dayKeysInPeriod(period)) {
      byDay.set(key, { revenue: 0, orders: 0 });
    }
    for (const order of paid) {
      const key = dayKey(order.order_date);
      const bucket = byDay.get(key);
      // Only days inside the enumerated window; "all" is capped, so older
      // orders legitimately fall outside it.
      if (bucket) {
        bucket.revenue += order.total_amount ?? 0;
        bucket.orders += 1;
      }
    }

    // What sold. Read from order_items per order, which is bounded by the same
    // period rather than being a scan of the whole item table.
    const itemsPerOrder = await Promise.all(
      paid.map((order) =>
        ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("order_id", order._id))
          .collect(),
      ),
    );

    const products = new Map<string, { name: string; units: number; revenue: number }>();
    for (const items of itemsPerOrder) {
      for (const item of items) {
        const key = item.product_id;
        const entry = products.get(key) ?? {
          name: item.name,
          units: 0,
          revenue: 0,
        };
        entry.units += item.quantity ?? 0;
        entry.revenue += item.total ?? 0;
        products.set(key, entry);
      }
    }

    const paymentMix = new Map<string, number>();
    for (const order of paid) {
      const method = order.payment_method ?? "Unknown";
      paymentMix.set(method, (paymentMix.get(method) ?? 0) + 1);
    }

    return {
      restricted: scope.restricted,
      period: { start: period.start, end: period.end },
      revenue,
      orders: orderCount,
      basket,
      // Orders raised but not paid for — the number a manager can act on.
      unpaid: orders.filter((o) => o.payment_status === "Unpaid").length,
      cancelled: orders.filter((o) => o.order_status === "Cancelled").length,
      previous,
      trend: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      topProducts: [...products.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
      paymentMix: [...paymentMix.entries()].map(([method, count]) => ({
        method,
        count,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Fulfilment: where work is sitting, and what is stuck.
 */
export const getOperationsInsights = query({
  args: { timeRange: TimeRange },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx);
    const period = resolvePeriod(args.timeRange, Date.now());
    const orders = await ordersInPeriod(ctx, scope, period);

    const statusCounts = new Map<string, number>();
    for (const order of orders) {
      statusCounts.set(
        order.order_status,
        (statusCounts.get(order.order_status) ?? 0) + 1,
      );
    }

    // Shipments for these orders. Per-order lookups on by_order rather than a
    // scan, so this stays bounded by the period like everything else.
    const shipmentsPerOrder = await Promise.all(
      orders.map((order) =>
        ctx.db
          .query("shipments")
          .withIndex("by_order", (q) => q.eq("order_id", order._id))
          .collect(),
      ),
    );
    const shipments = shipmentsPerOrder.flat();

    const shipmentCounts = new Map<string, number>();
    for (const s of shipments) {
      shipmentCounts.set(s.status, (shipmentCounts.get(s.status) ?? 0) + 1);
    }

    const delivered = shipments.filter((s) => s.status === "Delivered").length;
    const failed = shipments.filter((s) => s.status === "Failed Delivery").length;
    const inFlight = shipments.filter(
      (s) =>
        s.status === "Awaiting Pickup" ||
        s.status === "Picked Up" ||
        s.status === "Out for Delivery",
    ).length;

    // Fulfilment time, order_date -> shipment delivered. `updated_at` is the
    // only timestamp a shipment carries, and for a delivered one it is the
    // moment it was delivered.
    const durations: number[] = [];
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const forOrder = shipmentsPerOrder[i] ?? [];
      const done = forOrder.find((s) => s.status === "Delivered");
      if (order && done && done.updated_at > order.order_date) {
        durations.push(done.updated_at - order.order_date);
      }
    }
    durations.sort((a, b) => a - b);

    return {
      restricted: scope.restricted,
      period: { start: period.start, end: period.end },
      orderStatus: [...statusCounts.entries()].map(([status, count]) => ({
        status,
        count,
      })),
      shipmentStatus: [...shipmentCounts.entries()].map(([status, count]) => ({
        status,
        count,
      })),
      delivered,
      failed,
      inFlight,
      /** Share of finished deliveries that succeeded. Null when none finished. */
      successRate:
        delivered + failed > 0
          ? Math.round((delivered / (delivered + failed)) * 100)
          : null,
      /**
       * Median rather than mean: one delivery that sat overnight drags an
       * average far enough to hide the typical case.
       */
      medianFulfilmentMs:
        durations.length > 0
          ? (durations[Math.floor(durations.length / 2)] ?? null)
          : null,
      /** Orders needing a picker but with nobody assigned. */
      awaitingPicker: orders.filter(
        (o) =>
          !o.assigned_picker_id &&
          (o.order_status === "Pending" || o.order_status === "Confirmed"),
      ).length,
      /** Paid, not cancelled, and still not delivered. */
      openOrders: orders.filter(
        (o) => o.order_status !== "Delivered" && o.order_status !== "Cancelled",
      ).length,
    };
  },
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/**
 * Who is doing the work, and how well.
 *
 * Riders and pickers are people, so this reports throughput and success rate and
 * nothing else — no ranking that would read as a league table, and no per-person
 * revenue attribution, which a delivery rider does not control.
 */
export const getPerformanceInsights = query({
  args: { timeRange: TimeRange },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx);
    const period = resolvePeriod(args.timeRange, Date.now());
    const orders = await ordersInPeriod(ctx, scope, period);

    const shipmentsPerOrder = await Promise.all(
      orders.map((order) =>
        ctx.db
          .query("shipments")
          .withIndex("by_order", (q) => q.eq("order_id", order._id))
          .collect(),
      ),
    );

    const byRider = new Map<
      Id<"users">,
      { delivered: number; failed: number; inFlight: number }
    >();
    for (const shipment of shipmentsPerOrder.flat()) {
      const entry =
        byRider.get(shipment.rider_id) ??
        { delivered: 0, failed: 0, inFlight: 0 };
      if (shipment.status === "Delivered") entry.delivered += 1;
      else if (shipment.status === "Failed Delivery") entry.failed += 1;
      else entry.inFlight += 1;
      byRider.set(shipment.rider_id, entry);
    }

    const riderDocs = await Promise.all(
      [...byRider.keys()].map((id) => ctx.db.get(id)),
    );
    const riderName = new Map<Id<"users">, string>();
    for (const doc of riderDocs) {
      if (doc) {
        riderName.set(
          doc._id,
          `${doc.first_name ?? ""} ${doc.last_name ?? ""}`.trim() || "Rider",
        );
      }
    }

    const pickers = new Map<Id<"users">, number>();
    for (const order of orders) {
      if (!order.assigned_picker_id) continue;
      pickers.set(
        order.assigned_picker_id,
        (pickers.get(order.assigned_picker_id) ?? 0) + 1,
      );
    }
    const pickerDocs = await Promise.all(
      [...pickers.keys()].map((id) => ctx.db.get(id)),
    );
    const pickerName = new Map<Id<"users">, string>();
    for (const doc of pickerDocs) {
      if (doc) {
        pickerName.set(
          doc._id,
          `${doc.first_name ?? ""} ${doc.last_name ?? ""}`.trim() || "Picker",
        );
      }
    }

    return {
      restricted: scope.restricted,
      period: { start: period.start, end: period.end },
      riders: [...byRider.entries()]
        .map(([id, stats]) => ({
          id,
          name: riderName.get(id) ?? "Rider",
          ...stats,
          successRate:
            stats.delivered + stats.failed > 0
              ? Math.round(
                  (stats.delivered / (stats.delivered + stats.failed)) * 100,
                )
              : null,
        }))
        .sort((a, b) => b.delivered - a.delivered)
        .slice(0, 10),
      pickers: [...pickers.entries()]
        .map(([id, count]) => ({
          id,
          name: pickerName.get(id) ?? "Picker",
          orders: count,
        }))
        .sort((a, b) => b.orders - a.orders)
        .slice(0, 10),
    };
  },
});
