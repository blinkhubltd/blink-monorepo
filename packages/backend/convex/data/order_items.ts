import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  OrderItemUpdateValidator,
  OrderItemValidator,
  OrderItemWithoutOrderId,
  OrdersValidator,
} from "../validators";

export const createItem = mutation({
  args: { item: OrderItemValidator },
  handler: async (ctx, args) => {
    return await ctx.db.insert("order_items", args.item);
  },
});

export const listByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
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

export const updateItem = mutation({
  args: {
    id: v.id("order_items"),
    updates: OrderItemUpdateValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.updates);
    return await ctx.db.get(args.id);
  },
});

export const deleteItem = mutation({
  args: { id: v.id("order_items") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return {
      success: true,
    };
  },
});

export const createOrderWithItems = mutation({
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
