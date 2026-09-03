import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import { hasPermission } from "../auth.helpers";

/**
 * `getStockAlerts` took `userRole: v.string()` as a plain client argument and
 * string-compared it against `["ADMIN", "GENERAL MANAGER", "HUB MANAGER"]` —
 * forgeable by construction, since the caller supplies the very value the gate
 * checks. Any caller passing `"ADMIN"` unlocked the branch.
 *
 * Replaced with a real permission check, `hasPermission` rather than
 * `assertPermission` so the return shape is unchanged for a caller who lacks
 * it: `{ showAlerts: false, ... }`, matching what the dashboard banner already
 * expects instead of surfacing a thrown error to a component that never
 * checked for one.
 */
export const getStockAlerts = query({
  args: {
    vendorId: v.optional(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    const allowed = await hasPermission(ctx, "products:READ");
    if (!allowed) {
      return {
        lowStockProducts: [],
        outOfStockProducts: [],
        totalLowStock: 0,
        totalOutOfStock: 0,
        totalIssues: 0,
        showAlerts: false,
      };
    }

    const productsToCheck = args.vendorId
      ? await ctx.db
          .query("products")
          .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendorId))
          .filter((q) => q.eq(q.field("status"), "Active"))
          .collect()
      : await ctx.db
          .query("products")
          .filter((q) => q.eq(q.field("status"), "Active"))
          .collect();

    const lowStockProducts = productsToCheck.filter(
      (product) => product.quantity > 0 && product.quantity <= 5
    );

    const outOfStockProducts = productsToCheck.filter(
      (product) => product.quantity === 0
    );

    // Get additional details for products
    const enrichedLowStock = await Promise.all(
      lowStockProducts.map(async (product) => {
        const vendor = product.vendor_id
          ? await ctx.db.get(product.vendor_id)
          : null;
        const category = await ctx.db.get(product.category_id);

        return {
          ...product,
          vendor: vendor
            ? {
                _id: vendor._id,
                name: vendor.name,
              }
            : null,
          category: category
            ? {
                _id: category._id,
                name: category.name,
              }
            : null,
        };
      })
    );

    const enrichedOutOfStock = await Promise.all(
      outOfStockProducts.map(async (product) => {
        const vendor = product.vendor_id
          ? await ctx.db.get(product.vendor_id)
          : null;
        const category = await ctx.db.get(product.category_id);

        return {
          ...product,
          vendor: vendor
            ? {
                _id: vendor._id,
                name: vendor.name,
              }
            : null,
          category: category
            ? {
                _id: category._id,
                name: category.name,
              }
            : null,
        };
      })
    );

    return {
      lowStockProducts: enrichedLowStock,
      outOfStockProducts: enrichedOutOfStock,
      totalLowStock: enrichedLowStock.length,
      totalOutOfStock: enrichedOutOfStock.length,
      totalIssues: enrichedLowStock.length + enrichedOutOfStock.length,
      showAlerts: true,
    };
  },
});

/**
 * @deprecated No caller anywhere in this monorepo. `getStockAlerts` above is
 * the live, gated equivalent — this duplicated the same computation with no
 * auth at all.
 */
export const getLowStockProducts = internalQuery({
  args: {
    vendorId: v.optional(v.id("vendors")), // For hub managers to filter by their vendor
    threshold: v.optional(v.number()), // Low stock threshold, defaults to 5
  },
  handler: async (ctx, args) => {
    const threshold = args.threshold || 5;

    let allProducts;

    // If vendorId is provided (for hub managers), filter by vendor
    if (args.vendorId) {
      allProducts = await ctx.db
        .query("products")
        .withIndex("by_vendor", (q) => q.eq("vendor_id", args.vendorId))
        .filter((q) => q.eq(q.field("status"), "Active"))
        .collect();
    } else {
      allProducts = await ctx.db
        .query("products")
        .filter((q) => q.eq(q.field("status"), "Active"))
        .collect();
    }

    // Separate low stock and out of stock products
    const lowStockProducts = allProducts.filter(
      (product) => product.quantity > 0 && product.quantity <= threshold
    );

    const outOfStockProducts = allProducts.filter(
      (product) => product.quantity === 0
    );

    // Get vendor and category information for each product
    const enrichedLowStock = await Promise.all(
      lowStockProducts.map(async (product) => {
        const vendor = product.vendor_id
          ? await ctx.db.get(product.vendor_id)
          : null;
        const category = await ctx.db.get(product.category_id);

        return {
          ...product,
          vendor: vendor
            ? {
                _id: vendor._id,
                name: vendor.name,
              }
            : null,
          category: category
            ? {
                _id: category._id,
                name: category.name,
              }
            : null,
        };
      })
    );

    const enrichedOutOfStock = await Promise.all(
      outOfStockProducts.map(async (product) => {
        const vendor = product.vendor_id
          ? await ctx.db.get(product.vendor_id)
          : null;
        const category = await ctx.db.get(product.category_id);

        return {
          ...product,
          vendor: vendor
            ? {
                _id: vendor._id,
                name: vendor.name,
              }
            : null,
          category: category
            ? {
                _id: category._id,
                name: category.name,
              }
            : null,
        };
      })
    );

    return {
      lowStockProducts: enrichedLowStock,
      outOfStockProducts: enrichedOutOfStock,
      totalLowStock: enrichedLowStock.length,
      totalOutOfStock: enrichedOutOfStock.length,
      totalIssues: enrichedLowStock.length + enrichedOutOfStock.length,
    };
  },
});
