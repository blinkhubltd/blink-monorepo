import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

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
