import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { getImageUrl } from "./files";
import { getAuthUser, getUserByClerkId } from "../auth.helpers";

// Clerk ID wrapper for toggleWishList
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `toggleMyWishlistItem`. Retained only until the standalone app retires.
 */
export const toggleWishListByClerkId = mutation({
  args: {
    clerkId: v.string(),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);

    // Check if user has a wishlist
    const existingWishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (existingWishlist) {
      // Check if product is in wishlist
      const productIndex = existingWishlist.products.indexOf(args.productId);

      if (productIndex >= 0) {
        // Product exists, remove it
        const updatedProducts = existingWishlist.products.filter(
          (id) => id !== args.productId
        );

        await ctx.db.patch(existingWishlist._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return {
          success: true,
          message: "Product removed from wishlist",
          isInWishlist: false,
        };
      } else {
        // Product doesn't exist, add it
        const updatedProducts = [...existingWishlist.products, args.productId];

        await ctx.db.patch(existingWishlist._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return {
          success: true,
          message: "Product added to wishlist",
          isInWishlist: true,
        };
      }
    } else {
      // No wishlist exists, create one with the product
      await ctx.db.insert("wishlist", {
        user_id: user._id,
        products: [args.productId],
        updated_at: Date.now(),
      });

      return {
        success: true,
        message: "Wishlist created and product added",
        isInWishlist: true,
      };
    }
  },
});

// Clerk ID wrapper for isProductInWishList
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `getMyWishlist`. Retained only until the standalone app retires.
 */
export const isProductInWishListByClerkId = query({
  args: {
    clerkId: v.string(),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);

    const wishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (!wishlist) {
      return false;
    }

    return wishlist.products.includes(args.productId);
  },
});

// Clerk ID wrapper for getWishList
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `getMyWishlist`. Retained only until the standalone app retires.
 */
export const getWishListByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);

      const wishlist = await ctx.db
        .query("wishlist")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .first();

      if (!wishlist || wishlist.products.length === 0) {
        return {
          success: true,
          wishlist: null,
          items: [],
          totalItems: 0,
        };
      }

      // Enrich wishlist items with product details
      const enrichedItems = await Promise.all(
        wishlist.products.map(async (productId) => {
          const product = await ctx.db.get(productId);
          if (!product) return null;

          // Process image URLs
          let image = null;
          if (product.images && product.images.length > 0) {
            image = await ctx.storage.getUrl(product.images[0]);
          }

          return {
            _id: productId,
            product: {
              ...product,
              image,
            },
          };
        })
      );

      // Filter out null items (products that no longer exist)
      const validItems = enrichedItems.filter((item) => item !== null);

      return {
        success: true,
        wishlist: {
          _id: wishlist._id,
          user_id: wishlist.user_id,
          updated_at: wishlist.updated_at,
        },
        items: validItems,
        totalItems: validItems.length,
      };
    } catch (error) {
      return {
        success: true,
        wishlist: null,
        items: [],
        totalItems: 0,
      };
    }
  },
});

// Paginated version for wishlist items
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `getMyWishlist`. Retained only until the standalone app retires.
 */
export const getWishListByClerkIdPaginated = query({
  args: {
    clerkId: v.string(),
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getUserByClerkId(ctx, args.clerkId);
      const limit = Math.max(1, Math.min(50, args.limit));

      const wishlist = await ctx.db
        .query("wishlist")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .first();

      if (!wishlist || wishlist.products.length === 0) {
        return {
          data: [],
          pagination: {
            limit: args.limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            cursor: null,
          },
          totalItems: 0,
        };
      }

      // For pagination, we need to paginate the wishlist products array
      const startIndex = args.cursor ? parseInt(args.cursor) : 0;
      const endIndex = startIndex + limit;
      const paginatedProducts = wishlist.products.slice(startIndex, endIndex);

      // Enrich wishlist items with product details
      const enrichedItems = await Promise.all(
        paginatedProducts.map(async (productId) => {
          const product = await ctx.db.get(productId);
          if (!product) return null;

          // Process image URLs
          let image = null;
          if (product.images && product.images.length > 0) {
            image = await ctx.storage.getUrl(product.images[0]);
          }

          return {
            _id: productId,
            product: {
              ...product,
              image,
            },
            added_at: wishlist._creationTime,
          };
        })
      );

      const validItems = enrichedItems.filter((item) => item !== null);
      const hasNext = endIndex < wishlist.products.length;
      const nextCursor = hasNext ? endIndex.toString() : null;

      return {
        data: validItems,
        pagination: {
          limit,
          total: wishlist.products.length,
          totalPages: Math.ceil(wishlist.products.length / limit),
          hasNext,
          cursor: nextCursor,
        },
        totalItems: validItems.length,
      };
    } catch (error) {
      return {
        data: [],
        pagination: {
          limit: args.limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          cursor: null,
        },
        totalItems: 0,
      };
    }
  },
});

// Add product to wishlist
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `toggleMyWishlistItem`. Retained only until the standalone app retires.
 */
export const addToWishList = mutation({
  args: {
    user_id: v.id("users"),
    product_id: v.id("products"),
  },
  handler: async (ctx, args) => {
    // Check if user has a wishlist
    const existingWishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (existingWishlist) {
      // Check if product is already in wishlist
      const productExists = existingWishlist.products.includes(args.product_id);

      if (productExists) {
        return {
          success: false,
          message: "Product already in wishlist",
        };
      }

      // Add product to existing wishlist
      const updatedProducts = [...existingWishlist.products, args.product_id];

      await ctx.db.patch(existingWishlist._id, {
        products: updatedProducts,
        updated_at: Date.now(),
      });

      return {
        success: true,
        message: "Product added to wishlist",
        wishlistId: existingWishlist._id,
      };
    } else {
      // Create new wishlist with product
      const wishlistId = await ctx.db.insert("wishlist", {
        user_id: args.user_id,
        products: [args.product_id],
        updated_at: Date.now(),
      });

      return {
        success: true,
        message: "Wishlist created and product added",
        wishlistId: wishlistId,
      };
    }
  },
});

// Remove product from wishlist
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `removeFromMyWishlist`. Retained only until the standalone app retires.
 */
export const removeFromWishList = mutation({
  args: {
    user_id: v.id("users"),
    product_id: v.id("products"),
  },
  handler: async (ctx, args) => {
    const wishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!wishlist) {
      return {
        success: false,
        message: "Wishlist not found",
      };
    }

    // Filter out the product
    const updatedProducts = wishlist.products.filter(
      (productId) => productId !== args.product_id
    );

    await ctx.db.patch(wishlist._id, {
      products: updatedProducts,
      updated_at: Date.now(),
    });

    return {
      success: true,
      message: "Product removed from wishlist",
    };
  },
});

// Toggle product in wishlist (add if not present, remove if present)
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `toggleMyWishlistItem`. Retained only until the standalone app retires.
 */
export const toggleWishList = mutation({
  args: {
    user_id: v.id("users"),
    product_id: v.id("products"),
  },
  handler: async (ctx, args) => {
    const wishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (wishlist) {
      const productExists = wishlist.products.includes(args.product_id);

      if (productExists) {
        // Remove from wishlist
        const updatedProducts = wishlist.products.filter(
          (productId) => productId !== args.product_id
        );

        await ctx.db.patch(wishlist._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return {
          success: true,
          inWishlist: false,
          message: "Product removed from wishlist",
        };
      } else {
        // Add to wishlist
        const updatedProducts = [...wishlist.products, args.product_id];

        await ctx.db.patch(wishlist._id, {
          products: updatedProducts,
          updated_at: Date.now(),
        });

        return {
          success: true,
          inWishlist: true,
          message: "Product added to wishlist",
        };
      }
    } else {
      // Create new wishlist with product
      const wishlistId = await ctx.db.insert("wishlist", {
        user_id: args.user_id,
        products: [args.product_id],
        updated_at: Date.now(),
      });

      return {
        success: true,
        inWishlist: true,
        message: "Wishlist created and product added",
        wishlistId: wishlistId,
      };
    }
  },
});

// Get user's wishlist with product details
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `getMyWishlist`. Retained only until the standalone app retires.
 */
export const getWishList = query({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const wishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!wishlist || wishlist.products.length === 0) {
      return {
        success: true,
        wishlist: null,
        items: [],
        totalItems: 0,
      };
    }

    // Enrich wishlist items with product details
    const enrichedItems = await Promise.all(
      wishlist.products.map(async (productId) => {
        const product = await ctx.db.get(productId);

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
          image: imageUrl,
          status: product.status,
          vendor_id: product.vendor_id,
          category_id: product.category_id,
          description: product.description,
          quantity: product.quantity,
          tags: product.tags,
        };
      })
    );

    // Filter out null items (deleted products)
    const validItems = enrichedItems.filter((item) => item !== null);

    return {
      success: true,
      wishlist: {
        _id: wishlist._id,
        user_id: wishlist.user_id,
        updated_at: wishlist.updated_at,
      },
      items: validItems,
      totalItems: validItems.length,
    };
  },
});

// Check if product is in wishlist
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `getMyWishlist`. Retained only until the standalone app retires.
 */
export const isProductInWishList = query({
  args: {
    user_id: v.id("users"),
    product_id: v.id("products"),
  },
  handler: async (ctx, args) => {
    const wishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!wishlist) {
      return { inWishlist: false };
    }

    const inWishlist = wishlist.products.includes(args.product_id);

    return { inWishlist };
  },
});

// Get wishlist count
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `getMyWishlist`. Retained only until the standalone app retires.
 */
export const getWishListCount = query({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const wishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!wishlist) {
      return { count: 0 };
    }

    return { count: wishlist.products.length };
  },
});

// Clear entire wishlist
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `removeFromMyWishlist`. Retained only until the standalone app retires.
 */
export const clearWishList = mutation({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const wishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!wishlist) {
      return {
        success: false,
        message: "Wishlist not found",
      };
    }

    await ctx.db.patch(wishlist._id, {
      products: [],
      updated_at: Date.now(),
    });

    return {
      success: true,
      message: "Wishlist cleared successfully",
    };
  },
});

// Move multiple items from wishlist to cart
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's wishlist. Use
 * `the auth-derived cart and wishlist functions`. Retained only until the standalone app retires.
 */
export const moveWishListToCart = mutation({
  args: {
    user_id: v.id("users"),
    product_ids: v.array(v.id("products")),
    quantity: v.optional(v.number()), // Default quantity for each product
  },
  handler: async (ctx, args) => {
    const quantity = args.quantity || 1;

    // Get user's cart
    const cart = await ctx.db
      .query("cart")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    // Get user's wishlist
    const wishlist = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    if (!wishlist) {
      return {
        success: false,
        message: "Wishlist not found",
      };
    }

    if (cart) {
      // Add products to existing cart
      const existingProducts = [...cart.products];

      for (const productId of args.product_ids) {
        const existingIndex = existingProducts.findIndex(
          (p) => p.product === productId
        );

        if (existingIndex >= 0) {
          // Add to existing quantity
          existingProducts[existingIndex].quantity += quantity;
        } else {
          // Add new product
          existingProducts.push({
            product: productId,
            quantity: quantity,
          });
        }
      }

      await ctx.db.patch(cart._id, {
        products: existingProducts,
        updated_at: Date.now(),
      });
    } else {
      // Create new cart
      await ctx.db.insert("cart", {
        user_id: args.user_id,
        products: args.product_ids.map((productId) => ({
          product: productId,
          quantity: quantity,
        })),
        updated_at: Date.now(),
      });
    }

    // Remove products from wishlist
    const updatedWishlistProducts = wishlist.products.filter(
      (productId) => !args.product_ids.includes(productId)
    );

    await ctx.db.patch(wishlist._id, {
      products: updatedWishlistProducts,
      updated_at: Date.now(),
    });

    return {
      success: true,
      message: `${args.product_ids.length} item(s) moved to cart`,
    };
  },
});

// ── The caller's own wishlist ─────────────────────────────────────────────
//
// All twelve functions above take the actor as an argument — `clerkId` or a raw
// `Id<"users">` — and none reads `ctx.auth.getUserIdentity()`. `moveWishListToCart`
// is the worst of them: one public mutation that rewrites an arbitrary user's
// cart AND wishlist given only their user id.
//
// They also disagree about their own contract: `{success, message, isInWishlist}`,
// `{success, inWishlist, message}`, a bare boolean and `{inWishlist}` all appear.
// And `getWishListByClerkId` wraps its body in try/catch returning
// `success: true` with an empty list on error, so a thrown database error is
// indistinguishable from an empty wishlist — the same loading-vs-absent
// confusion that produced the refresh-to-home bug in the app.
//
// The two below are the whole surface the customer app needs. Ids only: the
// screen hydrates them through `catalog.productsByIds`, which is bounded, capped
// and already the single place purchasability is decided. Storing or returning
// prices here would give the wishlist its own opinion about what something
// costs.

/**
 * How many products one wishlist may hold.
 *
 * The array lives in a single document, so an uncapped wishlist is an uncapped
 * document — and `productsByIds` caps at 100 anyway, so beyond that the screen
 * would silently show a truncated list while the badge counted the rest. Capping
 * on write means the number shown and the number stored agree.
 */
const MAX_WISHLIST_ITEMS = 100;

/** The caller's wishlist, as product ids in the order they were saved. */
export const getMyWishlist = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    // Signed out is an empty wishlist, not an error: the heart renders on
    // catalogue cards, which are browsable without an account.
    if (!identity) return { productIds: [] as Id<"products">[], atCapacity: false };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return { productIds: [] as Id<"products">[], atCapacity: false };

    const doc = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    const productIds = doc?.products ?? [];
    return { productIds, atCapacity: productIds.length >= MAX_WISHLIST_ITEMS };
  },
});

/**
 * Add or remove one product from the caller's own wishlist.
 *
 * Returns the resulting state rather than "success", so the heart is drawn from
 * what the server decided instead of from what the client assumed. The old
 * mutations returned `success: true` in every path including the ones where
 * nothing changed.
 *
 * The product must exist. Nothing else is checked — an out-of-stock or inactive
 * product is exactly the sort of thing a customer wants to be reminded of later,
 * so purchasability is a decision for the basket, not for saving something.
 */
export const toggleMyWishlistItem = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("That product no longer exists.");

    const doc = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    const now = Date.now();

    if (!doc) {
      await ctx.db.insert("wishlist", {
        user_id: user._id,
        products: [args.productId],
        updated_at: now,
      });
      return { inWishlist: true, count: 1 };
    }

    const present = doc.products.includes(args.productId);

    if (present) {
      const products = doc.products.filter((id) => id !== args.productId);
      await ctx.db.patch(doc._id, { products, updated_at: now });
      return { inWishlist: false, count: products.length };
    }

    if (doc.products.length >= MAX_WISHLIST_ITEMS) {
      throw new ConvexError(
        `Your saved list is full at ${MAX_WISHLIST_ITEMS} items. Remove something first.`,
      );
    }

    const products = [...doc.products, args.productId];
    await ctx.db.patch(doc._id, { products, updated_at: now });
    return { inWishlist: true, count: products.length };
  },
});

/**
 * Drop products from the caller's wishlist without toggling them one by one.
 *
 * Used after moving saved items into the basket. Ids that are not in the list
 * are ignored rather than erroring — the caller is reconciling, not asserting.
 */
export const removeFromMyWishlist = mutation({
  args: { productIds: v.array(v.id("products")) },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const doc = await ctx.db
      .query("wishlist")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (!doc) return { count: 0 };

    const dropping = new Set(args.productIds);
    const products = doc.products.filter((id) => !dropping.has(id));
    if (products.length !== doc.products.length) {
      await ctx.db.patch(doc._id, { products, updated_at: Date.now() });
    }
    return { count: products.length };
  },
});
