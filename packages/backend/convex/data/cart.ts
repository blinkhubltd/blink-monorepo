import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { AddToCartValidator } from "../validators";
import { getUserByClerkId } from "../auth.helpers";
import { checkVendorSchedule } from "../lib/schedule";

/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const createCartItem = mutation({
  args: { user_id: v.id("users"), item: AddToCartValidator },
  handler: async (ctx, args) => {
    // Check if the user already has a cart
    const existingCart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (existingCart) {
      // Check if the product is already in the cart
      const existingProductIndex = existingCart.products.findIndex(
        (p) => p.product === args.item.product_id
      );

      if (existingProductIndex >= 0) {
        // Product exists, update quantity
        const updatedProducts = [...existingCart.products];
        updatedProducts[existingProductIndex].quantity += args.item.quantity;

        await ctx.db.patch(existingCart._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return {
          success: true,
          message: "Cart item quantity updated",
          cartId: existingCart._id,
        };
      } else {
        // Product doesn't exist, add it to the cart
        const updatedProducts = [
          ...existingCart.products,
          {
            product: args.item.product_id,
            quantity: args.item.quantity,
          },
        ];

        await ctx.db.patch(existingCart._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return {
          success: true,
          message: "Item added to cart",
          cartId: existingCart._id,
        };
      }
    } else {
      // No cart exists, create a new one
      const cartId = await ctx.db.insert("cart", {
        user_id: args.user_id,
        products: [
          {
            product: args.item.product_id,
            quantity: args.item.quantity,
          },
        ],
        updated_at: Date.now(),
      });

      return {
        success: true,
        message: "Cart created and item added",
        cartId: cartId,
      };
    }
  },
});

/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const getCartItems = query({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    // Get the user's cart
    const cart = await ctx.db
      .query("cart")
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

    // Enrich cart items with product details
    const enrichedItems = await Promise.all(
      cart.products.map(async (cartProduct) => {
        const product = await ctx.db.get(cartProduct.product);

        if (!product) {
          return null; // Skip if product no longer exists
        }

        // Get product image URL if it exists
        let imageUrl = null;
        if (product.images && product.images.length > 0) {
          imageUrl = await ctx.storage.getUrl(product.images[0]);
        }

        return {
          product_id: product._id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          price: product.price,
          quantity: cartProduct.quantity,
          total: product.price * cartProduct.quantity,
          image: imageUrl,
          status: product.status,
          vendor_id: product.vendor_id,
          category_id: product.category_id,
          description: product.description,
        };
      })
    );

    // Filter out null items (deleted products)
    const validItems = enrichedItems.filter((item) => item !== null);

    // Calculate totals
    const totalItems = validItems.reduce(
      (sum, item) => sum + item!.quantity,
      0
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

// Update cart item quantity
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const updateCartItemQuantity = mutation({
  args: {
    user_id: v.id("users"),
    product_id: v.id("products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return { success: false, message: "Cart not found" };
    }

    const productIndex = cart.products.findIndex(
      (p) => p.product === args.product_id
    );

    if (productIndex === -1) {
      return { success: false, message: "Product not found in cart" };
    }

    const updatedProducts = [...cart.products];
    if (args.quantity <= 0) {
      // Remove item if quantity is 0 or negative
      updatedProducts.splice(productIndex, 1);
    } else {
      // Update quantity
      updatedProducts[productIndex].quantity = args.quantity;
    }

    await ctx.db.patch(cart._id, {
      products: updatedProducts,
      updated_at: Date.now(),
    });

    return {
      success: true,
      message:
        args.quantity <= 0 ? "Item removed from cart" : "Quantity updated",
    };
  },
});

// Remove item from cart
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const removeCartItem = mutation({
  args: {
    user_id: v.id("users"),
    product_id: v.id("products"),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return { success: false, message: "Cart not found" };
    }

    const updatedProducts = cart.products.filter(
      (p) => p.product !== args.product_id
    );

    await ctx.db.patch(cart._id, {
      products: updatedProducts,
      updated_at: Date.now(),
    });

    return { success: true, message: "Item removed from cart" };
  },
});

// Clear entire cart
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const clearCart = mutation({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return { success: false, message: "Cart not found" };
    }

    await ctx.db.patch(cart._id, {
      products: [],
      updated_at: Date.now(),
    });

    return { success: true, message: "Cart cleared successfully" };
  },
});

// Get cart count (total number of items)
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const getCartCount = query({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return { count: 0 };
    }

    const totalCount = cart.products.reduce(
      (sum, product) => sum + product.quantity,
      0
    );

    return { count: totalCount };
  },
});

// Check if product is in cart
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const isProductInCart = query({
  args: {
    user_id: v.id("users"),
    product_id: v.id("products"),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart) {
      return { inCart: false, quantity: 0 };
    }

    const product = cart.products.find((p) => p.product === args.product_id);

    return {
      inCart: !!product,
      quantity: product?.quantity || 0,
    };
  },
});

// Merge cart (useful for guest to user cart migration)
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const mergeCart = mutation({
  args: {
    user_id: v.id("users"),
    items: v.array(
      v.object({
        product_id: v.id("products"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Get existing cart
    const existingCart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (existingCart) {
      // Merge with existing cart
      const existingProducts = [...existingCart.products];

      for (const newItem of args.items) {
        const existingIndex = existingProducts.findIndex(
          (p) => p.product === newItem.product_id
        );

        if (existingIndex >= 0) {
          // Add to existing quantity
          existingProducts[existingIndex].quantity += newItem.quantity;
        } else {
          // Add new product
          existingProducts.push({
            product: newItem.product_id,
            quantity: newItem.quantity,
          });
        }
      }

      await ctx.db.patch(existingCart._id, {
        products: existingProducts,
        updated_at: Date.now(),
      });

      return { success: true, message: "Cart merged successfully" };
    } else {
      // Create new cart
      const cartId = await ctx.db.insert("cart", {
        user_id: args.user_id,
        products: args.items.map((item) => ({
          product: item.product_id,
          quantity: item.quantity,
        })),
        updated_at: Date.now(),
      });

      return { success: true, message: "Cart created and items added" };
    }
  },
});

// Get cart summary (for checkout)
// Clerk ID wrapper for createCartItem
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const createCartItemByClerkId = mutation({
  args: {
    clerkId: v.string(),
    productId: v.id("products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);

    // Check if the user already has a cart
    const existingCart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (existingCart) {
      // Check if the product is already in the cart
      const existingProductIndex = existingCart.products.findIndex(
        (p) => p.product === args.productId
      );

      if (existingProductIndex >= 0) {
        // Product exists, update quantity
        const updatedProducts = [...existingCart.products];
        updatedProducts[existingProductIndex].quantity += args.quantity;

        await ctx.db.patch(existingCart._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return {
          success: true,
          message: "Cart item quantity updated",
          cartId: existingCart._id,
        };
      } else {
        // Product doesn't exist, add it to the cart
        const updatedProducts = [
          ...existingCart.products,
          {
            product: args.productId,
            quantity: args.quantity,
          },
        ];

        await ctx.db.patch(existingCart._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return {
          success: true,
          message: "Item added to cart",
          cartId: existingCart._id,
        };
      }
    } else {
      // No cart exists, create a new one
      const cartId = await ctx.db.insert("cart", {
        user_id: user._id,
        products: [
          {
            product: args.productId,
            quantity: args.quantity,
          },
        ],
        updated_at: Date.now(),
      });

      return {
        success: true,
        message: "Cart created and item added",
        cartId: cartId,
      };
    }
  },
});

// Clerk ID wrapper for getCartItems
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const getCartItemsByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);

    // Get user's cart
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (!cart || cart.products.length === 0) {
      return {
        success: true,
        cart: null,
        items: [],
        totalItems: 0,
        totalAmount: 0,
      };
    }

    // Enrich cart items with product details
    const enrichedItems = await Promise.all(
      cart.products.map(async (cartProduct) => {
        const product = await ctx.db.get(cartProduct.product);
        if (!product) return null;

        // Process image URLs
        let image = null;
        if (product.images && product.images.length > 0) {
          image = await ctx.storage.getUrl(product.images[0]);
        }

        return {
          _id: cartProduct.product,
          product: {
            ...product,
            image,
          },
          quantity: cartProduct.quantity,
          subtotal: product.price * cartProduct.quantity,
        };
      })
    );

    // Filter out null items (products that no longer exist)
    const validItems = enrichedItems.filter((item) => item !== null);

    const totalItems = validItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = validItems.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );

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

// Paginated version for cart items
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const getCartItemsByClerkIdPaginated = query({
  args: {
    clerkId: v.string(),
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    const limit = Math.max(1, Math.min(50, args.limit));

    // Get user's cart
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (!cart || cart.products.length === 0) {
      return {
        data: [],
        pagination: {
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          cursor: null,
        },
        totalItems: 0,
        totalAmount: 0,
      };
    }

    // For pagination, we need to paginate the cart products array
    const startIndex = args.cursor ? parseInt(args.cursor) : 0;
    const endIndex = startIndex + limit;
    const paginatedProducts = cart.products.slice(startIndex, endIndex);

    // Enrich cart items with product details
    const enrichedItems = await Promise.all(
      paginatedProducts.map(async (cartProduct) => {
        const product = await ctx.db.get(cartProduct.product);
        if (!product) return null;

        // Process image URLs
        const images = await Promise.all(
          (product.images || []).map(async (imageId) => {
            return await ctx.storage.getUrl(imageId);
          })
        );

        const subtotal = product.price * cartProduct.quantity;

        return {
          _id: product._id,
          name: product.name,
          price: product.price,
          quantity: cartProduct.quantity,
          subtotal,
          images,
          product: {
            ...product,
            images,
          },
        };
      })
    );

    const validItems = enrichedItems.filter((item) => item !== null);
    const totalItems = validItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = validItems.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );

    const hasNext = endIndex < cart.products.length;
    const nextCursor = hasNext ? endIndex.toString() : null;

    return {
      data: validItems,
      pagination: {
        limit,
        total: cart.products.length,
        totalPages: Math.ceil(cart.products.length / limit),
        hasNext,
        cursor: nextCursor,
      },
      totalItems,
      totalAmount,
    };
  },
});

/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const getCartSummary = query({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart || cart.products.length === 0) {
      return {
        success: true,
        isEmpty: true,
        totalItems: 0,
        subtotal: 0,
        tax: 0,
        deliveryFee: 0,
        total: 0,
        items: [],
      };
    }

    // Calculate summary with product details
    const items = await Promise.all(
      cart.products.map(async (cartProduct) => {
        const product = await ctx.db.get(cartProduct.product);
        if (!product) return null;

        return {
          name: product.name,
          quantity: cartProduct.quantity,
          price: product.price,
          total: product.price * cartProduct.quantity,
        };
      })
    );

    const validItems = items.filter((item) => item !== null);
    const subtotal = validItems.reduce((sum, item) => sum + item!.total, 0);
    const totalItems = validItems.reduce(
      (sum, item) => sum + item!.quantity,
      0
    );

    // Calculate fees (you can customize these calculations)
    const taxRate = 0.0; // 0% tax for now
    const tax = subtotal * taxRate;
    const deliveryFee = subtotal >= 2000 ? 0 : 250; // Free delivery over KES 2000
    const total = subtotal + tax + deliveryFee;

    return {
      success: true,
      isEmpty: false,
      totalItems,
      subtotal,
      tax,
      deliveryFee,
      total,
      items: validItems,
    };
  },
});

// Clerk ID wrapper for getCartCount
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const getCartCountByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);

      const cart = await ctx.db
        .query("cart")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .first();

      if (!cart) {
        return { count: 0 };
      }

      const totalCount = cart.products.reduce(
        (sum, product) => sum + product.quantity,
        0
      );

      return { count: totalCount };
    } catch (error) {
      return { count: 0 };
    }
  },
});

// Clerk ID wrapper for clearCart
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const clearCartByClerkId = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (!cart) {
      return { success: false, message: "Cart not found" };
    }
    await ctx.db.patch(cart._id, { products: [], updated_at: Date.now() });
    return { success: true, message: "Cart cleared" };
  },
});

// Clerk ID wrapper for updateCartItemQuantity
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const updateCartItemQuantityByClerkId = mutation({
  args: {
    clerkId: v.string(),
    productId: v.id("products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);

      const cart = await ctx.db
        .query("cart")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .first();

      if (!cart) {
        return { success: false, message: "Cart not found" };
      }

      const productIndex = cart.products.findIndex(
        (p) => p.product === args.productId
      );

      if (productIndex === -1) {
        return { success: false, message: "Product not found in cart" };
      }

      if (args.quantity <= 0) {
        // Remove item if quantity is 0 or less
        const updatedProducts = cart.products.filter(
          (p) => p.product !== args.productId
        );

        await ctx.db.patch(cart._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return { success: true, message: "Item removed from cart" };
      }

      // Update quantity
      const updatedProducts = [...cart.products];
      updatedProducts[productIndex].quantity = args.quantity;

      await ctx.db.patch(cart._id, {
        products: updatedProducts,
        updated_at: Date.now(),
      });

      return { success: true, message: "Quantity updated" };
    } catch (error) {
      return { success: false, message: "Failed to update quantity" };
    }
  },
});

// Clerk ID wrapper for removeCartItem
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const removeCartItemByClerkId = mutation({
  args: {
    clerkId: v.string(),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);

      const cart = await ctx.db
        .query("cart")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .first();

      if (!cart) {
        return { success: false, message: "Cart not found" };
      }

      const updatedProducts = cart.products.filter(
        (p) => p.product !== args.productId
      );

      await ctx.db.patch(cart._id, {
        products: updatedProducts,
        updated_at: Date.now(),
      });

      return { success: true, message: "Item removed from cart" };
    } catch (error) {
      return { success: false, message: "Failed to remove item" };
    }
  },
});

// Get cart items in format for stock reservation
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const getCartItemsForStockReservation = query({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!cart || cart.products.length === 0) {
      return [];
    }

    // Return cart items in the format expected by stock reservation
    return cart.products.map((item) => ({
      productId: item.product,
      quantity: item.quantity,
    }));
  },
});

// Clerk ID wrapper for getCartItemsForStockReservation
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const getCartItemsForStockReservationByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);

      const cart = await ctx.db
        .query("cart")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .first();

      if (!cart || cart.products.length === 0) {
        return [];
      }

      // Return cart items in the format expected by stock reservation
      return cart.products.map((item) => ({
        productId: item.product,
        quantity: item.quantity,
      }));
    } catch (error) {
      console.error("Failed to get cart items for stock reservation:", error);
      return [];
    }
  },
});

// Validate cart items against vendor schedules
/**
 * @deprecated Accepts a caller-supplied `clerkId` / `user_id` as an ARGUMENT
 * rather than deriving identity from `ctx.auth.getUserIdentity()`, so any client
 * can read or mutate any customer's basket. apps/shop uses the auth-derived API
 * at the bottom of this file instead. Retained only until the standalone
 * blink-ecommerce app is retired.
 */
export const validateCartSchedule = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);

      const cart = await ctx.db
        .query("cart")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .first();

      if (!cart || cart.products.length === 0) {
        return {
          success: true,
          canProceed: true,
          nonOperationalVendors: [],
          tooCloseToClosing: [],
        };
      }


      // Group products by vendor and check schedules
      const vendorProductsMap = new Map<
        string,
        {
          vendor: any;
          products: any[];
          scheduleCheck: any;
        }
      >();

      for (const cartItem of cart.products) {
        const product = await ctx.db.get(cartItem.product);
        if (!product || !product.vendor_id) continue;

        const vendor = await ctx.db.get(product.vendor_id);
        if (!vendor) continue;

        const vendorKey = vendor._id;

        if (!vendorProductsMap.has(vendorKey)) {
          // Check vendor schedule
          const scheduleCheck = checkVendorSchedule(vendor.schedule);

          vendorProductsMap.set(vendorKey, {
            vendor,
            products: [],
            scheduleCheck,
          });
        }

        // Add product to vendor's list
        const vendorData = vendorProductsMap.get(vendorKey)!;

        // Get product image
        let imageUrl = null;
        if (product.images && product.images.length > 0) {
          imageUrl = await ctx.storage.getUrl(product.images[0]);
        }

        vendorData.products.push({
          _id: product._id,
          name: product.name,
          price: product.price,
          quantity: cartItem.quantity,
          image: imageUrl,
        });
      }

      // Categorize vendors
      const nonOperationalVendors: any[] = [];
      const tooCloseToClosing: any[] = [];

      for (const [vendorId, data] of vendorProductsMap.entries()) {
        const vendorInfo = {
          vendorId,
          vendorName: data.vendor.name,
          products: data.products,
          scheduleCheck: data.scheduleCheck,
        };

        if (data.scheduleCheck.isTooClose) {
          tooCloseToClosing.push(vendorInfo);
        } else if (!data.scheduleCheck.isOperational) {
          nonOperationalVendors.push(vendorInfo);
        }
      }

      // Determine if checkout can proceed
      const canProceed = tooCloseToClosing.length === 0;

      return {
        success: true,
        canProceed,
        nonOperationalVendors,
        tooCloseToClosing,
        message: !canProceed
          ? "Some vendors are too close to closing time. Orders cannot be placed within 20 minutes of closing."
          : nonOperationalVendors.length > 0
            ? "Some vendors are currently closed. Products will be delivered in the morning."
            : "All vendors are operational",
      };
    } catch (error) {
      console.error("Failed to validate cart schedule:", error);
      return {
        success: false,
        canProceed: false,
        nonOperationalVendors: [],
        tooCloseToClosing: [],
        message: "Failed to validate vendor schedules",
      };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth-derived cart API — what apps/shop uses.
//
// Everything above takes the caller's identity as an ARGUMENT: either a
// `user_id` or a `clerkId` passed straight to `getUserByClerkId`. Convex
// exposes these publicly, so any client can read or mutate ANY customer's
// basket by supplying somebody else's id. That is an IDOR, and the shape of the
// argument list is what invites it.
//
// The functions below derive identity from `ctx.auth.getUserIdentity()` and take
// no actor argument at all. `clerkId` is not accepted-and-ignored, because an
// ignored parameter invites a future change to start honouring it.
//
// The older functions stay only until the standalone blink-ecommerce app
// retires, and are tagged @deprecated where they are declared.
// ─────────────────────────────────────────────────────────────────────────────

/** The signed-in caller's user row, or null when signed out. */
async function callerUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .first();
}

/**
 * The caller's own basket.
 *
 * Returns an empty basket rather than throwing when signed out, so the shop's
 * single CartProvider can call it unconditionally: browsing is legal for guests
 * and a throw here would surface as a broken screen rather than an empty
 * basket.
 */
export const getMyCart = query({
  args: {},
  handler: async (ctx) => {
    const user = await callerUser(ctx);
    if (!user) return { products: [] as { product: Id<"products">; quantity: number }[] };

    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    return { products: cart?.products ?? [] };
  },
});

/**
 * Set one line to an absolute quantity. Zero removes it.
 *
 * Absolute rather than a delta on purpose: a stepper that sends "+1" twice
 * because of a double tap adds two, whereas an absolute set is idempotent and
 * the UI already knows the number it wants.
 */
export const setMyCartLine = mutation({
  args: { productId: v.id("products"), quantity: v.number() },
  handler: async (ctx, args) => {
    const user = await callerUser(ctx);
    if (!user) throw new ConvexError("Unauthorized");

    const quantity = Math.max(0, Math.floor(args.quantity));

    // Never let the basket exceed what the shop has, and never let an inactive
    // product in. Checked here rather than only in the client so the cart and
    // the order cannot disagree.
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("Product not found");
    if (quantity > 0 && product.status !== "Active") {
      throw new ConvexError("This product is not available");
    }
    const capped = Math.min(quantity, product.quantity);

    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (!cart) {
      if (capped === 0) return { ok: true };
      await ctx.db.insert("cart", {
        user_id: user._id,
        products: [{ product: args.productId, quantity: capped }],
        updated_at: Date.now(),
      });
      return { ok: true };
    }

    const others = cart.products.filter((p) => p.product !== args.productId);
    const products =
      capped === 0
        ? others
        : [...others, { product: args.productId, quantity: capped }];

    await ctx.db.patch(cart._id, { products, updated_at: Date.now() });
    return { ok: true };
  },
});

export const clearMyCart = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await callerUser(ctx);
    if (!user) throw new ConvexError("Unauthorized");

    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (cart) await ctx.db.patch(cart._id, { products: [], updated_at: Date.now() });
    return { ok: true };
  },
});

/**
 * Fold a guest basket into the caller's own on sign-in.
 *
 * Takes the LARGER quantity per product rather than summing. Summing is the
 * intuitive choice and the wrong one: someone who put two of something in the
 * basket on their phone, signed in, and had two already saved did not ask for
 * four. Taking the maximum preserves intent in the common case and never
 * inflates an order.
 *
 * Idempotent by construction, which matters because a Clerk token refresh can
 * re-trigger the client's sign-in effect.
 */
export const mergeIntoMyCart = mutation({
  args: {
    items: v.array(
      v.object({ product: v.id("products"), quantity: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await callerUser(ctx);
    if (!user) throw new ConvexError("Unauthorized");

    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    const merged = new Map<string, number>();
    for (const line of cart?.products ?? []) {
      merged.set(line.product, line.quantity);
    }
    for (const line of args.items) {
      const quantity = Math.max(0, Math.floor(line.quantity));
      if (quantity === 0) continue;
      merged.set(line.product, Math.max(merged.get(line.product) ?? 0, quantity));
    }

    // Drop anything that is no longer sellable, and cap to available stock.
    // A guest basket can be days old.
    const products: { product: Id<"products">; quantity: number }[] = [];
    for (const [productId, quantity] of merged) {
      const product = await ctx.db.get(productId as Id<"products">);
      if (!product || product.status !== "Active" || product.quantity <= 0) continue;
      products.push({
        product: productId as Id<"products">,
        quantity: Math.min(quantity, product.quantity),
      });
    }

    if (cart) {
      await ctx.db.patch(cart._id, { products, updated_at: Date.now() });
    } else if (products.length > 0) {
      await ctx.db.insert("cart", {
        user_id: user._id,
        products,
        updated_at: Date.now(),
      });
    }

    return { ok: true, lines: products.length };
  },
});
