import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  OrderItemUpdateValidator,
  OrderItemValidator,
  OrderItemWithoutOrderId,
  OrdersValidator,
} from "../validators";
import { assertPermission } from "../auth.helpers";

/**
 * Order line items — one gated read, four functions with no caller closed.
 *
 * `createItem`, `updateItem`, `deleteItem` and `createOrderWithItems` had no
 * auth and no caller anywhere in this monorepo — `createOrderWithItems` in
 * particular writes a full order plus its items from client-supplied prices,
 * the same shape the checkout rewrite replaced with a server-priced quote.
 * `listByOrder` is the one with a live caller (the admin shipment and receipt
 * views) and is gated instead.
 */

/** @deprecated No caller anywhere in this monorepo. */
export const createItem = internalMutation({
  args: { item: OrderItemValidator },
  handler: async (ctx, args) => {
    return await ctx.db.insert("order_items", args.item);
  },
});

export const listByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "orders:READ");
    const items = await ctx.db
      .query("order_items")
      .withIndex("by_order", (q) => q.eq("order_id", args.orderId))
      .collect();

    // Enrich with product details
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.product_id);
        return {
          ...item,
          unit_type: product?.unit_type,
          unit_value: product?.unit_value,
        };
      })
    );

    return enrichedItems;
  },
});

/** @deprecated No caller anywhere in this monorepo. */
export const updateItem = internalMutation({
  args: {
    id: v.id("order_items"),
    updates: OrderItemUpdateValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.updates);
    return await ctx.db.get(args.id);
  },
});

/** @deprecated No caller anywhere in this monorepo. */
export const deleteItem = internalMutation({
  args: { id: v.id("order_items") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return {
      success: true,
    };
  },
});

/**
 * @deprecated No caller anywhere in this monorepo, and superseded regardless:
 * it writes an order from client-supplied `order`/`items` payloads, exactly the
 * shape `data/checkout.ts` replaced with a server-priced stored quote.
 */
export const createOrderWithItems = internalMutation({
  args: {
    order: OrdersValidator,
    items: v.array(OrderItemWithoutOrderId),
  },
  handler: async (ctx, args) => {
    // Create order
    const orderId = await ctx.db.insert("orders", args.order);

    // Attach order_id with insert items
    const itemIds: string[] = [];
    for (const item of args.items) {
      const itemId = await ctx.db.insert("order_items", {
        ...item,
        order_id: orderId,
      });
      itemIds.push(itemId);
    }

    return { orderId, itemIds };
  },
});
