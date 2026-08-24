import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { haversineMeters } from "../helpers/geo";
import { VendorsUpdateValidator, VendorsValidator } from "../validators";

export const getVendors = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
    industry: v.optional(v.id("industry")),
  },
  handler: async (ctx, args) => {
    const PageLimit = Math.max(1, Math.min(200, args.limit));
    const normalizedSearch = (args.search ?? "").trim();
    const isSearching = normalizedSearch.length > 0;

    const baseQuery = ctx.db.query("vendors");

    let vendorsQuery;
    if (isSearching) {
      vendorsQuery = baseQuery.withSearchIndex("search_text", (q) => {
        let sq = q.search("searchText", normalizedSearch);
        if (args.status) {
          sq = sq.eq("status", args.status);
        }
        if (args.industry) {
          sq = sq.eq("industry_id", args.industry);
        }
        return sq;
      });
    } else if (args.status && args.industry) {
      vendorsQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.eq(q.field("industry_id"), args.industry!))
        .order("desc");
    } else if (args.status) {
      vendorsQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc");
    } else if (args.industry) {
      vendorsQuery = baseQuery
        .filter((q) => q.eq(q.field("industry_id"), args.industry!))
        .order("desc");
    } else {
      vendorsQuery = baseQuery.order("desc");
    }

    const pageResult = await vendorsQuery.paginate({
      cursor: args.cursor ?? null,
      numItems: PageLimit,
    });

    const currentPageVendors = pageResult.page;

    const vendorsWithRelations = await Promise.all(
      currentPageVendors.map(async (vendor) => {
        const products = await ctx.db
          .query("products")
          .withIndex("by_vendor", (q) => q.eq("vendor_id", vendor._id))
          .collect();

        const hmRole = await ctx.db
          .query("roles")
          .withIndex("by_name", (q) => q.eq("name", "Hub Manager"))
          .unique();
        const allHubManagers = hmRole
          ? await ctx.db
              .query("users")
              .withIndex("by_role_id", (q) => q.eq("role_id", hmRole._id))
              .collect()
          : [];
        const hubManager =
          allHubManagers.find((u) =>
            u.manager_details?.vendor_id?.includes(vendor._id),
          ) ?? null;

        const hub_manager = hubManager
          ? {
              _id: hubManager._id,
              name:
                hubManager.name ||
                `${hubManager.first_name} ${hubManager.last_name}`,
              email: hubManager.email,
              phone: hubManager.phone,
            }
          : null;

        const imageUrl = vendor.image
          ? await ctx.storage.getUrl(vendor.image)
          : null;

        return {
          ...vendor,
          imageUrl,
          products,
          hub_manager,
        };
      }),
    );

    const total = (
      isSearching
        ? await baseQuery
            .withSearchIndex("search_text", (q) => {
              let sq = q.search("searchText", normalizedSearch);
              if (args.status) {
                sq = sq.eq("status", args.status);
              }
              if (args.industry) {
                sq = sq.eq("industry_id", args.industry);
              }
              return sq;
            })
            .collect()
        : args.status
          ? await baseQuery
              .withIndex("by_status", (q) => q.eq("status", args.status!))
              .collect()
          : args.industry
            ? await baseQuery
                .filter((q) => q.eq(q.field("industry_id"), args.industry!))
                .collect()
            : await baseQuery.collect()
    ).length;

    const totalPages = Math.max(1, Math.ceil(total / PageLimit));

    return {
      data: vendorsWithRelations,
      pagination: {
        PageLimit,
        total,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const backFillingVendorsSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const vendors = await ctx.db.query("vendors").collect();

    let updatedCount = 0;
    for (const vendor of vendors) {
      const searchText = [vendor.name, vendor.address.address_1 ?? ""]
        .join(" ")
        .trim();

      if (vendor.searchText === searchText) continue;

      await ctx.db.patch(vendor._id, {
        searchText,
        updated_at: Date.now(),
      });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

export const getAllVendors = query({
  args: {},
  handler: async (ctx, args) => {
    return await ctx.db.query("vendors").collect();
  },
});

export const getActiveVendors = query({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.limit) {
      args.limit = 50;
    }
    const limit = Math.max(1, Math.min(100, args.limit));

    const pageResult = await ctx.db
      .query("vendors")
      .withIndex("by_status", (q) => q.eq("status", "Active"))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const currentPageVendors = pageResult.page;

    const total = (
      await ctx.db
        .query("vendors")
        .withIndex("by_status", (q) => q.eq("status", "Active"))
        .collect()
    ).length;

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: currentPageVendors,
      pagination: {
        limit,
        total,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const getVendorById = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) return null;

    const hmRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Hub Manager"))
      .unique();
    const allHubManagers = hmRole
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) => q.eq("role_id", hmRole._id))
          .collect()
      : [];
    const hubManager =
      allHubManagers.find((u) =>
        u.manager_details?.vendor_id?.includes(vendor._id),
      ) ?? null;

    const hub_manager = hubManager
      ? {
          _id: hubManager._id,
          name:
            hubManager.name ||
            `${hubManager.first_name} ${hubManager.last_name}`,
          email: hubManager.email,
          phone: hubManager.phone,
        }
      : null;

    return { ...vendor, hub_manager };
  },
});

export const updateVendorStatus = mutation({
  args: {
    vendorId: v.id("vendors"),
    status: v.union(v.literal("Active"), v.literal("Inactive")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vendorId, {
      status: args.status,
    });
  },
});

export const addVendor = mutation({
  args: VendorsValidator,
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.service_center) {
      const distance = haversineMeters(
        args.service_center.lat,
        args.service_center.lng,
        args.coordinates.lat,
        args.coordinates.lng,
      );

      if (distance > args.service_radius) {
        throw new ConvexError(
          "Service center must be within the service radius",
        );
      }
    }

    const searchText = [args.name, args.address.address_1 || ""]
      .join(" ")
      .trim();

    await ctx.db.insert("vendors", {
      ...args,
      searchText,
      updated_at: now,
    });
  },
});

export const updateVendor = mutation({
  args: VendorsUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    if (updates.service_center) {
      const vendor = await ctx.db.get(args.id);
      if (!vendor) {
        throw new Error("Vendor not found");
      }

      const distance = haversineMeters(
        updates.service_center.lat,
        updates.service_center.lng,
        updates.coordinates?.lat ?? vendor.coordinates.lat,
        updates.coordinates?.lng ?? vendor.coordinates.lng,
      );

      if (distance > (updates.service_radius ?? vendor.service_radius)) {
        throw new ConvexError(
          "Service center must be within the service radius",
        );
      }
    }

    const nextName = updates.name ?? (await ctx.db.get(args.id))?.name;
    const nextAddress =
      updates.address?.address_1 ??
      (await ctx.db.get(args.id))?.address.address_1 ??
      "";
    const nextSearchText = [nextName, nextAddress].join(" ").trim();

    await ctx.db.patch(args.id, {
      ...updates,
      searchText: nextSearchText,
      updated_at: now,
    });
  },
});

export const setVendorPaystackSubaccountCode = mutation({
  args: {
    vendorId: v.id("vendors"),
    subaccountCode: v.string(),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");

    const existingBusiness = vendor.business_details;
    if (!existingBusiness) {
      const testBankCode = (process.env.TEST_BANK_CODE || "").trim();
      const testAccountNumber = String(process.env.TEST_ACCOUNT_NUMBER || "")
        .replace(/\s+/g, "")
        .trim();
      if (!testBankCode || !testAccountNumber) {
        throw new Error(
          "Vendor business_details missing (business_name, bank_code, account_number required)",
        );
      }

      await ctx.db.patch(args.vendorId, {
        business_details: {
          business_name: vendor.name,
          bank_code: testBankCode,
          account_number: testAccountNumber,
          paystack_subaccount_code: args.subaccountCode,
        },
        updated_at: Date.now(),
      });
      return;
    }

    await ctx.db.patch(args.vendorId, {
      business_details: {
        ...existingBusiness,
        paystack_subaccount_code: args.subaccountCode,
      },
      updated_at: Date.now(),
    });
  },
});
