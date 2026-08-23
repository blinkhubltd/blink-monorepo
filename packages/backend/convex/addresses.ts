import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "./_generated/api";

// Get user's saved addresses
export const getUserAddresses = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) return [];

    // Get the single address document for the user
    const userAddresses = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();

    if (!userAddresses) return [];

    // Return only active addresses
    return userAddresses.addresses.filter((addr) => addr.status === "Active");
  },
});

// Get user's default address
export const getDefaultAddress = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) return null;

    const userAddresses = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();

    if (!userAddresses) return null;

    // Find the default address that is active
    const defaultAddress = userAddresses.addresses.find(
      (addr) => addr.is_default && addr.status === "Active",
    );

    if (!defaultAddress) return null;

    // Return in the expected format for backward compatibility
    return {
      _id: userAddresses._id,
      label: defaultAddress.label,
      address: defaultAddress.address,
      coordinates: defaultAddress.coordinates,
      is_default: defaultAddress.is_default,
      status: defaultAddress.status,
      _creationTime: userAddresses._creationTime,
    };
  },
});

// Save a new address or update existing one with same label
export const saveAddress = mutation({
  args: {
    clerkId: v.string(),
    label: v.string(),
    address: v.object({
      address_1: v.optional(v.string()),
      address_2: v.optional(v.string()),
      city: v.optional(v.string()),
      country: v.optional(v.string()),
    }),
    coordinates: v.object({
      lat: v.float64(),
      lng: v.float64(),
    }),
    is_default: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    // Coverage enforcement: location must be within at least one active vendor radius
    const covering = await ctx.runQuery(api.coverage.vendorsCoveringPoint, {
      lat: args.coordinates.lat,
      lng: args.coordinates.lng,
    });
    if (covering.length === 0) {
      throw new ConvexError("We do not deliver to this location yet.");
    }

    // Get existing addresses document
    let userAddresses = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();

    const now = Date.now();
    const newAddress = {
      label: args.label,
      address: args.address,
      coordinates: args.coordinates,
      is_default: args.is_default,
      status: "Active" as const,
      created_at: now,
      updated_at: now,
    };

    if (!userAddresses) {
      // Create new addresses document
      const addressId = await ctx.db.insert("address", {
        user_id: user._id,
        addresses: [newAddress],
        created_at: now,
        updated_at: now,
      });
      return addressId;
    }

    // Check if address with same label exists
    const existingAddresses = [...userAddresses.addresses];
    const existingIndex = existingAddresses.findIndex(
      (addr) => addr.label === args.label,
    );

    if (existingIndex >= 0) {
      // Update existing address with same label
      existingAddresses[existingIndex] = {
        ...existingAddresses[existingIndex],
        address: args.address,
        coordinates: args.coordinates,
        is_default: args.is_default,
        status: "Active" as const,
        updated_at: now,
      };
    } else {
      // Add new address
      existingAddresses.push(newAddress);
    }

    // If setting as default, unset other default addresses
    if (args.is_default) {
      existingAddresses.forEach((addr, index) => {
        if (addr.label !== args.label) {
          existingAddresses[index] = {
            ...addr,
            is_default: false,
            updated_at: now,
          };
        }
      });
    }

    // Update the document
    await ctx.db.patch(userAddresses._id, {
      addresses: existingAddresses,
      updated_at: now,
    });

    return userAddresses._id;
  },
});

// Update existing address by label
export const updateAddress = mutation({
  args: {
    currentLabel: v.string(),
    clerkId: v.string(),
    label: v.optional(v.string()),
    address: v.optional(
      v.object({
        address_1: v.optional(v.string()),
        address_2: v.optional(v.string()),
        city: v.optional(v.string()),
        country: v.optional(v.string()),
      }),
    ),
    coordinates: v.optional(
      v.object({
        lat: v.float64(),
        lng: v.float64(),
      }),
    ),
    is_default: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    const userAddresses = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();

    if (!userAddresses) throw new Error("No addresses found for user");

    const existingAddressIndex = userAddresses.addresses.findIndex(
      (addr) => addr.label === args.currentLabel,
    );

    if (existingAddressIndex === -1) {
      throw new Error("Address not found");
    }

    const existingAddress = userAddresses.addresses[existingAddressIndex];

    // If coordinates changed, re-validate coverage
    if (args.coordinates) {
      const covering = await ctx.runQuery(api.coverage.vendorsCoveringPoint, {
        lat: args.coordinates.lat,
        lng: args.coordinates.lng,
      });
      if (covering.length === 0) {
        throw new ConvexError("Updated location is outside our delivery area.");
      }
    }

    const now = Date.now();
    const updatedAddresses = [...userAddresses.addresses];

    // Update the specific address
    updatedAddresses[existingAddressIndex] = {
      ...existingAddress,
      ...(args.label && { label: args.label }),
      ...(args.address && { address: args.address }),
      ...(args.coordinates && { coordinates: args.coordinates }),
      ...(args.is_default !== undefined && { is_default: args.is_default }),
      updated_at: now,
    };

    // If setting as default, unset other defaults
    if (args.is_default) {
      updatedAddresses.forEach((addr, index) => {
        if (index !== existingAddressIndex) {
          updatedAddresses[index] = {
            ...addr,
            is_default: false,
            updated_at: now,
          };
        }
      });
    }

    await ctx.db.patch(userAddresses._id, {
      addresses: updatedAddresses,
      updated_at: now,
    });

    return userAddresses._id;
  },
});

// Set an address as default by label
export const setDefaultAddress = mutation({
  args: {
    clerkId: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    // Get user's addresses document
    const userAddresses = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();

    if (!userAddresses) throw new Error("No addresses found for user");

    // Find the address with the given label
    const targetAddress = userAddresses.addresses.find(
      (addr) => addr.label === args.label && addr.status === "Active",
    );

    if (!targetAddress) {
      throw new Error("Address not found or inactive");
    }

    const now = Date.now();
    const updatedAddresses = userAddresses.addresses.map((addr) => ({
      ...addr,
      is_default: addr.label === args.label,
      updated_at: now,
    }));

    // Update the document
    await ctx.db.patch(userAddresses._id, {
      addresses: updatedAddresses,
      updated_at: now,
    });

    return userAddresses._id;
  },
});

// Delete address by label (mark as inactive)
export const deleteAddress = mutation({
  args: {
    label: v.string(),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    const userAddresses = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();

    if (!userAddresses) throw new Error("No addresses found for user");

    const targetAddress = userAddresses.addresses.find(
      (addr) => addr.label === args.label,
    );

    if (!targetAddress) {
      throw new Error("Address not found");
    }

    const now = Date.now();
    const updatedAddresses = userAddresses.addresses.map((addr) =>
      addr.label === args.label
        ? { ...addr, status: "Inactive" as const, updated_at: now }
        : addr,
    );

    await ctx.db.patch(userAddresses._id, {
      addresses: updatedAddresses,
      updated_at: now,
    });

    return userAddresses._id;
  },
});

// Search nearby addresses (for suggestions)
export const searchNearbyAddresses = query({
  args: {
    clerkId: v.string(),
    lat: v.float64(),
    lng: v.float64(),
    radius: v.optional(v.number()), // in kilometers, default 5km
  },
  handler: async (ctx, args) => {
    const radius = args.radius || 5;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) return [];

    const userAddresses = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();

    if (!userAddresses) return [];

    // Filter active addresses within radius
    return userAddresses.addresses.filter((addr) => {
      if (addr.status !== "Active") return false;

      const distance =
        Math.sqrt(
          Math.pow(addr.coordinates.lat - args.lat, 2) +
            Math.pow(addr.coordinates.lng - args.lng, 2),
        ) * 111; // Rough conversion to km

      return distance <= radius;
    });
  },
});

// Fetch default address (alias for getDefaultAddress)
export const fetchDefaultAddress = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) return null;

    const userAddresses = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();

    if (!userAddresses) return null;

    const defaultAddress = userAddresses.addresses.find(
      (addr) => addr.is_default && addr.status === "Active",
    );

    if (!defaultAddress) return null;

    // Return in the expected format for backward compatibility
    return {
      _id: userAddresses._id,
      label: defaultAddress.label,
      address: defaultAddress.address,
      coordinates: defaultAddress.coordinates,
      is_default: defaultAddress.is_default,
      status: defaultAddress.status,
      _creationTime: userAddresses._creationTime,
    };
  },
});
