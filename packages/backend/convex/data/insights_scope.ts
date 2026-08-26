import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUser } from "../auth.helpers";
import { timeRanges, type Period } from "../lib/time_range";

/**
 * Who may see what, for every insights query.
 *
 * This module registers no Convex functions. It exists so that the scope rule
 * has exactly ONE definition. The rule was previously re-derived in each admin
 * page from `currentUser.manager_details.vendor_id` in the browser, which is a
 * security problem rather than mere duplication: a page that forgets it shows a
 * vendor manager the whole platform, and that is precisely what happened.
 *
 * The scope is never an argument. Every query resolves it from the caller.
 */

/** The periods every insights query accepts. */
export const TimeRange = v.union(...timeRanges.map((t) => v.literal(t)));

export interface Scope {
  /** Null means the whole platform. */
  vendorIds: Id<"vendors">[] | null;
  restricted: boolean;
}

/**
 * What this caller is allowed to see.
 *
 * A non-empty `manager_details.vendor_id` is what makes someone a vendor
 * manager. Empty means an unrestricted caller — the platform view.
 */
export async function resolveScope(ctx: QueryCtx): Promise<Scope> {
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
 * by their own rows rather than being filtered down from the platform's. That is
 * not only cheaper: `insights.ts` filters in memory after `.collect()`ing the
 * whole table, and Convex's 16k-document read limit THROWS rather than
 * degrading, so an unbounded read is an outage waiting on row growth.
 */
export async function ordersInPeriod(
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
export function isRealised(order: Doc<"orders">): boolean {
  return order.payment_status === "Paid" && order.order_status !== "Cancelled";
}

export function sumRevenue(orders: Doc<"orders">[]): number {
  return orders.reduce(
    (total, o) => (isRealised(o) ? total + (o.total_amount ?? 0) : total),
    0,
  );
}

/**
 * Vendors the caller may see, by id.
 *
 * Name and industry only. The vendor document carries `commission`,
 * `service_radius` and `business_details` (bank code, account number, KRA PIN,
 * Paystack subaccount) and none of that belongs in a dashboard payload — the
 * same reason the rider app stopped calling `getVendorById`.
 */
export async function visibleVendors(
  ctx: QueryCtx,
  scope: Scope,
): Promise<{ _id: Id<"vendors">; name: string; industryId: Id<"industry"> | null }[]> {
  const docs =
    scope.vendorIds === null
      ? await ctx.db.query("vendors").collect()
      : (
          await Promise.all(scope.vendorIds.map((id) => ctx.db.get(id)))
        ).filter((d): d is Doc<"vendors"> => d !== null);

  return docs.map((d) => ({
    _id: d._id,
    name: d.name,
    industryId: d.industry_id ?? null,
  }));
}

/**
 * Turn a count map into the sorted array shape the charts consume.
 *
 * Descending, because every consumer of this is a ranked list or a donut whose
 * slice order should be stable and meaningful.
 */
export function countsToList<K extends string>(
  counts: Map<string, number>,
  key: K,
): ({ [P in K]: string } & { count: number })[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ [key]: name, count }) as { [P in K]: string } & {
      count: number;
    });
}
