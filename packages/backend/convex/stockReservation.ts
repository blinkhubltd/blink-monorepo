import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Check stock availability for multiple cart items
export const checkCartStockAvailability = query({
  args: {
    cartItems: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];

    for (const item of args.cartItems) {
      try {
        const product = await ctx.db.get(item.productId);
        if (!product) {
          results.push({
            productId: item.productId,
            requestedQuantity: item.quantity,
            availableStock: 0,
            maxAvailable: 0,
            status: "not_found",
            product: null,
          });
          continue;
        }

        // Calculate available stock (current stock - active reservations)
        const activeReservations = await ctx.db
          .query("stockReservation")
          .withIndex("by_product", (q) => q.eq("product_id", item.productId))
          .filter((q) => q.eq(q.field("status"), "Reserved"))
          .collect();

        const reservedQuantity = activeReservations.reduce(
          (sum, res) => sum + res.quantity_reserved,
          0
        );

        const availableStock = product.quantity - reservedQuantity;
        const maxAvailable = Math.min(availableStock, item.quantity);

        results.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          availableStock: product.quantity,
          reservedQuantity,
          maxAvailable,
          status:
            availableStock >= item.quantity ? "available" : "insufficient",
          product: {
            _id: product._id,
            name: product.name,
            price: product.price,
            sku: product.sku,
          },
        });
      } catch (error) {
        results.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          availableStock: 0,
          maxAvailable: 0,
          status: "error",
          product: null,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const availableItems = results.filter((r) => r.status === "available");
    const unavailableItems = results.filter((r) => r.status !== "available");

    return {
      items: results,
      summary: {
        totalItems: results.length,
        availableItems: availableItems.length,
        unavailableItems: unavailableItems.length,
        canProceedWithAll: unavailableItems.length === 0,
        canProceedPartially: availableItems.length > 0,
      },
    };
  },
});

export const reserveStock = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.number(),
    orderReference: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for existing reservation first (idempotency)
    const existingReservation = await ctx.db
      .query("stockReservation")
      .withIndex("by_order_reference", (q) =>
        q.eq("order_reference", args.orderReference)
      )
      .filter((q) => q.eq(q.field("product_id"), args.productId))
      .first();

    if (existingReservation) {
      if (existingReservation.status === "Reserved") {
        return existingReservation; // Already reserved, return existing
      }
      throw new Error("Stock already processed for this order");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    // Calculate available stock (current stock - active reservations)
    const activeReservations = await ctx.db
      .query("stockReservation")
      .withIndex("by_product", (q) => q.eq("product_id", args.productId))
      .filter((q) => q.eq(q.field("status"), "Reserved"))
      .collect();

    const reservedQuantity = activeReservations.reduce(
      (sum, res) => sum + res.quantity_reserved,
      0
    );

    const availableStock = product.quantity - reservedQuantity;

    if (availableStock < args.quantity) {
      throw new Error(
        `Insufficient stock. Available: ${availableStock}, Requested: ${args.quantity}`
      );
    }

    // Create reservation record (don't deduct from product yet)
    const reservation = await ctx.db.insert("stockReservation", {
      product_id: args.productId,
      quantity_reserved: args.quantity,
      status: "Reserved",
      order_reference: args.orderReference,
      reserved_at: Date.now(),
      expires_at: Date.now() + 15 * 60 * 1000, // Expires in 15 minutes
    });

    return reservation;
  },
});

export const confirmPaymentReservation = mutation({
  args: {
    orderReference: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all reserved stock for this order
    const reservations = await ctx.db
      .query("stockReservation")
      .withIndex("by_order_reference", (q) =>
        q.eq("order_reference", args.orderReference)
      )
      .filter((q) => q.eq(q.field("status"), "Reserved"))
      .collect();

    if (reservations.length === 0) {
      throw new Error("No reserved stock found for this order");
    }

    const results = [];

    // Convert temporary reservations to permanent (remove expiry)
    for (const reservation of reservations) {
      await ctx.db.patch(reservation._id, {
        status: "PaidReserved", // New status for paid reservations
        expires_at: undefined, // Remove expiry - permanent until fulfilled
        confirmed_at: Date.now(),
      });

      results.push({
        productId: reservation.product_id,
        quantityConfirmed: reservation.quantity_reserved,
        note: "Stock reserved until order fulfillment",
      });
    }

    return {
      message: "Payment reservation confirmed - stock locked until delivery",
      results,
    };
  },
});

export const fulfillStock = mutation({
  args: {
    orderReference: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all paid reserved stock for this order
    const reservations = await ctx.db
      .query("stockReservation")
      .withIndex("by_order_reference", (q) =>
        q.eq("order_reference", args.orderReference)
      )
      .filter((q) => q.eq(q.field("status"), "PaidReserved"))
      .collect();

    if (reservations.length === 0) {
      throw new Error("No paid reserved stock found for this order");
    }

    const results = [];

    for (const reservation of reservations) {
      const product = await ctx.db.get(reservation.product_id);
      if (!product) {
        throw new Error(`Product ${reservation.product_id} not found`);
      }

      await ctx.db.patch(reservation._id, {
        status: "Fulfilled",
        fulfilled_at: Date.now(),
      });

      results.push({
        productId: reservation.product_id,
        quantityFulfilled: reservation.quantity_reserved,
        note: "Stock managed by external API",
      });
    }

    return {
      message: "Stock reservation marked as fulfilled",
      results,
    };
  },
});

export const releaseStock = mutation({
  args: {
    orderReference: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all reserved stock for this order
    const reservations = await ctx.db
      .query("stockReservation")
      .withIndex("by_order_reference", (q) =>
        q.eq("order_reference", args.orderReference)
      )
      .filter((q) => q.eq(q.field("status"), "Reserved"))
      .collect();

    if (reservations.length === 0) {
      return { message: "No reserved stock found to release" };
    }

    const results = [];

    // Process each reservation
    for (const reservation of reservations) {
      // Note: Stock was never deducted from product
      // So we just mark as released without restoring quantity

      await ctx.db.patch(reservation._id, {
        status: "Released",
      });

      results.push({
        productId: reservation.product_id,
        quantityReleased: reservation.quantity_reserved,
      });
    }

    return {
      message: "Stock released successfully",
      results,
    };
  },
});

export const cleanupExpiredReservations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find expired reservations
    const expiredReservations = await ctx.db
      .query("stockReservation")
      .withIndex("by_expiry", (q) => q.lt("expires_at", now))
      .filter((q) => q.eq(q.field("status"), "Reserved"))
      .collect();

    const results = [];

    for (const reservation of expiredReservations) {
      await ctx.db.patch(reservation._id, {
        status: "Released",
      });

      results.push({
        orderReference: reservation.order_reference,
        productId: reservation.product_id,
        quantityReleased: reservation.quantity_reserved,
      });
    }

    return {
      message: `Released ${results.length} expired reservations`,
      results,
    };
  },
});

export const getAvailableStock = query({
  args: {
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    const activeReservations = await ctx.db
      .query("stockReservation")
      .withIndex("by_product", (q) => q.eq("product_id", args.productId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "Reserved"),
          q.eq(q.field("status"), "PaidReserved")
        )
      )
      .collect();

    const tempReservedQuantity = activeReservations
      .filter((r) => r.status === "Reserved")
      .reduce((sum, res) => sum + res.quantity_reserved, 0);

    const paidReservedQuantity = activeReservations
      .filter((r) => r.status === "PaidReserved")
      .reduce((sum, res) => sum + res.quantity_reserved, 0);

    const totalReserved = tempReservedQuantity + paidReservedQuantity;

    return {
      totalStock: product.quantity,
      tempReservedStock: tempReservedQuantity,
      paidReservedStock: paidReservedQuantity,
      totalReservedStock: totalReserved,
      availableStock: product.quantity - totalReserved,
    };
  },
});

export const batchReserveStock = mutation({
  args: {
    cartItems: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
    orderReference: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    successful: Array<{
      productId: any;
      quantity: number;
      status: string;
      reservation: any;
    }>;
    failed: Array<{
      productId: any;
      quantity: number;
      status: string;
      error: string;
    }>;
    totalRequested: number;
    totalReserved: number;
    totalFailed: number;
  }> => {
    const results = [];
    const errors = [];

    for (const item of args.cartItems) {
      try {
        const reservation = await ctx.runMutation(
          api.stockReservation.reserveStock,
          {
            productId: item.productId,
            quantity: item.quantity,
            orderReference: args.orderReference,
          }
        );
        results.push({
          productId: item.productId,
          quantity: item.quantity,
          status: "reserved",
          reservation,
        });
      } catch (error) {
        errors.push({
          productId: item.productId,
          quantity: item.quantity,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      successful: results,
      failed: errors,
      totalRequested: args.cartItems.length,
      totalReserved: results.length,
      totalFailed: errors.length,
    };
  },
});
