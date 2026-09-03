import { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { getAuthUser } from "../auth.helpers";
import { readVendorsCoveringPoint } from "./coverage";
import { api } from "../_generated/api";

// Get user's saved addresses
/**
 * @deprecated Takes `clerkId` as an argument rather than deriving identity from
 * the auth token, so any client can read any customer's saved addresses. Use
 * `getMyAddresses` below. Retained only until the standalone app retires.
 */
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
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's addresses. Use `getMyAddresses` and pick the default from it.
 * Retained only until the standalone app retires.
 */
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
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's addresses. Use `saveMyAddress`.
 * Retained only until the standalone app retires.
 */
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
    const covering = await ctx.runQuery(api.data.coverage.vendorsCoveringPoint, {
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
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's addresses. Use `saveMyAddress`, which replaces a same-labelled entry.
 * Retained only until the standalone app retires.
 */
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
      const covering = await ctx.runQuery(api.data.coverage.vendorsCoveringPoint, {
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
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's addresses. Use `setMyDefaultAddress`.
 * Retained only until the standalone app retires.
 */
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
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's addresses. Use `deleteMyAddress`.
 * Retained only until the standalone app retires.
 */
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
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's addresses. No caller. Use `getMyAddresses`.
 * Retained only until the standalone app retires.
 */
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
/**
 * @deprecated Takes the actor as an argument rather than deriving it from
 * the auth token, so any client can act on any customer's addresses. Use `getMyAddresses`.
 * Retained only until the standalone app retires.
 */
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

/**
 * The caller's own saved addresses.
 *
 * Auth-derived. `getUserAddresses` above takes `clerkId` as an ARGUMENT, so any
 * client can read any customer's saved addresses — home address, coordinates and
 * all. Same class as the cart IDOR, and rather more sensitive.
 *
 * Returns an empty array rather than throwing when signed out, so the checkout
 * screen renders an explanation instead of crashing.
 */
export const getMyAddresses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return [];

    const doc = await ctx.db
      .query("address")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .unique();
    if (!doc) return [];

    return doc.addresses.filter((a) => a.status === "Active");
  },
});

// ── The caller's own addresses ────────────────────────────────────────────
//
// Every mutation above takes `clerkId` as an argument and looks the user up by
// it, so anyone holding a Clerk id — which is not a secret; it appears in JWTs,
// logs and webhook payloads — can add, rename, re-default or delete another
// customer's addresses. Deleting one is a denial of delivery. Adding one is
// worse, because a rider will be sent to it.
//
// These three derive the caller from the token and accept no identity at all.

/** Shape shared by the auth-derived address writes. */
const AddressBody = {
  address_1: v.optional(v.string()),
  address_2: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
};

const Coordinates = { lat: v.float64(), lng: v.float64() };

/**
 * The label IS the identity of an address within the document.
 *
 * That is the existing model — `saveAddress` overwrites a same-labelled entry
 * and `deleteAddress` matches on it — and it is kept rather than changed, since
 * placed orders carry the label. It does mean a customer cannot have two
 * addresses called "Home", so the UI must say that saving replaces rather than
 * adds; and whitespace is normalised here so "Home " and "Home" cannot become
 * two entries that look identical in a list and behave differently.
 */
function normaliseLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new ConvexError("Give this address a name.");
  if (trimmed.length > 40) throw new ConvexError("That name is too long.");
  return trimmed;
}

async function myAddressDoc(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("address")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .unique();
}

/**
 * Save (or replace) one of the caller's addresses.
 *
 * Coverage is enforced in the same transaction as the write, through
 * `readVendorsCoveringPoint`, rather than by a `ctx.runQuery` hop — the hop is a
 * separate transaction, so a vendor deactivated in between let a write pass a
 * check that was no longer true.
 *
 * The first address a customer saves becomes their default whatever was asked
 * for. An address book with no default makes checkout choose arbitrarily, which
 * is how a parcel goes to an old flat.
 */
export const saveMyAddress = mutation({
  args: {
    label: v.string(),
    address: v.object(AddressBody),
    coordinates: v.object(Coordinates),
    is_default: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);
    const label = normaliseLabel(args.label);

    const covering = await readVendorsCoveringPoint(ctx, args.coordinates);
    if (covering.length === 0) {
      throw new ConvexError("We do not deliver to this location yet.");
    }

    const now = Date.now();
    const doc = await myAddressDoc(ctx, user._id);

    if (!doc) {
      await ctx.db.insert("address", {
        user_id: user._id,
        addresses: [
          {
            label,
            address: args.address,
            coordinates: args.coordinates,
            is_default: true,
            status: "Active" as const,
            created_at: now,
            updated_at: now,
          },
        ],
        created_at: now,
        updated_at: now,
      });
      return { label, replaced: false, madeDefault: true };
    }

    const existing = [...doc.addresses];
    const index = existing.findIndex((a) => a.label === label);
    const replaced = index >= 0;

    // Default if asked for, if this entry already was, or if nothing active is.
    const someoneElseIsDefault = existing.some(
      (a) => a.status === "Active" && a.is_default && a.label !== label,
    );
    const makeDefault =
      args.is_default === true ||
      (replaced && existing[index]!.is_default === true) ||
      !someoneElseIsDefault;

    const entry = {
      label,
      address: args.address,
      coordinates: args.coordinates,
      is_default: makeDefault,
      status: "Active" as const,
      // Preserved on replace: the creation time is used to pick a replacement
      // default when one is deleted, so resetting it here would reorder that.
      created_at: replaced ? existing[index]!.created_at : now,
      updated_at: now,
    };

    if (replaced) existing[index] = entry;
    else existing.push(entry);

    const addresses = makeDefault
      ? existing.map((a) =>
          a.label === label ? a : { ...a, is_default: false, updated_at: now },
        )
      : existing;

    await ctx.db.patch(doc._id, { addresses, updated_at: now });
    return { label, replaced, madeDefault: makeDefault };
  },
});

/** Make one of the caller's own addresses their default. */
export const setMyDefaultAddress = mutation({
  args: { label: v.string() },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);
    const doc = await myAddressDoc(ctx, user._id);
    if (!doc) throw new ConvexError("Address not found.");

    const target = doc.addresses.find(
      (a) => a.label === args.label && a.status === "Active",
    );
    if (!target) throw new ConvexError("Address not found.");

    const now = Date.now();
    await ctx.db.patch(doc._id, {
      addresses: doc.addresses.map((a) => ({
        ...a,
        is_default: a.label === args.label,
        updated_at: now,
      })),
      updated_at: now,
    });
    return { label: args.label };
  },
});

/**
 * Retire one of the caller's own addresses.
 *
 * Marked Inactive rather than removed: placed orders carry the label, and a
 * support call about last week's delivery needs the address to still exist.
 *
 * Deleting the default promotes the oldest surviving address rather than leaving
 * the book with none — see the note on `saveMyAddress`.
 */
export const deleteMyAddress = mutation({
  args: { label: v.string() },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);
    const doc = await myAddressDoc(ctx, user._id);
    if (!doc) throw new ConvexError("Address not found.");

    const target = doc.addresses.find(
      (a) => a.label === args.label && a.status === "Active",
    );
    if (!target) throw new ConvexError("Address not found.");

    const now = Date.now();
    let addresses = doc.addresses.map((a) =>
      a.label === args.label
        ? {
            ...a,
            status: "Inactive" as const,
            is_default: false,
            updated_at: now,
          }
        : a,
    );

    if (target.is_default) {
      const survivors = addresses.filter((a) => a.status === "Active");
      // Oldest first: the address they have had longest is the safest guess,
      // and it is deterministic, which an arbitrary pick is not.
      const promote = [...survivors].sort(
        (a, b) => a.created_at - b.created_at,
      )[0];
      if (promote) {
        addresses = addresses.map((a) =>
          a.label === promote.label
            ? { ...a, is_default: true, updated_at: now }
            : a,
        );
      }
    }

    await ctx.db.patch(doc._id, { addresses, updated_at: now });
    return { label: args.label, promoted: target.is_default };
  },
});
