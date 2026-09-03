import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUser, getAuthUserOrNull } from "../auth.helpers";

/**
 * @deprecated Takes `user_id` as an argument rather than deriving it from the
 * auth token, so any client can act on any customer's clearance basket. Use
 * `getMyClearanceCart`.
 */
export const getCart = query({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return {
        success: true,
        cart: null,
        items: [],
        totalItems: 0,
        totalAmount: 0,
      };
    }

    // Enrich cart items with clearance product details
    const enrichedItems = await Promise.all(
      cart.items.map(async (cartItem) => {
        const product = await ctx.db.get(cartItem.clearance_product_id);
        if (!product) return null;

        let imageUrl: string | null = null;
        if (product.images && product.images.length > 0) {
          imageUrl = await ctx.storage.getUrl(product.images[0]);
        }

        const vendor = await ctx.db.get(product.vendor_id);
        let vendorImageUrl: string | null = null;
        if (vendor?.image) {
          vendorImageUrl = await ctx.storage.getUrl(vendor.image);
        }

        return {
          clearance_product_id: product._id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          original_price: product.original_price,
          clearance_price: product.clearance_price,
          discount_percentage: product.discount_percentage,
          quantity: cartItem.quantity,
          available_quantity: product.quantity,
          total: product.clearance_price * cartItem.quantity,
          image: imageUrl,
          status: product.status,
          vendor_id: product.vendor_id,
          vendor_name: vendor?.name ?? null,
          vendor_image: vendorImageUrl,
          category_id: product.category_id,
          description: product.description,
          expiry_date: product.expiry_date,
        };
      }),
    );

    const validItems = enrichedItems.filter((item) => item !== null);

    const totalItems = validItems.reduce(
      (sum, item) => sum + item!.quantity,
      0,
    );
    const totalAmount = validItems.reduce((sum, item) => sum + item!.total, 0);

    return {
      success: true,
      cart: {
        _id: cart._id,
        user_id: cart.user_id,
        updated_at: cart.updated_at,
      },
      items: validItems,
      totalItems,
      totalAmount,
    };
  },
});

/**
 * @deprecated Takes `user_id` as an argument rather than deriving it from the
 * auth token, so any client can act on any customer's clearance basket. Use
 * `setMyClearanceLine`.
 */
export const addToCart = mutation({
  args: {
    user_id: v.id("users"),
    clearance_product_id: v.id("clearance_products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    // Validate product
    const product = await ctx.db.get(args.clearance_product_id);
    if (!product) {
      return { success: false, message: "Clearance product not found" };
    }
    if (product.status !== "Active") {
      return { success: false, message: "Product is no longer available" };
    }
    if (product.quantity < args.quantity) {
      return { success: false, message: "Insufficient stock" };
    }
    if (product.display_end_date <= Date.now()) {
      return { success: false, message: "Product listing has expired" };
    }

    const existingCart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (existingCart) {
      const existingIndex = existingCart.items.findIndex(
        (item) => item.clearance_product_id === args.clearance_product_id,
      );

      if (existingIndex >= 0) {
        const newQty =
          existingCart.items[existingIndex].quantity + args.quantity;
        if (newQty > product.quantity) {
          return {
            success: false,
            message: "Insufficient stock for requested quantity",
          };
        }
        const updatedItems = [...existingCart.items];
        updatedItems[existingIndex].quantity = newQty;

        await ctx.db.patch(existingCart._id, {
          items: updatedItems,
          updated_at: Date.now(),
        });

        return {
          success: true,
          message: "Cart item quantity updated",
          cartId: existingCart._id,
        };
      } else {
        const updatedItems = [
          ...existingCart.items,
          {
            clearance_product_id: args.clearance_product_id,
            quantity: args.quantity,
          },
        ];

        await ctx.db.patch(existingCart._id, {
          items: updatedItems,
          updated_at: Date.now(),
        });

        return {
          success: true,
          message: "Item added to clearance cart",
          cartId: existingCart._id,
        };
      }
    } else {
      const cartId = await ctx.db.insert("clearance_cart", {
        user_id: args.user_id,
        items: [
          {
            clearance_product_id: args.clearance_product_id,
            quantity: args.quantity,
          },
        ],
        updated_at: Date.now(),
      });

      return {
        success: true,
        message: "Clearance cart created and item added",
        cartId,
      };
    }
  },
});

/**
 * @deprecated Takes `user_id` as an argument rather than deriving it from the
 * auth token, so any client can act on any customer's clearance basket. Use
 * `setMyClearanceLine`.
 */
export const updateQuantity = mutation({
  args: {
    user_id: v.id("users"),
    clearance_product_id: v.id("clearance_products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return { success: false, message: "Cart not found" };
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.clearance_product_id === args.clearance_product_id,
    );

    if (itemIndex === -1) {
      return { success: false, message: "Product not found in cart" };
    }

    // Validate stock
    if (args.quantity > 0) {
      const product = await ctx.db.get(args.clearance_product_id);
      if (product && args.quantity > product.quantity) {
        return { success: false, message: "Insufficient stock" };
      }
    }

    const updatedItems = [...cart.items];
    if (args.quantity <= 0) {
      updatedItems.splice(itemIndex, 1);
    } else {
      updatedItems[itemIndex].quantity = args.quantity;
    }

    await ctx.db.patch(cart._id, {
      items: updatedItems,
      updated_at: Date.now(),
    });

    return {
      success: true,
      message:
        args.quantity <= 0 ? "Item removed from cart" : "Quantity updated",
    };
  },
});

/**
 * @deprecated Takes `user_id` as an argument rather than deriving it from the
 * auth token, so any client can act on any customer's clearance basket. Use
 * `setMyClearanceLine with quantity 0`.
 */
export const removeFromCart = mutation({
  args: {
    user_id: v.id("users"),
    clearance_product_id: v.id("clearance_products"),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return { success: false, message: "Cart not found" };
    }

    const updatedItems = cart.items.filter(
      (item) => item.clearance_product_id !== args.clearance_product_id,
    );

    await ctx.db.patch(cart._id, {
      items: updatedItems,
      updated_at: Date.now(),
    });

    return { success: true, message: "Item removed from clearance cart" };
  },
});

/**
 * @deprecated Takes `user_id` as an argument rather than deriving it from the
 * auth token, so any client can act on any customer's clearance basket. Use
 * `clearMyClearanceCart`.
 */
export const clearCart = mutation({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return { success: true, message: "No cart to clear" };
    }

    await ctx.db.patch(cart._id, {
      items: [],
      updated_at: Date.now(),
    });

    return { success: true, message: "Clearance cart cleared" };
  },
});

// ── The caller's own clearance basket ─────────────────────────────────────
//
// All five functions above take `user_id: v.id("users")` as an argument and are
// public, so any caller could read, fill, empty or edit another customer's
// clearance basket. Same class as the regular cart IDOR, closed the same way.
//
// The writes below are ABSOLUTE, not deltas. `addToCart` adds to whatever is
// there, so a screen that sends the quantity it is displaying turns a line of 5
// into a line of 10 — the double-count defect the regular basket had, in the
// same shape.

/** As many distinct listings as one clearance basket may hold. */
const MAX_CLEARANCE_LINES = 50;

/**
 * The caller's clearance basket, priced from current listings.
 *
 * Every figure is read from the `clearance_products` row, never from the basket
 * document: a clearance listing has an expiry and a display window, so a price
 * remembered from when it was added is a price that may no longer be offered.
 *
 * Lines whose listing has expired, sold out or been deactivated are returned
 * with `sellable: false` rather than dropped, so the screen can say what
 * happened instead of the item silently vanishing.
 */
export const getMyClearanceCart = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getAuthUserOrNull(ctx);
    if (!caller) return { items: [], itemCount: 0, subtotal: 0 };

    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", caller.user._id))
      .first();
    if (!cart) return { items: [], itemCount: 0, subtotal: 0 };

    const now = Date.now();

    const items = (
      await Promise.all(
        cart.items.slice(0, MAX_CLEARANCE_LINES).map(async (entry) => {
          const product = await ctx.db.get(entry.clearance_product_id);
          if (!product) return null;

          const vendor = await ctx.db.get(product.vendor_id);
          const images = await Promise.all(
            (product.images ?? []).map((id) => ctx.storage.getUrl(id)),
          );

          const expired = product.display_end_date <= now;
          const sellable =
            product.status === "Active" && product.quantity > 0 && !expired;

          return {
            clearanceProductId: product._id,
            name: product.name,
            sku: product.sku,
            originalPrice: product.original_price,
            clearancePrice: product.clearance_price,
            discountPercentage: product.discount_percentage,
            quantity: entry.quantity,
            available: product.quantity,
            lineTotal: product.clearance_price * entry.quantity,
            imageUrl: images.find((u): u is string => !!u) ?? null,
            vendorId: product.vendor_id,
            vendorName: vendor?.name ?? null,
            expiryDate: product.expiry_date,
            displayEndDate: product.display_end_date,
            sellable,
            /** Why it cannot be bought, when it cannot. */
            unavailableReason: sellable
              ? null
              : expired
                ? "This deal has ended"
                : product.quantity <= 0
                  ? "Sold out"
                  : "No longer available",
          };
        }),
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null);

    const sellable = items.filter((i) => i.sellable);

    return {
      items,
      // Counts and totals cover only what can actually be bought, so the figure
      // on the basket button matches what checkout will charge.
      itemCount: sellable.reduce((sum, i) => sum + i.quantity, 0),
      subtotal: sellable.reduce(
        (sum, i) => sum + i.clearancePrice * Math.min(i.quantity, i.available),
        0,
      ),
    };
  },
});

/**
 * Set the quantity of one clearance line, absolutely.
 *
 * Zero removes it. Validated against the listing rather than trusted: status,
 * stock and the display window are all checked here, so a client that skips its
 * own checks cannot put an expired deal in a basket.
 */
export const setMyClearanceLine = mutation({
  args: {
    clearanceProductId: v.id("clearance_products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    if (!Number.isInteger(args.quantity) || args.quantity < 0) {
      throw new ConvexError("Quantity must be a whole number.");
    }

    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    const now = Date.now();

    if (args.quantity === 0) {
      if (!cart) return { quantity: 0 };
      const items = cart.items.filter(
        (i) => i.clearance_product_id !== args.clearanceProductId,
      );
      await ctx.db.patch(cart._id, { items, updated_at: now });
      return { quantity: 0 };
    }

    const product = await ctx.db.get(args.clearanceProductId);
    if (!product) throw new ConvexError("That deal no longer exists.");
    if (product.status !== "Active") {
      throw new ConvexError("That deal is no longer available.");
    }
    if (product.display_end_date <= now) {
      throw new ConvexError("That deal has ended.");
    }
    if (product.quantity <= 0) throw new ConvexError("That deal is sold out.");

    // Capped rather than rejected: a customer asking for more than is left gets
    // what is left, and sees the reduced number.
    const quantity = Math.min(args.quantity, product.quantity);

    if (!cart) {
      await ctx.db.insert("clearance_cart", {
        user_id: user._id,
        items: [
          { clearance_product_id: args.clearanceProductId, quantity },
        ],
        updated_at: now,
      });
      return { quantity, capped: quantity !== args.quantity };
    }

    const existing = cart.items.findIndex(
      (i) => i.clearance_product_id === args.clearanceProductId,
    );

    if (existing === -1 && cart.items.length >= MAX_CLEARANCE_LINES) {
      throw new ConvexError(
        `A clearance basket holds at most ${MAX_CLEARANCE_LINES} different deals.`,
      );
    }

    const items = [...cart.items];
    if (existing >= 0) {
      items[existing] = {
        clearance_product_id: args.clearanceProductId,
        quantity,
      };
    } else {
      items.push({
        clearance_product_id: args.clearanceProductId,
        quantity,
      });
    }

    await ctx.db.patch(cart._id, { items, updated_at: now });
    return { quantity, capped: quantity !== args.quantity };
  },
});

/** Empty the caller's clearance basket. */
export const clearMyClearanceCart = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await getAuthUser(ctx);
    const cart = await ctx.db
      .query("clearance_cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (cart) {
      await ctx.db.patch(cart._id, { items: [], updated_at: Date.now() });
    }
    return { cleared: true };
  },
});
