import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { dayKey, dayKeysInPeriod, resolvePeriod } from "../lib/time_range";
import {
  isRealised,
  ordersInPeriod,
  resolveScope,
  sumRevenue,
  TimeRange,
  visibleVendors,
  type Scope,
} from "./insights_scope";

/**
 * The per-domain insight pages: orders, shipments, products, customers,
 * industries.
 *
 * ── What these replace ────────────────────────────────────────────────────
 *
 * The five `getDetailed*Insights` queries in `data/insights.ts`. Every one of
 * them authenticates nobody, and they split into two kinds of problem:
 *
 *   getDetailedOrdersInsights      takes vendorIds AS AN ARGUMENT, so a vendor
 *   getDetailedShipmentsInsights   manager can pass a competitor's id, or simply
 *   getDetailedProductsInsights    omit it and get the platform
 *
 *   getDetailedUsersInsights       has no vendor parameter AT ALL — every user,
 *   getDetailedIndustriesInsights  every industry, every rival's revenue
 *
 * They are also unbounded. Between them they `.collect()` the whole of `orders`,
 * `order_items`, `products`, `shipments`, `users`, `roles`, `vendors` and
 * `industry` — `getDetailedProductsInsights` alone reads four entire tables.
 * Convex's 16k-document read ceiling THROWS, so those are outages waiting on row
 * growth, not slow queries.
 *
 * ── Two domains needed a decision, not just a filter ─────────────────────
 *
 * Orders, shipments and products scope naturally: they belong to a vendor.
 *
 * CUSTOMERS do not. A vendor manager has no claim on the platform's user list or
 * its role distribution, so for a restricted caller `platform` is null and the
 * figures describe the people who actually bought from them — derived from their
 * own orders. "New" means a customer whose first order with them falls inside
 * the period, which is a fact about their vendor rather than about the platform.
 *
 * INDUSTRIES are a platform-level grouping, and the point of the page is
 * comparing them. A restricted caller sees only the industries their own vendors
 * sit in, and the orders and revenue counted into those rows are their own
 * vendors' — never the other vendors sharing the industry. So the row is "your
 * contribution to Pharmacy", not "Pharmacy".
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

function toStatusList(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }));
}

function tally<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Median, because one outlier drags a mean far enough to hide the typical case. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/**
 * Shipments belonging to a set of orders.
 *
 * Per-order lookups on `by_order` rather than scanning the shipments table, so
 * this stays bounded by the period like everything else. Returned alongside the
 * order so callers can pair them without a second map.
 */
async function shipmentsForOrders(
  ctx: Parameters<typeof resolveScope>[0],
  orders: Doc<"orders">[],
): Promise<Doc<"shipments">[][]> {
  return await Promise.all(
    orders.map((order) =>
      ctx.db
        .query("shipments")
        .withIndex("by_order", (q) => q.eq("order_id", order._id))
        .collect(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Orders: volume, value, where they are in their lifecycle, and payment state.
 *
 * Distinct from the Sales tab on /insights, which answers "what did we earn".
 * This answers "what did we take, and did we get paid" — so unlike Sales it
 * counts every order, realised or not, and reports the payment split as a first
 * class figure rather than a footnote.
 */
export const getOrdersInsights = query({
  args: {
    timeRange: TimeRange,
    /**
     * Optional narrowing within the caller's scope.
     *
     * Safe as an argument in a way the old `vendorIds` was not: this can only
     * ever REMOVE rows from a set already restricted server-side. Passing an
     * industry the caller has no vendors in yields an empty result, not someone
     * else's data.
     */
    industryId: v.optional(v.id("industry")),
  },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx);
    const period = resolvePeriod(args.timeRange, Date.now());

    const vendors = await visibleVendors(ctx, scope);
    const vendorById = new Map(vendors.map((v) => [v._id as string, v]));

    const all = await ordersInPeriod(ctx, scope, period);
    const orders = args.industryId
      ? all.filter(
          (o) => vendorById.get(o.vendor_id)?.industryId === args.industryId,
        )
      : all;

    const realised = orders.filter(isRealised);
    const revenue = sumRevenue(orders);

    // Previous window, for the period-over-period figures. Filtered the same
    // way as the current one, or the comparison would be against a wider set.
    let previous = { orders: 0, revenue: 0, available: false };
    if (period.previous) {
      const prevAll = await ordersInPeriod(ctx, scope, {
        start: period.previous.start,
        end: period.previous.end,
        previous: null,
      });
      const prev = args.industryId
        ? prevAll.filter(
            (o) => vendorById.get(o.vendor_id)?.industryId === args.industryId,
          )
        : prevAll;
      previous = {
        orders: prev.length,
        revenue: sumRevenue(prev),
        available: true,
      };
    }

    // Daily trend with empty days included, so a zero day is a dip in the line
    // rather than a missing point that compresses the axis and lies about slope.
    const byDay = new Map<string, { orders: number; revenue: number }>();
    for (const key of dayKeysInPeriod(period)) {
      byDay.set(key, { orders: 0, revenue: 0 });
    }
    for (const order of orders) {
      const bucket = byDay.get(dayKey(order.order_date));
      if (!bucket) continue;
      bucket.orders += 1;
      if (isRealised(order)) bucket.revenue += order.total_amount ?? 0;
    }

    // Value distribution. Fixed bands rather than quantiles: a manager reads
    // "how many small baskets" off named bands, and quantiles move every period
    // so two periods cannot be compared.
    const bands = [
      { label: "Under 500", min: 0, max: 500 },
      { label: "500 – 2k", min: 500, max: 2000 },
      { label: "2k – 5k", min: 2000, max: 5000 },
      { label: "5k – 10k", min: 5000, max: 10000 },
      { label: "10k+", min: 10000, max: Infinity },
    ];
    const basketBands = bands.map((band) => ({
      label: band.label,
      count: realised.filter((o) => {
        const amount = o.total_amount ?? 0;
        return amount >= band.min && amount < band.max;
      }).length,
    }));

    // The old page's "Orders Summary" tables, which came from a second query
    // (`getOrdersSummary`) that read the whole orders table again. Both cuts are
    // free here — the orders are already in hand and the vendors are already
    // resolved for the industry filter.
    //
    // By-category is NOT here: it needs a product lookup per order item, and the
    // products page already reports revenue by category from the catalogue side,
    // which is the page a category question belongs on.
    const byVendor = new Map<string, { name: string; orders: number; revenue: number }>();
    const byIndustryId = new Map<string, { orders: number; revenue: number }>();
    for (const order of orders) {
      const vendor = vendorById.get(order.vendor_id);
      const vendorEntry = byVendor.get(order.vendor_id) ?? {
        name: vendor?.name ?? "Unknown vendor",
        orders: 0,
        revenue: 0,
      };
      vendorEntry.orders += 1;
      if (isRealised(order)) vendorEntry.revenue += order.total_amount ?? 0;
      byVendor.set(order.vendor_id, vendorEntry);

      const industryId = vendor?.industryId;
      if (industryId) {
        const entry = byIndustryId.get(industryId) ?? { orders: 0, revenue: 0 };
        entry.orders += 1;
        if (isRealised(order)) entry.revenue += order.total_amount ?? 0;
        byIndustryId.set(industryId, entry);
      }
    }

    const industryDocs = await Promise.all(
      [...byIndustryId.keys()].map((id) => ctx.db.get(id as Id<"industry">)),
    );
    const industryName = new Map<string, string>();
    for (const doc of industryDocs) {
      if (doc) industryName.set(doc._id, doc.name);
    }

    return {
      restricted: scope.restricted,
      period: { start: period.start, end: period.end },
      totalOrders: orders.length,
      revenue,
      byVendor: [...byVendor.values()].sort((a, b) => b.revenue - a.revenue),
      byIndustry: [...byIndustryId.entries()]
        .map(([id, stats]) => ({
          name: industryName.get(id) ?? "Unknown industry",
          ...stats,
        }))
        .sort((a, b) => b.revenue - a.revenue),
      delivered: orders.filter((o) => o.order_status === "Delivered").length,
      // Average over PAID orders only. Dividing realised revenue by every order
      // including the unpaid ones understates the basket, which is the mistake
      // the old page made.
      averageBasket: realised.length > 0 ? revenue / realised.length : 0,
      paid: realised.length,
      unpaid: orders.filter((o) => o.payment_status === "Unpaid").length,
      cancelled: orders.filter((o) => o.order_status === "Cancelled").length,
      previous,
      trend: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      statusDistribution: toStatusList(tally(orders, (o) => o.order_status)),
      paymentDistribution: toStatusList(
        tally(orders, (o) => o.payment_status),
      ),
      paymentMethods: toStatusList(
        tally(orders, (o) => o.payment_method ?? "Unknown"),
      ),
      basketBands,
    };
  },
});

// ---------------------------------------------------------------------------
// Shipments
// ---------------------------------------------------------------------------

/**
 * Shipments: outcomes, and how long delivery takes.
 *
 * Reached through the period's orders rather than by reading the shipments
 * table, which is what makes it scopeable at all — a shipment carries a
 * `vendor_id` but the old query scanned every row and then filtered, so an
 * omitted argument meant the platform.
 */
export const getShipmentsInsights = query({
  args: { timeRange: TimeRange },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx);
    const period = resolvePeriod(args.timeRange, Date.now());
    const orders = await ordersInPeriod(ctx, scope, period);
    const perOrder = await shipmentsForOrders(ctx, orders);
    const shipments = perOrder.flat();

    const delivered = shipments.filter((s) => s.status === "Delivered");
    const failed = shipments.filter((s) => s.status === "Failed Delivery");
    const inFlight = shipments.filter(
      (s) =>
        s.status === "Awaiting Pickup" ||
        s.status === "Picked Up" ||
        s.status === "Out for Delivery",
    );

    // Two different durations, because they answer different questions and the
    // old page conflated them into one "avg delivery time".
    //
    //   fulfilment : order placed -> delivered. What the CUSTOMER waited.
    //   transit    : shipment created -> delivered. What the RIDER took.
    const fulfilment: number[] = [];
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const done = (perOrder[i] ?? []).find((s) => s.status === "Delivered");
      if (order && done && done.updated_at > order.order_date) {
        fulfilment.push(done.updated_at - order.order_date);
      }
    }
    const transit = delivered
      .filter((s) => s.updated_at > s._creationTime)
      .map((s) => s.updated_at - s._creationTime);

    // Daily created vs delivered. Created outrunning delivered day after day is
    // a backlog forming, which is the one thing this chart is for.
    const byDay = new Map<string, { created: number; delivered: number }>();
    for (const key of dayKeysInPeriod(period)) {
      byDay.set(key, { created: 0, delivered: 0 });
    }
    for (const s of shipments) {
      const created = byDay.get(dayKey(s._creationTime));
      if (created) created.created += 1;
      if (s.status === "Delivered") {
        const done = byDay.get(dayKey(s.updated_at));
        if (done) done.delivered += 1;
      }
    }

    const finished = delivered.length + failed.length;

    return {
      restricted: scope.restricted,
      period: { start: period.start, end: period.end },
      totalShipments: shipments.length,
      delivered: delivered.length,
      failed: failed.length,
      inFlight: inFlight.length,
      /**
       * Share of FINISHED deliveries that succeeded — not of all shipments.
       * The old query divided by every shipment, so anything still out with a
       * rider counted against the rate and a busy day looked like a bad one.
       * Null when nothing has finished; zero would read as total failure.
       */
      successRate:
        finished > 0 ? Math.round((delivered.length / finished) * 100) : null,
      medianFulfilmentMs: median(fulfilment),
      medianTransitMs: median(transit),
      statusDistribution: toStatusList(tally(shipments, (s) => s.status)),
      trend: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      /** Orders in the period that never got a shipment at all. */
      withoutShipment: perOrder.filter((list) => list.length === 0).length,
    };
  },
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * Products: what is stocked, what is selling, and what is about to run out.
 */
export const getProductsInsights = query({
  args: {
    timeRange: TimeRange,
    /** Narrows within the caller's scope; it can only remove rows. */
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx);
    const period = resolvePeriod(args.timeRange, Date.now());

    // Catalogue, through by_vendor when scoped rather than a whole-table read
    // filtered afterwards.
    const allProducts =
      scope.vendorIds === null
        ? await ctx.db.query("products").collect()
        : (
            await Promise.all(
              scope.vendorIds.map((vendorId) =>
                ctx.db
                  .query("products")
                  .withIndex("by_vendor", (q) => q.eq("vendor_id", vendorId))
                  .collect(),
              ),
            )
          ).flat();

    const products = args.categoryId
      ? allProducts.filter((p) => p.category_id === args.categoryId)
      : allProducts;

    // Sales, through the period's orders. Reading order_items per order keeps
    // this bounded; the old query read the entire order_items table.
    const orders = await ordersInPeriod(ctx, scope, period);
    const paid = orders.filter(isRealised);
    const itemsPerOrder = await Promise.all(
      paid.map((order) =>
        ctx.db
          .query("order_items")
          .withIndex("by_order", (q) => q.eq("order_id", order._id))
          .collect(),
      ),
    );

    const sold = new Map<
      string,
      { name: string; units: number; revenue: number }
    >();
    for (const item of itemsPerOrder.flat()) {
      const entry = sold.get(item.product_id) ?? {
        name: item.name,
        units: 0,
        revenue: 0,
      };
      entry.units += item.quantity ?? 0;
      entry.revenue += item.total ?? 0;
      sold.set(item.product_id, entry);
    }

    // Categories, resolved only for the categories actually present rather than
    // by reading the whole categories table.
    const categoryIds = [
      ...new Set(
        products
          .map((p) => p.category_id)
          .filter((id): id is Id<"categories"> => Boolean(id)),
      ),
    ];
    const categoryDocs = await Promise.all(
      categoryIds.map((id) => ctx.db.get(id)),
    );
    const categoryName = new Map<string, string>();
    for (const doc of categoryDocs) {
      if (doc) categoryName.set(doc._id, doc.name);
    }

    const byCategory = new Map<
      string,
      { name: string; products: number; revenue: number; units: number }
    >();
    for (const product of products) {
      const key = product.category_id ?? "uncategorised";
      const entry = byCategory.get(key) ?? {
        name: product.category_id
          ? (categoryName.get(product.category_id) ?? "Unknown category")
          : "Uncategorised",
        products: 0,
        revenue: 0,
        units: 0,
      };
      entry.products += 1;
      const sales = sold.get(product._id);
      if (sales) {
        entry.revenue += sales.revenue;
        entry.units += sales.units;
      }
      byCategory.set(key, entry);
    }

    // LOW_STOCK is a constant here and was a magic 10 in the old query. It
    // should be a platform setting; naming it is the first step and stops the
    // threshold differing between two pages meanwhile.
    const LOW_STOCK = 10;
    const inStock = products.filter((p) => (p.quantity ?? 0) > 0);
    const lowStock = products.filter(
      (p) => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) < LOW_STOCK,
    );
    const outOfStock = products.filter((p) => (p.quantity ?? 0) <= 0);

    // Never sold in this period AND in stock: capital sitting still. The pair of
    // conditions matters — an out-of-stock product with no sales is not idle
    // stock, it is just absent.
    const idle = inStock.filter((p) => !sold.has(p._id));

    return {
      restricted: scope.restricted,
      period: { start: period.start, end: period.end },
      totalProducts: products.length,
      totalUnits: products.reduce((sum, p) => sum + (p.quantity ?? 0), 0),
      inventoryValue: products.reduce(
        (sum, p) => sum + (p.price ?? 0) * (p.quantity ?? 0),
        0,
      ),
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      lowStockThreshold: LOW_STOCK,
      idleCount: idle.length,
      statusDistribution: toStatusList(tally(products, (p) => p.status)),
      byCategory: [...byCategory.values()].sort((a, b) => b.revenue - a.revenue),
      topProducts: [...sold.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      /** Lowest stock first — this list is a reorder prompt, not a ranking. */
      lowStock: lowStock
        .sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0))
        .slice(0, 10)
        .map((p) => ({
          id: p._id,
          name: p.name,
          quantity: p.quantity ?? 0,
          price: p.price ?? 0,
        })),
    };
  },
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Customers.
 *
 * Named for what a restricted caller actually gets. The old page was "Users
 * insights" and returned the platform's entire user list plus its role
 * distribution to anyone who asked, which is a staff directory rather than a
 * business insight.
 *
 * `platform` — total users, role split, signups — is null for a restricted
 * caller, because a vendor manager has no claim on it. What they get instead is
 * the set of customers who bought from them, derived from their own orders.
 */
export const getCustomersInsights = query({
  args: { timeRange: TimeRange },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx);
    const period = resolvePeriod(args.timeRange, Date.now());
    const orders = await ordersInPeriod(ctx, scope, period);
    const paid = orders.filter(isRealised);

    // Spend per customer, within the caller's scope.
    const spend = new Map<
      Id<"users">,
      { orders: number; spent: number; first: number }
    >();
    for (const order of paid) {
      const entry = spend.get(order.user_id) ?? {
        orders: 0,
        spent: 0,
        first: order.order_date,
      };
      entry.orders += 1;
      entry.spent += order.total_amount ?? 0;
      entry.first = Math.min(entry.first, order.order_date);
      spend.set(order.user_id, entry);
    }

    // New vs returning, decided by whether this customer ordered BEFORE the
    // period — within the caller's scope, so "new" means new to them.
    //
    // One indexed query per customer over all time. That is the honest cost of
    // the distinction; capping the customer list keeps it bounded.
    const customerIds = [...spend.keys()];
    const priorCounts = await Promise.all(
      customerIds.map(async (userId) => {
        const earlier = await ctx.db
          .query("orders")
          .withIndex("by_user", (q) => q.eq("user_id", userId))
          .filter((q) => q.lt(q.field("order_date"), period.start))
          .take(1);
        return earlier.length > 0;
      }),
    );
    const returning = priorCounts.filter(Boolean).length;

    const customerDocs = await Promise.all(
      customerIds.map((id) => ctx.db.get(id)),
    );
    const identity = new Map<Id<"users">, { name: string; email: string }>();
    for (const doc of customerDocs) {
      if (doc) {
        identity.set(doc._id, {
          name:
            `${doc.first_name ?? ""} ${doc.last_name ?? ""}`.trim() ||
            "Customer",
          // The email disambiguates two customers with the same name, which is
          // why the old table carried it. Nothing else from the user document
          // comes along.
          email: doc.email ?? "",
        });
      }
    }

    // Daily active customers — distinct buyers per day, not order count, so a
    // single customer placing five orders does not read as five people.
    const perDay = new Map<string, Set<string>>();
    for (const key of dayKeysInPeriod(period)) {
      perDay.set(key, new Set());
    }
    for (const order of paid) {
      perDay.get(dayKey(order.order_date))?.add(order.user_id);
    }

    let platform: {
      totalUsers: number;
      newUsers: number;
      byRole: { role: string; count: number }[];
    } | null = null;

    if (!scope.restricted) {
      // Only an unrestricted caller reads the user table. Roles are resolved for
      // the roles present rather than by collecting the roles table.
      const users = await ctx.db.query("users").collect();
      const roleIds = [
        ...new Set(
          users
            .map((u) => u.role_id)
            .filter((id): id is Id<"roles"> => Boolean(id)),
        ),
      ];
      const roleDocs = await Promise.all(roleIds.map((id) => ctx.db.get(id)));
      const roleName = new Map<string, string>();
      for (const doc of roleDocs) {
        if (doc) roleName.set(doc._id, doc.name);
      }

      platform = {
        totalUsers: users.length,
        newUsers: users.filter(
          (u) => u._creationTime >= period.start && u._creationTime <= period.end,
        ).length,
        byRole: toStatusList(
          tally(users, (u) =>
            u.role_id ? (roleName.get(u.role_id) ?? "Unknown role") : "No role"),
        ).map(({ status, count }) => ({ role: status, count })),
      };
    }

    const totalSpent = [...spend.values()].reduce((sum, s) => sum + s.spent, 0);

    return {
      restricted: scope.restricted,
      period: { start: period.start, end: period.end },
      platform,
      buyingCustomers: spend.size,
      newCustomers: spend.size - returning,
      returningCustomers: returning,
      /** Average spend per customer in the period, not per order. */
      averageCustomerValue: spend.size > 0 ? totalSpent / spend.size : 0,
      /** Orders per customer — the repeat-purchase signal. */
      ordersPerCustomer:
        spend.size > 0 ? paid.length / spend.size : 0,
      activeByDay: [...perDay.entries()].map(([date, set]) => ({
        date,
        customers: set.size,
      })),
      topCustomers: [...spend.entries()]
        .map(([id, s]) => ({
          id,
          name: identity.get(id)?.name ?? "Customer",
          email: identity.get(id)?.email ?? "",
          orders: s.orders,
          spent: s.spent,
        }))
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 10),
    };
  },
});

// ---------------------------------------------------------------------------
// Industries
// ---------------------------------------------------------------------------

/**
 * Industries: which lines of business the volume sits in.
 *
 * For a restricted caller the rows are the industries their own vendors sit in,
 * and the orders and revenue counted into them are their own vendors' only — so
 * a row reads "your contribution to Pharmacy", never "Pharmacy". Other vendors
 * sharing the industry are invisible, which is the whole point.
 */
export const getIndustriesInsights = query({
  args: { timeRange: TimeRange },
  handler: async (ctx, args) => {
    const scope = await resolveScope(ctx);
    const period = resolvePeriod(args.timeRange, Date.now());

    const vendors = await visibleVendors(ctx, scope);
    const industryOfVendor = new Map<string, Id<"industry"> | null>(
      vendors.map((v) => [v._id, v.industryId]),
    );

    const industryIds = [
      ...new Set(
        vendors
          .map((v) => v.industryId)
          .filter((id): id is Id<"industry"> => Boolean(id)),
      ),
    ];
    const industryDocs = (
      await Promise.all(industryIds.map((id) => ctx.db.get(id)))
    ).filter((d): d is Doc<"industry"> => d !== null);

    interface Row {
      id: string;
      name: string;
      status: string;
      vendors: number;
      products: number;
      orders: number;
      revenue: number;
    }
    const rows = new Map<string, Row>();
    for (const doc of industryDocs) {
      rows.set(doc._id, {
        id: doc._id,
        name: doc.name,
        status: doc.status,
        vendors: 0,
        products: 0,
        orders: 0,
        revenue: 0,
      });
    }

    // Products per industry, counted per visible vendor on by_vendor rather
    // than by reading the products table.
    const productCounts = await Promise.all(
      vendors.map(async (vendor) => ({
        vendorId: vendor._id,
        count: (
          await ctx.db
            .query("products")
            .withIndex("by_vendor", (q) => q.eq("vendor_id", vendor._id))
            .collect()
        ).length,
      })),
    );

    for (const vendor of vendors) {
      const industryId = vendor.industryId;
      const row = industryId ? rows.get(industryId) : undefined;
      if (row) row.vendors += 1;
    }
    for (const { vendorId, count } of productCounts) {
      const industryId = industryOfVendor.get(vendorId);
      const row = industryId ? rows.get(industryId) : undefined;
      if (row) row.products += count;
    }

    const orders = await ordersInPeriod(ctx, scope, period);
    for (const order of orders) {
      const industryId = industryOfVendor.get(order.vendor_id);
      const row = industryId ? rows.get(industryId) : undefined;
      if (!row) continue;
      row.orders += 1;
      if (isRealised(order)) row.revenue += order.total_amount ?? 0;
    }

    // Vendor rows too. On the platform view this is the more actionable cut,
    // and for a restricted caller with one vendor the industry row and the
    // vendor row are the same number said twice — so the UI shows vendors only
    // when there is more than one.
    const byVendor = new Map<string, { name: string; orders: number; revenue: number }>(
      vendors.map((v) => [v._id, { name: v.name, orders: 0, revenue: 0 }]),
    );
    for (const order of orders) {
      const entry = byVendor.get(order.vendor_id);
      if (!entry) continue;
      entry.orders += 1;
      if (isRealised(order)) entry.revenue += order.total_amount ?? 0;
    }

    const industries = [...rows.values()].sort((a, b) => b.revenue - a.revenue);

    return {
      restricted: scope.restricted,
      period: { start: period.start, end: period.end },
      totalIndustries: industries.length,
      activeIndustries: industries.filter((i) => i.status === "Active").length,
      totalVendors: vendors.length,
      totalRevenue: industries.reduce((sum, i) => sum + i.revenue, 0),
      totalOrders: industries.reduce((sum, i) => sum + i.orders, 0),
      industries,
      vendors: [...byVendor.values()].sort((a, b) => b.revenue - a.revenue),
    };
  },
});

/** Kept for the type import above; `Scope` is re-exported for test use. */
export type { Scope };
