import { internalMutation, mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { UsersUpdateValidator } from "../validators";
import { validateRiderActivation } from "../lib/account_completion";
import { Id } from "../_generated/dataModel";
import {
  getUserRoleName,
  getRoleIdByName,
  isSystemRole,
  SYSTEM_ROLES,
} from "../lib/roles";
import { getAccountCompletion } from "../lib/account_completion";

const computeUserSearchText = (user: {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}) => {
  const displayName =
    user.name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return [displayName, user.email ?? "", user.phone ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

export const getCurrentUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) return null;

    // Resolve role name from role_id so the frontend doesn't need a second query
    const roleName = await getUserRoleName(ctx, user);

    console.log(
      `[getCurrentUser] clerkId=${args.clerkId} role_id=${user.role_id} roleName=${roleName}`,
    );

    return { ...user, roleName };
  },
});

export const getUserById = query({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.user_id);
  },
});

export const getUserRole = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    return await getUserRoleName(ctx, user);
  },
});

export const getAdminRoles = query({
  args: {},
  handler: async (ctx) => {
    const roles = await ctx.db.query("roles").collect();
    return roles.filter((role) => !isSystemRole(role.name));
  },
});

export const getRiders = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("Active"),
        v.literal("On Delivery"),
        v.literal("Inactive"),
      ),
    ),
    vehicle_type: v.optional(
      v.union(
        v.literal("Motorbike"),
        v.literal("Bicycle"),
        v.literal("Car"),
        v.literal("Van"),
      ),
    ),
    vendorId: v.optional(v.id("vendors")),
  },

  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));

    const search = args.search?.trim();
    const status = args.status;
    const vehicleType = args.vehicle_type;
    const vendorId = args.vendorId;

    // Resolve the Rider role_id
    const riderRoleId = await getRoleIdByName(ctx, "Rider");
    if (!riderRoleId) {
      return {
        data: [],
        pagination: {
          limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          cursor: null,
        },
      };
    }

    const buildListQuery = () => {
      if (search && search.length > 0) {
        return ctx.db.query("users").withSearchIndex("search_text", (q) => {
          let sq = q.search("searchText", search).eq("role_id", riderRoleId);
          if (status) sq = sq.eq("rider_details.status", status);
          if (vehicleType)
            sq = sq.eq("rider_details.vehicle_type", vehicleType);
          if (vendorId) sq = sq.eq("rider_details.vendor_id", vendorId);
          return sq;
        });
      }

      if (status && !vendorId && !vehicleType) {
        return ctx.db
          .query("users")
          .withIndex("by_role_id_rider_status", (q) =>
            q.eq("role_id", riderRoleId).eq("rider_details.status", status),
          );
      }

      if (vendorId && !status && !vehicleType) {
        return ctx.db
          .query("users")
          .withIndex("by_role_id_rider_vendor", (q) =>
            q
              .eq("role_id", riderRoleId)
              .eq("rider_details.vendor_id", vendorId),
          );
      }

      const base = ctx.db
        .query("users")
        .withIndex("by_role_id", (q) => q.eq("role_id", riderRoleId));

      if (!status && !vehicleType && !vendorId) return base;

      return base.filter((q) => {
        const clauses: any[] = [];
        if (status) clauses.push(q.eq(q.field("rider_details.status"), status));
        if (vehicleType)
          clauses.push(
            q.eq(q.field("rider_details.vehicle_type"), vehicleType),
          );
        if (vendorId)
          clauses.push(q.eq(q.field("rider_details.vendor_id"), vendorId));
        return q.and(...clauses);
      });
    };

    const pageResult = await buildListQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const total = (await buildListQuery().collect()).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: pageResult.page,
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

export const getAllRiders = query({
  args: {},
  handler: async (ctx) => {
    const riderRoleId = await getRoleIdByName(ctx, "Rider");
    if (!riderRoleId) return [];
    return await ctx.db
      .query("users")
      .withIndex("by_role_id", (q) => q.eq("role_id", riderRoleId))
      .collect();
  },
});

export const updateRiderStatus = mutation({
  args: {
    riderId: v.id("users"),
    status: v.union(
      v.literal("Active"),
      v.literal("On Delivery"),
      v.literal("Inactive"),
    ),
    vehicle_type: v.union(
      v.literal("Motorbike"),
      v.literal("Bicycle"),
      v.literal("Car"),
      v.literal("Van"),
    ),
  },
  handler: async (ctx, args) => {
    const rider = await ctx.db.get(args.riderId);

    if (!rider) {
      throw new Error("Rider not found");
    }

    const activationErrors = validateRiderActivation(rider);
    if (activationErrors.length > 0) {
      throw new ConvexError(
        "Rider profile is incomplete for activation: " +
          activationErrors.join(", "),
      );
    }

    await ctx.db.patch(args.riderId, {
      rider_details: {
        status: args.status,
        vehicle_type: args.vehicle_type,
      },
    });

    return await ctx.db.get(args.riderId);
  },
});

export const updateRider = mutation({
  args: UsersUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    const existingRider = await ctx.db.get(id);
    if (!existingRider) {
      throw new Error("Rider not found");
    }

    const nextSearchText = computeUserSearchText({
      ...existingRider,
      ...updates,
    });

    return await ctx.db.patch(id, {
      ...updates,
      searchText: nextSearchText,
      updated_at: now,
    });
  },
});

export const getRiderById = query({
  args: { riderId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.riderId);
  },
});

export const getAllCustomers = query({
  args: {},
  handler: async (ctx) => {
    const customerRoleId = await getRoleIdByName(ctx, "Customer");
    if (!customerRoleId) return [];
    return await ctx.db
      .query("users")
      .withIndex("by_role_id", (q) => q.eq("role_id", customerRoleId))
      .order("desc")
      .collect();
  },
});

export const getCustomers = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
    orderCountBucket: v.optional(
      v.union(
        v.literal("none"),
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));

    const search = args.search?.trim();
    const status = args.status;
    const orderCountBucket = args.orderCountBucket;

    const customerRoleId = await getRoleIdByName(ctx, "Customer");
    if (!customerRoleId) {
      return {
        data: [],
        pagination: {
          limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          cursor: null,
        },
      };
    }

    const buildListQuery = () => {
      if (search && search.length > 0) {
        return ctx.db
          .query("users")
          .withSearchIndex("search_text", (q: any) => {
            const sq = q
              .search("searchText", search)
              .eq("role_id", customerRoleId);
            return status ? sq.eq("status", status) : sq;
          });
      }

      const base = ctx.db
        .query("users")
        .withIndex("by_role_id", (q: any) => q.eq("role_id", customerRoleId));

      if (!status) return base;
      return base.filter((q: any) => q.eq(q.field("status"), status));
    };

    // If we need order-count filtering, we have to evaluate it outside the query builder.
    // We keep this bucket-based to avoid collecting full order histories.
    const allCustomers = await buildListQuery().collect();

    const computeBucket = (orderCountCapped: number) => {
      if (orderCountCapped <= 0) return "none";
      if (orderCountCapped <= 5) return "low";
      if (orderCountCapped <= 20) return "medium";
      return "high";
    };

    const filteredCustomers = orderCountBucket
      ? (
          await Promise.all(
            allCustomers.map(async (customer) => {
              // Only need up to 21 orders to determine the bucket.
              const ordersSample = await ctx.db
                .query("orders")
                .withIndex("by_user", (q) => q.eq("user_id", customer._id))
                .take(21);
              const bucket = computeBucket(ordersSample.length);
              return bucket === orderCountBucket ? customer : null;
            }),
          )
        ).filter((c): c is (typeof allCustomers)[number] => c !== null)
      : allCustomers;

    const total = filteredCustomers.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const startIndex = Math.max(0, Number(args.cursor ?? 0) || 0);
    const pageCustomers = filteredCustomers.slice(
      startIndex,
      startIndex + limit,
    );
    const nextIndex = startIndex + pageCustomers.length;
    const hasNext = nextIndex < total;

    const customersWithOrders = await Promise.all(
      pageCustomers.map(async (customer) => {
        const orders = await ctx.db
          .query("orders")
          .withIndex("by_user", (q) => q.eq("user_id", customer._id))
          .collect();

        return {
          ...customer,
          orders,
        };
      }),
    );

    return {
      data: customersWithOrders,
      pagination: {
        limit,
        total,
        totalPages,
        hasNext,
        cursor: hasNext ? String(nextIndex) : null,
      },
    };
  },
});

export const updateCustomer = mutation({
  args: UsersUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    const existingCustomer = await ctx.db.get(id);
    if (!existingCustomer) {
      throw new Error("Customer not found");
    }

    const nextSearchText = computeUserSearchText({
      ...existingCustomer,
      ...updates,
    });

    return await ctx.db.patch(id, {
      ...updates,
      searchText: nextSearchText,
      updated_at: now,
    });
  },
});

export const updateCustomerStatus = mutation({
  args: {
    status: v.union(v.literal("Active"), v.literal("Inactive")),
    customerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.customerId, {
      status: args.status,
    });
    return await ctx.db.get(args.customerId);
  },
});

export const getPickers = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("Active"),
        v.literal("On Order"),
        v.literal("Inactive"),
      ),
    ),
    vendorId: v.optional(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));

    const search = args.search?.trim();
    const status = args.status;
    const vendorId = args.vendorId;

    const pickerRoleId = await getRoleIdByName(ctx, "Picker");
    if (!pickerRoleId) {
      return {
        data: [],
        pagination: {
          limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          cursor: null,
        },
      };
    }

    const buildListQuery = () => {
      if (search && search.length > 0) {
        return ctx.db
          .query("users")
          .withSearchIndex("search_text", (q: any) => {
            let sq = q.search("searchText", search).eq("role_id", pickerRoleId);
            if (status) sq = sq.eq("picker_details.status", status);
            if (vendorId) sq = sq.eq("picker_details.vendor_id", vendorId);
            return sq;
          });
      }

      if (vendorId && !status) {
        return ctx.db
          .query("users")
          .withIndex("by_role_id_picker_vendor", (q: any) =>
            q
              .eq("role_id", pickerRoleId)
              .eq("picker_details.vendor_id", vendorId),
          );
      }

      const base = ctx.db
        .query("users")
        .withIndex("by_role_id", (q: any) => q.eq("role_id", pickerRoleId));

      if (!status && !vendorId) return base;
      return base.filter((q: any) => {
        const clauses: any[] = [];
        if (status)
          clauses.push(q.eq(q.field("picker_details.status"), status));
        if (vendorId)
          clauses.push(q.eq(q.field("picker_details.vendor_id"), vendorId));
        return q.and(...clauses);
      });
    };

    const pageResult = await buildListQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const pickerWithVendor = await Promise.all(
      pageResult.page.map(async (picker) => {
        if (!picker.picker_details?.vendor_id) {
          return { ...picker, vendor: null };
        }

        const vendor = await ctx.db.get(picker.picker_details.vendor_id);
        if (!vendor) {
          return { ...picker, vendor: null };
        }

        return {
          ...picker,
          vendor: {
            _id: vendor._id,
            name: vendor.name,
            contact: vendor.contact || { name: "", email: "", phone: "" },
            address: {
              address_1: vendor.address?.address_1 || "",
              address_2: vendor.address?.address_2,
              city: vendor.address?.city || "",
              country: vendor.address?.country || "",
            },
            status: vendor.status || "Inactive",
          },
        };
      }),
    );
    const total = (await buildListQuery().collect()).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: pickerWithVendor,
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

export const getAllPickers = query({
  args: {},
  handler: async (ctx) => {
    const pickerRoleId = await getRoleIdByName(ctx, "Picker");
    if (!pickerRoleId) return [];
    return await ctx.db
      .query("users")
      .withIndex("by_role_id", (q) => q.eq("role_id", pickerRoleId))
      .collect();
  },
});

export const updatePickerStatus = mutation({
  args: {
    pickerId: v.id("users"),
    status: v.union(
      v.literal("Active"),
      v.literal("On Order"),
      v.literal("Inactive"),
    ),
    vendor_id: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pickerId, {
      picker_details: {
        status: args.status,
        vendor_id: args.vendor_id,
      },
    });

    return await ctx.db.get(args.pickerId);
  },
});

export const updatePicker = mutation({
  args: UsersUpdateValidator,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    return await ctx.db.patch(args.id, {
      ...updates,
      updated_at: now,
    });
  },
});

// Update user's push notification token
export const updatePushToken = mutation({
  args: {
    userId: v.id("users"),
    pushToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId, {
      push_token: args.pushToken,
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

// Update user's push notification token by clerk ID
export const updatePushTokenByClerkId = mutation({
  args: {
    clerkId: v.string(),
    pushToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      push_token: args.pushToken,
      updated_at: Date.now(),
    });

    return { success: true, userId: user._id };
  },
});

// Get users with push tokens (for sending notifications)
export const getUsersWithPushTokens = query({
  args: {
    roleId: v.optional(v.id("roles")),
    userIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    if (args.userIds && args.userIds.length > 0) {
      const users = await Promise.all(
        args.userIds.map((userId) => ctx.db.get(userId)),
      );

      return users
        .filter((user) => user && user.push_token && user.push_token.length > 0)
        .filter((user) => !args.roleId || user!.role_id === args.roleId)
        .map((user) => ({
          _id: user!._id,
          name: `${user!.first_name} ${user!.last_name}`,
          email: user!.email,
          role_id: user!.role_id,
          push_token: user!.push_token!,
        }));
    }

    let users;

    if (args.roleId) {
      users = await ctx.db
        .query("users")
        .withIndex("by_role_id", (q) => q.eq("role_id", args.roleId!))
        .collect();
    } else {
      users = await ctx.db.query("users").collect();
    }

    return users
      .filter((user) => user.push_token && user.push_token.length > 0)
      .map((user) => ({
        _id: user._id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role_id: user.role_id,
        push_token: user.push_token,
      }));
  },
});

// Remove push token (e.g., on logout)
export const removePushToken = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      push_token: undefined,
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

// Upsert a user from a Clerk webhook
export const upsertUser = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log(`🔄 upsertUser webhook called:`, {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
    });

    // Skip processing if no email is provided
    if (!args.email) {
      console.warn("No email provided for user upsert, skipping");
      return;
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    const existingEmailUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email || ""))
      .unique();

    const nameParts = args.name?.split(" ") || [];
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    if (existingUser) {
      if (existingEmailUser && existingEmailUser._id !== existingUser._id) {
        console.error(
          `⚠️ ClerkId mismatch detected! Email ${args.email} exists with different clerkId`,
        );
        console.error(`   Existing user clerkId: ${existingEmailUser.clerkId}`);
        console.error(`   New clerkId: ${args.clerkId}`);
        throw new ConvexError(
          `Email ${args.email} is already registered to another account. Please use a different email address.`,
        );
      }

      const nextSearchText = computeUserSearchText({
        ...existingUser,
        email: args.email,
        name: args.name || "",
        first_name: firstName,
        last_name: lastName,
      });

      await ctx.db.patch(existingUser._id, {
        email: args.email,
        name: args.name || "",
        first_name: firstName,
        last_name: lastName,
        image: args.image || "",
        status: "Inactive",
        searchText: nextSearchText,
        updated_at: Date.now(),
      });

      console.log(`✅ Updated existing user with clerkId: ${args.clerkId}`);
    } else if (existingEmailUser) {
      // IMPORTANT: Handle the clerkId mismatch case
      // This happens when a user already exists but has a different clerkId
      // This could be due to Clerk account recreation or environment changes

      console.warn(
        `🔧 Potential clerkId mismatch - User exists with email ${args.email} but different clerkId:`,
      );
      console.warn(`   Existing clerkId: ${existingEmailUser.clerkId}`);
      console.warn(`   New clerkId: ${args.clerkId}`);
      console.warn(`   Updating clerkId to match current Clerk user...`);

      // Update the existing user's clerkId to match the current Clerk user
      const nextSearchText = computeUserSearchText({
        ...existingEmailUser,
        email: args.email,
        name: args.name || existingEmailUser.name || "",
        first_name: firstName || existingEmailUser.first_name,
        last_name: lastName || existingEmailUser.last_name,
      });

      await ctx.db.patch(existingEmailUser._id, {
        clerkId: args.clerkId, // Update to the new clerkId
        name: args.name || existingEmailUser.name || "",
        first_name: firstName || existingEmailUser.first_name,
        last_name: lastName || existingEmailUser.last_name,
        image: args.image || existingEmailUser.image || "",
        searchText: nextSearchText,
        updated_at: Date.now(),
      });

      console.log(
        `✅ Updated existing user's clerkId from ${existingEmailUser.clerkId} to ${args.clerkId}`,
      );
    } else {
      // Create new user
      const searchText = computeUserSearchText({
        name: args.name || "",
        first_name: firstName,
        last_name: lastName,
        email: args.email,
        phone: "",
      });

      // Assign the default role if one exists
      const defaultRole = await ctx.db
        .query("roles")
        .withIndex("by_is_default", (q) => q.eq("is_default", true))
        .first();

      await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        name: args.name || "",
        first_name: firstName,
        last_name: lastName,
        image: args.image || "",
        phone: "",
        searchText,
        status: "Inactive",
        address: { address: "", lat: 0, lng: 0 },
        role_id: defaultRole?._id,
        updated_at: Date.now(),
      });

      console.log(
        `✅ Created new user with clerkId: ${args.clerkId} and email: ${args.email}`,
      );
    }
  },
});

// Delete a user from a Clerk webhook
export const deleteUser = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});

// Get users for admin management (paginated).
export const getUsers = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));
    const search = args.search?.trim();
    const status = args.status;

    const buildListQuery = () => {
      const base =
        search && search.length > 0
          ? ctx.db
              .query("users")
              .withSearchIndex("search_text", (q) =>
                q.search("searchText", search),
              )
          : ctx.db.query("users");

      if (status) {
        return base.filter((q) => q.eq(q.field("status"), status));
      }
      return base;
    };

    const pageResult = await buildListQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const total = (await buildListQuery().collect()).length;

    return {
      data: pageResult.page,
      pagination: {
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

/** @deprecated Use getUsers instead. */
export const getAllUsersExcludingRiders = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));
    const search = args.search?.trim();
    const status = args.status;

    const buildListQuery = () => {
      const base =
        search && search.length > 0
          ? ctx.db
              .query("users")
              .withSearchIndex("search_text", (q) =>
                q.search("searchText", search),
              )
          : ctx.db.query("users");

      if (status) {
        return base.filter((q) => q.eq(q.field("status"), status));
      }
      return base;
    };

    const pageResult = await buildListQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const total = (await buildListQuery().collect()).length;

    return {
      data: pageResult.page,
      pagination: {
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const backfillUsersSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    let updatedCount = 0;
    for (const user of users) {
      const searchText = computeUserSearchText(user);
      if (user.searchText === searchText) continue;
      await ctx.db.patch(user._id, { searchText, updated_at: Date.now() });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

// Get all users for management purposes
export const getAllUsersForManagement = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").order("desc").collect();
  },
});

/** @deprecated Use assignRoleToUser instead */
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("ADMIN"),
      v.literal("CUSTOMER"),
      v.literal("PICKER"),
      v.literal("GENERAL MANAGER"),
      v.literal("HUB MANAGER"),
      v.literal("VENDOR CONTACT"),
      v.literal("RIDER"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve the role_id from the dynamic roles table
    const roleId = await getRoleIdByName(ctx, args.role);

    const updates: Record<string, any> = {
      role_id: roleId ?? undefined,
      updated_at: Date.now(),
    };

    updates.searchText = computeUserSearchText(user);

    await ctx.db.patch(args.userId, updates);
    return await ctx.db.get(args.userId);
  },
});

/** Assign a dynamic role (from the roles table) to a user. */
export const assignRoleToUser = mutation({
  args: {
    userId: v.id("users"),
    roleId: v.id("roles"),
    vendor_id: v.optional(v.id("vendors")),
    // Array of vendor IDs for manager roles (multi-vendor assignment)
    vendor_ids: v.optional(v.array(v.id("vendors"))),
    // Rider-specific extras (only when role name is "rider")
    rider_vehicle_type: v.optional(
      v.union(
        v.literal("Motorbike"),
        v.literal("Bicycle"),
        v.literal("Car"),
        v.literal("Van"),
      ),
    ),
    rider_vehicle_plate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error("Role not found");

    const roleLower = role.name.trim().toLowerCase();
    const updates: Record<string, any> = {
      role_id: args.roleId,
      updated_at: Date.now(),
    };

    // If the role manages a vendor, store vendor_id in the right place
    const hasVendor =
      !!args.vendor_id ||
      (args.vendor_ids !== undefined && args.vendor_ids.length > 0);
    if (role.manages_vendor && hasVendor) {
      if (roleLower === "rider") {
        updates.rider_details = {
          vendor_id: args.vendor_id,
          vehicle_type: args.rider_vehicle_type ?? "Motorbike",
          vehicle_plate: args.rider_vehicle_plate,
          status: "Inactive" as const,
        };
      } else if (roleLower === "picker") {
        updates.picker_details = {
          vendor_id: args.vendor_id,
          status: "Inactive" as const,
        };
      } else {
        // Any other vendor-managing role → manager_details
        // Prefer vendor_ids array; fall back to wrapping single vendor_id
        const ids =
          args.vendor_ids && args.vendor_ids.length > 0
            ? args.vendor_ids
            : args.vendor_id
              ? [args.vendor_id]
              : [];
        updates.manager_details = {
          vendor_id: ids,
          assigned_at: Date.now(),
        };
      }
    }

    await ctx.db.patch(args.userId, updates);
    return await ctx.db.get(args.userId);
  },
});

export const assignGeneralManager = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const gmRoleId = await getRoleIdByName(ctx, "General Manager");

    const updates: Record<string, any> = {
      role_id: gmRoleId ?? undefined,
      manager_details: undefined,
      updated_at: Date.now(),
    };

    await ctx.db.patch(args.userId, updates);
    return await ctx.db.get(args.userId);
  },
});

export const assignRiderWithDetails = mutation({
  args: {
    userId: v.id("users"),
    vehicleType: v.union(
      v.literal("Motorbike"),
      v.literal("Bicycle"),
      v.literal("Car"),
      v.literal("Van"),
    ),
    vehiclePlate: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    status: v.union(
      v.literal("Active"),
      v.literal("On Delivery"),
      v.literal("Inactive"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (args.vendorId) {
      const vendor = await ctx.db.get(args.vendorId);
      if (!vendor) {
        throw new Error("Vendor not found");
      }
    }

    const riderRoleId = await getRoleIdByName(ctx, "Rider");

    const updates: Record<string, any> = {
      role_id: riderRoleId ?? undefined,
      rider_details: {
        vehicle_type: args.vehicleType,
        vehicle_plate: args.vehiclePlate,
        vendor_id: args.vendorId,
        status: args.status,
      },
      updated_at: Date.now(),
    };

    await ctx.db.patch(args.userId, updates);
    return await ctx.db.get(args.userId);
  },
});

export const assignPickerWithDetails = mutation({
  args: {
    userId: v.id("users"),
    vendorId: v.id("vendors"),
    status: v.union(
      v.literal("Active"),
      v.literal("On Order"),
      v.literal("Inactive"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    const pickerRoleId = await getRoleIdByName(ctx, "Picker");

    // Check for existing active picker at this vendor
    const existingActivePicker = await ctx.db
      .query("users")
      .filter((q) =>
        q.and(
          q.eq(q.field("picker_details.vendor_id"), args.vendorId),
          q.eq(q.field("picker_details.status"), "Active"),
          q.neq(q.field("_id"), args.userId),
        ),
      )
      .first();

    if (existingActivePicker && args.status === "Active") {
      throw new ConvexError(
        `Vendor ${vendor.name} already has an active picker assigned. Please deactivate the current picker first.`,
      );
    }

    const updates: Record<string, any> = {
      role_id: pickerRoleId ?? undefined,
      picker_details: {
        vendor_id: args.vendorId,
        status: args.status,
      },
      updated_at: Date.now(),
    };

    await ctx.db.patch(args.userId, updates);
    return await ctx.db.get(args.userId);
  },
});

export const removeManagerRole = mutation({
  args: {
    userId: v.id("users"),
    newRoleId: v.id("roles"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const gmRoleId = await getRoleIdByName(ctx, "General Manager");
    if (user.role_id?.toString() !== gmRoleId?.toString()) {
      throw new Error("User is not currently a general manager");
    }

    const newRole = await ctx.db.get(args.newRoleId);
    if (!newRole) {
      throw new Error("New role not found");
    }

    await ctx.db.patch(args.userId, {
      role_id: args.newRoleId,
      manager_details: undefined,
      updated_at: Date.now(),
    });

    return await ctx.db.get(args.userId);
  },
});

export const assignHubManagerWithVendor = mutation({
  args: {
    userId: v.id("users"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    const hmRoleId = await getRoleIdByName(ctx, "Hub Manager");

    // Check in-memory whether another hub manager already manages this vendor
    const allHubManagers = hmRoleId
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) => q.eq("role_id", hmRoleId))
          .collect()
      : [];
    const existingHubManager = allHubManagers.find(
      (u) =>
        u._id !== args.userId &&
        u.manager_details?.vendor_id?.includes(args.vendorId),
    );

    if (existingHubManager) {
      throw new ConvexError(
        `Vendor ${vendor.name} is already assigned to another hub manager`,
      );
    }

    const existingVendorIds = user.manager_details?.vendor_id ?? [];
    const newVendorIds = existingVendorIds.includes(args.vendorId)
      ? existingVendorIds
      : [...existingVendorIds, args.vendorId];

    const updates: Record<string, any> = {
      role_id: hmRoleId ?? undefined,
      manager_details: {
        vendor_id: newVendorIds,
        assigned_at: Date.now(),
      },
      updated_at: Date.now(),
    };

    await ctx.db.patch(args.userId, updates);
    return await ctx.db.get(args.userId);
  },
});

export const assignVendorContactWithVendor = mutation({
  args: {
    userId: v.id("users"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    const vcRoleId = await getRoleIdByName(ctx, "Vendor Contact");

    // Check in-memory whether another vendor contact already manages this vendor
    const allVendorContacts = vcRoleId
      ? await ctx.db
          .query("users")
          .withIndex("by_role_id", (q) => q.eq("role_id", vcRoleId))
          .collect()
      : [];
    const existingVendorContact = allVendorContacts.find(
      (u) =>
        u._id !== args.userId &&
        u.manager_details?.vendor_id?.includes(args.vendorId),
    );

    if (existingVendorContact) {
      throw new ConvexError(
        `Vendor ${vendor.name} is already assigned to another vendor contact`,
      );
    }

    const existingVendorIds = user.manager_details?.vendor_id ?? [];
    const newVendorIds = existingVendorIds.includes(args.vendorId)
      ? existingVendorIds
      : [...existingVendorIds, args.vendorId];

    const updates: Record<string, any> = {
      role_id: vcRoleId ?? undefined,
      manager_details: {
        vendor_id: newVendorIds,
        assigned_at: Date.now(),
      },
      updated_at: Date.now(),
    };

    await ctx.db.patch(args.userId, updates);
    return await ctx.db.get(args.userId);
  },
});

export const updateUserStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("Active"), v.literal("Inactive")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      status: args.status,
      updated_at: Date.now(),
    });
    return await ctx.db.get(args.userId);
  },
});

export const fixClerkIdMismatch = mutation({
  args: {
    email: v.string(),
    correctClerkId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (!user) {
      throw new Error(`User with email ${args.email} not found`);
    }

    console.log(`🔧 Fixing clerkId for user ${args.email}:`);
    console.log(`   Old clerkId: ${user.clerkId}`);
    console.log(`   New clerkId: ${args.correctClerkId}`);

    await ctx.db.patch(user._id, {
      clerkId: args.correctClerkId,
      updated_at: Date.now(),
    });

    const updatedUser = await ctx.db.get(user._id);
    console.log(`✅ Successfully updated clerkId for ${args.email}`);

    return updatedUser;
  },
});

export const updateUserPhone = mutation({
  args: {
    userId: v.id("users"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId, {
      phone: args.phone,
      updated_at: Date.now(),
    });

    return await ctx.db.get(args.userId);
  },
});

export const updateNotificationSettings = mutation({
  args: {
    userId: v.id("users"),
    notifications: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId, {
      notifications: args.notifications,
      updated_at: Date.now(),
    });

    return await ctx.db.get(args.userId);
  },
});

export const updateUserImage = mutation({
  args: {
    userId: v.id("users"),
    image: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId, {
      image: args.image,
      updated_at: Date.now(),
    });

    return await ctx.db.get(args.userId);
  },
});

export const getAllStaff = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));

    const pageResult = await ctx.db
      .query("users")
      .withIndex("by_isStaff", (q) => q.eq("isStaff", true))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const currentPageStaff = pageResult.page;
    const total = (
      await ctx.db
        .query("users")
        .withIndex("by_isStaff", (q) => q.eq("isStaff", true))
        .collect()
    ).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: currentPageStaff,
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

export const getVendorStaff = query({
  args: {
    vendorId: v.optional(v.id("vendors")),
    roleName: v.string(),
  },
  handler: async (ctx, args) => {
    const roleId = await getRoleIdByName(ctx, args.roleName);
    if (!roleId) return [];

    const usersWithRole = await ctx.db
      .query("users")
      .withIndex("by_role_id", (q) => q.eq("role_id", roleId))
      .collect();

    if (!args.vendorId) {
      return usersWithRole;
    }

    const vendorId = args.vendorId;
    return usersWithRole.filter(
      (user) =>
        user.rider_details?.vendor_id === vendorId ||
        user.picker_details?.vendor_id === vendorId ||
        user.manager_details?.vendor_id?.includes(vendorId),
    );
  },
});

export const bulkAssignRole = mutation({
  args: {
    userIds: v.array(v.id("users")),
    roleId: v.id("roles"),
  },
  handler: async (ctx, args) => {
    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error("Role not found");

    let updated = 0;
    for (const userId of args.userIds) {
      const user = await ctx.db.get(userId);
      if (!user) continue;
      await ctx.db.patch(userId, {
        role_id: args.roleId,
        updated_at: Date.now(),
      });
      updated++;
    }
    return { updated };
  },
});

export const userUpsertPhone = mutation({
  args: {
    clerkId: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    const userPhone = user?.phone || "";

    if (userPhone === args.phone) {
      return user;
    }

    return await ctx.db.patch(user!._id, {
      phone: args.phone,
      updated_at: Date.now(),
    });
  },
});

export const getAccountCompletionStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return await getAccountCompletion(ctx, user);
  },
});
