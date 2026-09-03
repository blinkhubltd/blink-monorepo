import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { isAccountComplete } from "../lib/account_completion";
import { getAuthUser } from "../auth.helpers";

/**
 * File uploads and rider documents.
 *
 * ── `generateUploadUrl`: authenticated, not permission-gated ──────────────
 *
 * It has callers across every app — admin catalogue screens, and the shop
 * app's own prescription upload (`apps/shop/lib/use-prescription-upload.ts`).
 * Gating it on a staff permission would lock out the one customer-facing
 * caller. It returns a one-time Convex storage upload URL and names no record
 * to attach to, so the only thing worth requiring is that the caller is a
 * signed-in Blink user at all, closing it to anonymous callers without
 * touching any legitimate one.
 *
 * `getImageUrl` resolves an already-known storage id to a URL for content that
 * is public by design — banners, category and clearance images — so it stays
 * open.
 *
 * ── The rider-document functions: internal, because nothing calls them ────
 *
 * `uploadUserIdDocument`/`uploadUserLicenseDocument`/`getUserDocuments`/
 * `deleteDocument` all took an arbitrary `userId` as a plain argument with no
 * check that the caller IS that user — so, live, any caller could overwrite or
 * delete another rider's ID or licence image, or read the URLs of anyone's.
 * They have zero callers in any app; rider onboarding never got wired to them.
 * `internal*` closes them until a real caller exists, at which point the fix is
 * an auth-derived `getMy*`/`uploadMy*` pair, not restoring these as-is.
 */

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/** @deprecated No caller anywhere in this monorepo. */
export const uploadUserIdDocument = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    if (user.rider_details?.id_image) {
      await ctx.storage.delete(user.rider_details.id_image);
    }

    const updatedDetails = {
      ...user.rider_details,
      id_image: args.storageId,
      status: user.rider_details?.status ?? ("Inactive" as const),
      vehicle_type: user.rider_details?.vehicle_type ?? ("Bicycle" as const),
    };

    await ctx.db.patch(args.userId, {
      rider_details: updatedDetails,
    });

    // Re-read user after patch to check completion with fresh data
    const updatedUser = await ctx.db.get(args.userId);
    if (updatedUser && (await isAccountComplete(ctx, updatedUser))) {
      // Account is now fully complete — activate if currently Inactive
      if (updatedUser.rider_details?.status === "Inactive") {
        await ctx.db.patch(args.userId, {
          rider_details: {
            ...updatedUser.rider_details,
            status: "Active",
          },
        });
      }
    }

    return {
      success: true,
      message: "ID document uploaded successfully",
    };
  },
});

/** @deprecated No caller anywhere in this monorepo. */
export const uploadUserLicenseDocument = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    if (user.rider_details?.license_image) {
      await ctx.storage.delete(user.rider_details.license_image);
    }

    const updatedDetails = {
      ...user.rider_details,
      license_image: args.storageId,
      status: user.rider_details?.status ?? ("Inactive" as const),
      vehicle_type: user.rider_details?.vehicle_type ?? ("Bicycle" as const),
    };

    await ctx.db.patch(args.userId, {
      rider_details: updatedDetails,
    });

    // Re-read user after patch to check completion with fresh data
    const updatedUser = await ctx.db.get(args.userId);
    if (updatedUser && (await isAccountComplete(ctx, updatedUser))) {
      // Account is now fully complete — activate if currently Inactive
      if (updatedUser.rider_details?.status === "Inactive") {
        await ctx.db.patch(args.userId, {
          rider_details: {
            ...updatedUser.rider_details,
            status: "Active",
          },
        });
      }
    }

    return {
      success: true,
      message: "License document uploaded successfully",
    };
  },
});

/** @deprecated No caller anywhere in this monorepo. */
export const getUserDocuments = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    const documents = {
      id_image: null as string | null,
      license_image: null as string | null,
      hasIdImage: !!user.rider_details?.id_image,
      hasLicenseImage: !!user.rider_details?.license_image,
    };

    // Get URLs if documents exist
    if (user.rider_details?.id_image) {
      documents.id_image = await ctx.storage.getUrl(
        user.rider_details.id_image,
      );
    }

    if (user.rider_details?.license_image) {
      documents.license_image = await ctx.storage.getUrl(
        user.rider_details.license_image,
      );
    }

    return documents;
  },
});

/** @deprecated No caller anywhere in this monorepo. */
export const deleteDocument = internalMutation({
  args: {
    userId: v.id("users"),
    documentType: v.union(v.literal("id"), v.literal("license")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const storageId =
      args.documentType === "id"
        ? user.rider_details?.id_image
        : user.rider_details?.license_image;

    if (storageId) {
      await ctx.storage.delete(storageId);

      const updateRiderDetails = { ...user.rider_details };
      if (args.documentType === "id") {
        delete updateRiderDetails.id_image;
      } else {
        delete updateRiderDetails.license_image;
      }

      const patchedRiderDetails = {
        ...updateRiderDetails,
        // Force Inactive — account is no longer complete without this document
        status: "Inactive" as const,
        vehicle_type: updateRiderDetails.vehicle_type ?? ("Bicycle" as const),
      };

      await ctx.db.patch(args.userId, {
        rider_details: patchedRiderDetails,
      });
    }

    return {
      success: true,
    };
  },
});
