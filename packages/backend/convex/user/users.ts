import { internalMutation, mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import {
  UsersUpdateValidator,
  pickerStatus,
  recordStatus,
  riderStatus,
  vehicleTypes,
} from "../validators";
import { validateRiderActivation } from "../lib/account_completion";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getUserRoleName,
  getRoleIdByName,
  isSystemRole,
  SYSTEM_ROLES,
} from "../lib/roles";
import { getAccountCompletion } from "../lib/account_completion";
import {
  assertPermission,
  assertStaffOrPermission,
  assertStaffPermission,
} from "../auth.helpers";

// Exported so bootstrap.ts builds the same search text when it self-provisions
// a user, rather than inserting a row that role search cannot find.
export const computeUserSearchText = (user: {
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
    status: v.optional(v.union(...riderStatus.map((e) => v.literal(e)))),
    vehicle_type: v.optional(v.union(...vehicleTypes.map((e) => v.literal(e)))),
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
    status: v.union(...riderStatus.map((e) => v.literal(e))),
    vehicle_type: v.union(...vehicleTypes.map((e) => v.literal(e))),
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
    status: v.optional(v.union(...recordStatus.map((e) => v.literal(e)))),
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
    status: v.union(...recordStatus.map((e) => v.literal(e))),
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
    status: v.optional(v.union(...pickerStatus.map((e) => v.literal(e)))),
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
    status: v.union(...pickerStatus.map((e) => v.literal(e))),
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
    /**
     * The role an admin invitation asked for — read by the webhook out of
     * Clerk's `public_metadata` on the new user, never out of anything the
     * client can set. `public_metadata` is Backend-API-only: a self-signup
     * cannot put a value there, only `invitations.createInvitation`
     * (`user/invitations.ts`) can, so a name arriving here really did come
     * from an admin's own invite.
     *
     * Applied ONLY on first creation, a few lines down — never on an update
     * to an existing account. An update replaying old metadata (a stale
     * webhook retry, Clerk resending an event) must never silently change a
     * role someone may since have been demoted from or promoted past.
     */
    roleName: v.optional(v.string()),
    /**
     * The vendor an invitation asked for. `validateInvite`
     * (`user/invitations.ts`) requires this whenever `roleName` resolves to
     * "rider" or "picker" — those two roles are meaningless unassigned to a
     * vendor, the same rule `assignRoleToUser` enforces when promoting an
     * existing user. Ignored for any other role. Same CREATE-only guarantee
     * as `roleName`.
     */
    vendorId: v.optional(v.id("vendors")),
    /** Rider-only extras, same as `assignRoleToUser`'s `rider_vehicle_*` args. */
    riderVehicleType: v.optional(
      v.union(...vehicleTypes.map((e) => v.literal(e))),
    ),
    riderVehiclePlate: v.optional(v.string()),
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

      // An invited role wins over the default — someone who followed an
      // admin's invite link is joining AS staff/agent/whatever the invite
      // said, not as a customer who happens to also hold that role later.
      // Falls through to the default (normally "Customer") when the name
      // does not resolve, same as an ordinary self-signup.
      const invitedRoleId = args.roleName
        ? await getRoleIdByName(ctx, args.roleName)
        : null;

      const defaultRole = invitedRoleId
        ? null
        : await ctx.db
            .query("roles")
            .withIndex("by_is_default", (q) => q.eq("is_default", true))
            .first();

      // Rider and picker are meaningless unassigned to a vendor —
      // `assignRoleToUser` enforces the same thing for an existing user
      // being promoted, and `validateInvite` already refused to send the
      // invitation in the first place if this role required a vendor and
      // none was given. This just carries that same vendor onto the account
      // `upsertUser` is about to create.
      const invitedRoleDoc = invitedRoleId ? await ctx.db.get(invitedRoleId) : null;
      const invitedRoleLower = invitedRoleDoc?.name.trim().toLowerCase();
      const riderDetails =
        invitedRoleLower === "rider" && args.vendorId
          ? {
              vendor_id: args.vendorId,
              vehicle_type: args.riderVehicleType ?? ("Motorbike" as const),
              vehicle_plate: args.riderVehiclePlate,
              status: "Inactive" as const,
            }
          : undefined;
      const pickerDetails =
        invitedRoleLower === "picker" && args.vendorId
          ? { vendor_id: args.vendorId, status: "Inactive" as const }
          : undefined;

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
        role_id: invitedRoleId ?? defaultRole?._id,
        ...(riderDetails ? { rider_details: riderDetails } : {}),
        ...(pickerDetails ? { picker_details: pickerDetails } : {}),
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
    status: v.optional(v.union(...recordStatus.map((e) => v.literal(e)))),
    /**
     * A role NAME ("Customer", "Rider", …), not a role id — every caller of
     * this query knows roles by name (it is what the nav links and the page
     * itself think in), so resolving it here keeps that lookup in one place
     * rather than every caller doing its own `getRoleIdByName` round trip
     * first. Case-insensitive, same as `getRoleIdByName` itself.
     *
     * Omitted, this returns every user regardless of role — which is what a
     * platform-wide search still needs. The "Customers" page is the one
     * caller that always passes `role: "Customer"`; without a role filter it
     * showed staff and super admins in a table titled "Customers" because
     * this query had no way to exclude them.
     */
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));
    const search = args.search?.trim();
    const status = args.status;

    const roleId = args.role
      ? await getRoleIdByName(ctx, args.role)
      : undefined;
    // A role name that does not resolve must exclude everything, not fall
    // back to unfiltered — otherwise the Customers page would start showing
    // every user in the platform the moment that role was renamed or
    // deleted, which is a worse failure than an empty table.
    if (args.role && !roleId) {
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
          .withSearchIndex("search_text", (q) => {
            const sq = q.search("searchText", search);
            const scoped = roleId ? sq.eq("role_id", roleId) : sq;
            return status ? scoped.eq("status", status) : scoped;
          });
      }

      const base = roleId
        ? ctx.db
            .query("users")
            .withIndex("by_role_id", (q) => q.eq("role_id", roleId))
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
    status: v.optional(v.union(...recordStatus.map((e) => v.literal(e)))),
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
/**
 * Nine role-assigning mutations, found while sweeping for other `isStaff`-shaped
 * auth gaps after fixing `data/prescription_rejection_reasons.ts` and
 * `getAllStaff`/`getVendorStaff`/`bulkAssignRole` above. ALL NINE had zero
 * authorization — not even `ctx.auth.getUserIdentity()` — despite every one of
 * them patching `role_id` on an arbitrary user. An unauthenticated caller who
 * knew a user id and the Super Admin role id could grant it to anyone.
 *
 * Split per the migration plan's own playbook (Phase B1a): the three with a
 * live caller (`assignRoleToUser`, `assignRiderWithDetails`,
 * `assignPickerWithDetails`, all called from components/users/*Dialog.tsx) are
 * gated with `assertPermission(ctx, "users:UPDATE")`. The five with NO caller
 * anywhere in this monorepo (`updateUserRole`, `assignGeneralManager`,
 * `removeManagerRole`, `assignHubManagerWithVendor`,
 * `assignVendorContactWithVendor`) become `internalMutation` — a client cannot
 * reach a function it never had a reason to call, so there is nothing to gate.
 */

export const updateUserRole = internalMutation({
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

/** A role assignment's vendor-scoped args, shared by every caller below. */
const vendorScopedRoleArgs = {
  vendor_id: v.optional(v.id("vendors")),
  // Array of vendor IDs for manager roles (multi-vendor assignment)
  vendor_ids: v.optional(v.array(v.id("vendors"))),
  // Rider-specific extras (only when role name is "rider")
  rider_vehicle_type: v.optional(
    v.union(...vehicleTypes.map((e) => v.literal(e))),
  ),
  rider_vehicle_plate: v.optional(v.string()),
};

/**
 * Rider, picker and manager are the three roles `manages_vendor` covers, and
 * each stores its vendor in a different place with a different shape — this
 * is that branch, shared by every place a vendor can be attached to a role
 * assignment (`assignRoleToUser` for one user, `bulkAssignRole` for many).
 * Two callers duplicating it is exactly how one of them would end up
 * skipping the rider/picker case the way `bulkAssignRole` used to.
 *
 * Returns {} when the role does not manage a vendor, or when it does but no
 * vendor was actually given — the same permissiveness `assignRoleToUser`
 * always had. The caller's own UI is what requires a selection before this
 * is ever reached; this only decides where a vendor goes once there is one.
 */
function vendorScopedUpdates(
  role: { name: string; manages_vendor: boolean },
  args: {
    vendor_id?: Id<"vendors">;
    vendor_ids?: Id<"vendors">[];
    rider_vehicle_type?: (typeof vehicleTypes)[number];
    rider_vehicle_plate?: string;
  },
): Record<string, any> {
  const hasVendor =
    !!args.vendor_id || (args.vendor_ids !== undefined && args.vendor_ids.length > 0);
  if (!role.manages_vendor || !hasVendor) return {};

  const roleLower = role.name.trim().toLowerCase();
  if (roleLower === "rider") {
    return {
      rider_details: {
        vendor_id: args.vendor_id,
        vehicle_type: args.rider_vehicle_type ?? "Motorbike",
        vehicle_plate: args.rider_vehicle_plate,
        status: "Inactive" as const,
      },
    };
  }
  if (roleLower === "picker") {
    return {
      picker_details: { vendor_id: args.vendor_id, status: "Inactive" as const },
    };
  }
  // Any other vendor-managing role → manager_details.
  // Prefer vendor_ids array; fall back to wrapping single vendor_id.
  const ids =
    args.vendor_ids && args.vendor_ids.length > 0
      ? args.vendor_ids
      : args.vendor_id
        ? [args.vendor_id]
        : [];
  return { manager_details: { vendor_id: ids, assigned_at: Date.now() } };
}

/** Assign a dynamic role (from the roles table) to a user. Called from
 * components/users/RoleAssignmentDialog.tsx. */
export const assignRoleToUser = mutation({
  args: {
    userId: v.id("users"),
    roleId: v.id("roles"),
    ...vendorScopedRoleArgs,
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "users:UPDATE");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error("Role not found");

    const updates: Record<string, any> = {
      role_id: args.roleId,
      updated_at: Date.now(),
      ...vendorScopedUpdates(role, args),
    };

    await ctx.db.patch(args.userId, updates);
    return await ctx.db.get(args.userId);
  },
});

export const assignGeneralManager = internalMutation({
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

/** Called from components/users/RiderDetailsDialog.tsx. */
export const assignRiderWithDetails = mutation({
  args: {
    userId: v.id("users"),
    vehicleType: v.union(...vehicleTypes.map((e) => v.literal(e))),
    vehiclePlate: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    status: v.union(...riderStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "users:UPDATE");
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

/** Called from components/users/PickerDetailsDialog.tsx. */
export const assignPickerWithDetails = mutation({
  args: {
    userId: v.id("users"),
    vendorId: v.id("vendors"),
    status: v.union(...pickerStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "users:UPDATE");
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

export const removeManagerRole = internalMutation({
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

export const assignHubManagerWithVendor = internalMutation({
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

export const assignVendorContactWithVendor = internalMutation({
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
    status: v.union(...recordStatus.map((e) => v.literal(e))),
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

/**
 * Every staff member: name, email, phone, role. Had NO auth check at all —
 * `ctx.auth.getUserIdentity()` was never called, so an unauthenticated request
 * to the deployment URL returned the full staff directory. Found while sweeping
 * for other `isStaff`-shaped gates after fixing
 * `data/prescription_rejection_reasons.ts`; unrelated bug, same file, same pass.
 */
/**
 * ── Who counts as staff ───────────────────────────────────────────────────
 *
 * Anyone holding a role other than Customer — riders, pickers, managers,
 * admins — which is the same line the Customers page (`getUsers` with
 * `role: "Customer"`) draws from the other side, so every account with a role
 * appears on exactly one of the two pages.
 *
 * This used to read the `isStaff` boolean alone, which no write path in this
 * codebase ever sets (see `data/prescription_rejection_reasons.ts`). So the
 * Staff page was empty on every deployment, whatever roles people held. A
 * legacy `isStaff: true` row is still included, so nothing that was listed
 * before disappears.
 *
 * `roleId` narrows to one role (the page's role filter). The cursor is a
 * plain offset: staff are gathered from one index read per role and merged,
 * which a Convex cursor cannot page across — and a staff list is small
 * enough that reading it whole is the honest cost, not a hidden one.
 */
export const getAllStaff = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    roleId: v.optional(v.id("roles")),
  },
  handler: async (ctx, args) => {
    await assertStaffOrPermission(ctx, "staff:READ");
    const limit = Math.max(1, Math.min(1000, args.limit));

    const roles = await ctx.db.query("roles").collect();
    const staffRoles = roles.filter(
      (r) =>
        r.name.trim().toLowerCase() !== "customer" &&
        (!args.roleId || r._id === args.roleId),
    );

    const byId = new Map<Id<"users">, Doc<"users">>();
    for (const role of staffRoles) {
      const holders = await ctx.db
        .query("users")
        .withIndex("by_role_id", (q) => q.eq("role_id", role._id))
        .collect();
      for (const user of holders) byId.set(user._id, user);
    }
    if (!args.roleId) {
      const flagged = await ctx.db
        .query("users")
        .withIndex("by_isStaff", (q) => q.eq("isStaff", true))
        .collect();
      for (const user of flagged) byId.set(user._id, user);
    }

    const all = [...byId.values()].sort((a, b) =>
      (a.name || a.email || "").localeCompare(b.name || b.email || ""),
    );

    const offset = Math.max(0, Number.parseInt(args.cursor ?? "0", 10) || 0);
    const page = all.slice(offset, offset + limit);
    const next = offset + limit;
    const total = all.length;

    return {
      data: page,
      pagination: {
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: next < total,
        cursor: next < total ? String(next) : null,
      },
    };
  },
});

/**
 * Edit an existing rider's details from the Staff page.
 *
 * MERGES into `rider_details` rather than replacing it — unlike
 * `assignRiderWithDetails`, which is for making someone a rider and writes a
 * fresh object. Replacing here would silently drop the rider's rating,
 * last known location and uploaded ID/licence images every time an admin
 * changed their vehicle plate.
 *
 * No `status` here. `rider_details.status` is the rider's own online/offline
 * switch (and "On Delivery" while dispatched); whether they may work at all
 * is approval — `approveRider` in `user/rider_onboarding.ts`.
 *
 * `assertStaffPermission`, not `assertPermission`: the latter lets any rider
 * through (the system-role bypass), which would let a rider rewrite their own
 * vendor.
 */
export const updateRiderDetails = mutation({
  args: {
    userId: v.id("users"),
    vendorId: v.id("vendors"),
    vehicleType: v.union(...vehicleTypes.map((e) => v.literal(e))),
    vehiclePlate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertStaffPermission(ctx, "users:UPDATE");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("User not found.");
    if ((await getUserRoleName(ctx, user))?.trim().toLowerCase() !== "rider") {
      throw new ConvexError("This user is not a rider.");
    }
    if (!(await ctx.db.get(args.vendorId))) {
      throw new ConvexError("That vendor no longer exists.");
    }

    const riderDetails = {
      ...user.rider_details,
      vendor_id: args.vendorId,
      vehicle_type: args.vehicleType,
      vehicle_plate: args.vehiclePlate?.trim() || undefined,
      // A rider never set up has no status yet; they start offline.
      status: user.rider_details?.status ?? ("Inactive" as const),
    };

    await ctx.db.patch(args.userId, {
      rider_details: riderDetails,
      updated_at: Date.now(),
    });
    return await ctx.db.get(args.userId);
  },
});

/**
 * Edit an existing picker's details from the Staff page. Merges, like
 * `updateRiderDetails`, and keeps `assignPickerWithDetails`'s rule that a
 * vendor has at most one Active picker.
 */
export const updatePickerDetails = mutation({
  args: {
    userId: v.id("users"),
    vendorId: v.id("vendors"),
    status: v.union(...pickerStatus.map((e) => v.literal(e))),
  },
  handler: async (ctx, args) => {
    await assertStaffPermission(ctx, "users:UPDATE");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("User not found.");
    if ((await getUserRoleName(ctx, user))?.trim().toLowerCase() !== "picker") {
      throw new ConvexError("This user is not a picker.");
    }
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError("That vendor no longer exists.");

    if (args.status === "Active") {
      const otherActive = await ctx.db
        .query("users")
        .withIndex("by_role_id_picker_vendor", (q) =>
          q.eq("role_id", user.role_id).eq("picker_details.vendor_id", args.vendorId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("picker_details.status"), "Active"),
            q.neq(q.field("_id"), args.userId),
          ),
        )
        .first();
      if (otherActive) {
        throw new ConvexError(
          `${vendor.name} already has an active picker. Deactivate them first.`,
        );
      }
    }

    await ctx.db.patch(args.userId, {
      picker_details: {
        ...user.picker_details,
        vendor_id: args.vendorId,
        status: args.status,
      },
      updated_at: Date.now(),
    });
    return await ctx.db.get(args.userId);
  },
});

/** Riders/pickers/managers for a vendor, by role name. Same missing-auth bug. */
export const getVendorStaff = query({
  args: {
    vendorId: v.optional(v.id("vendors")),
    roleName: v.string(),
  },
  handler: async (ctx, args) => {
    await assertStaffOrPermission(ctx, "staff:READ");
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

/**
 * Reassign a role to a batch of users.
 *
 * The most severe of the three: this had no auth check whatsoever, not even a
 * signed-in requirement, and it grants ROLES. An unauthenticated request naming
 * a wildcard role's id and any user's id — including the caller's own, once
 * self-registered via `/setup`'s webhook path — would have made them Super
 * Admin. Gated on `users:UPDATE`, matching the /users page this is called from
 * (components/users/UsersTable.tsx).
 */
/**
 * Bulk role assignment, called from the "Customers" table's own bulk-action
 * bar (`components/users/UsersTable.tsx`) — separate from `assignRoleToUser`
 * because it patches many users in one call, not because the rule is any
 * different: rider, picker and manager are exactly as vendor-scoped here as
 * they are one at a time. Before `vendorScopedUpdates` existed, this mutation
 * set `role_id` alone and nothing else, so bulk-assigning ten people as
 * riders left all ten with no `vendor_id` at all — invisible to every
 * vendor-scoped view until someone opened each one individually to fix it.
 *
 * One vendor (or, for a manager, one set of vendors) applies to the WHOLE
 * batch — there is no per-user vendor in a bulk action, which is the entire
 * point of it being bulk. A vendor lead splitting ten new hires across two
 * vendors runs this twice, once per vendor, same as they would with two
 * separate single-person assignments.
 */
export const bulkAssignRole = mutation({
  args: {
    userIds: v.array(v.id("users")),
    roleId: v.id("roles"),
    ...vendorScopedRoleArgs,
  },
  handler: async (ctx, args) => {
    await assertPermission(ctx, "users:UPDATE");
    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error("Role not found");

    const vendorUpdates = vendorScopedUpdates(role, args);

    let updated = 0;
    for (const userId of args.userIds) {
      const user = await ctx.db.get(userId);
      if (!user) continue;
      await ctx.db.patch(userId, {
        role_id: args.roleId,
        updated_at: Date.now(),
        ...vendorUpdates,
      });
      updated++;
    }
    return { updated };
  },
});

/**
 * @deprecated Takes `clerkId` as an argument, so any client can rewrite any
 * customer's phone number. Use `setMyPhone` below.
 */
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

/**
 * Set the caller's own phone number.
 *
 * Auth-derived. `userUpsertPhone` above takes `clerkId` as an ARGUMENT and
 * patches that user, so any client could rewrite any customer's phone number —
 * which is the number a rider calls and, on some flows, a recovery channel.
 * Same class as the cart and address IDORs.
 */
export const setMyPhone = mutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new ConvexError("User not found");

    const phone = args.phone.replace(/[\s-]/g, "");
    // Same rule the checkout screen validates against, applied server-side too
    // so a client that skips validation cannot store a number nobody can call.
    if (!/^\+?\d{7,15}$/.test(phone)) {
      throw new ConvexError("Enter a valid phone number");
    }

    await ctx.db.patch(user._id, { phone, updated_at: Date.now() });
    return { ok: true };
  },
});

/**
 * The caller's own phone number, or `null` when none is on file.
 *
 * Its own query rather than a field on `access.getMyAccess`: that one answers
 * "what may this caller do" for every app including admin, and contact details
 * are not an authorisation fact. Checkout and edit-profile previously read
 * `phone` off `getMyAccess` through a cast — a field it never returned — so a
 * saved number always read as missing and the phone gate could never clear.
 *
 * `undefined` (loading) vs `null` (signed in, nothing saved) is kept distinct so
 * a screen does not flash the empty form before the answer arrives.
 */
export const getMyPhone = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    const phone = user?.phone?.trim();
    return phone ? phone : null;
  },
});
