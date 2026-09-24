import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { assertStaffPermission, getAuthUser } from "../auth.helpers";
import { isRider } from "../lib/roles";

/**
 * Rider onboarding: the rider submits documents, an admin approves them.
 *
 * ── The flow ─────────────────────────────────────────────────────────────
 *
 *   invited → signs in → documents missing   → rider app shows the form
 *                      → documents submitted → "under review"
 *   admin reviews on the Staff page → approveRider → rider app lets them in
 *
 * ── Why approval is its own field ────────────────────────────────────────
 *
 * `rider_details.status` is the rider's own online/offline switch
 * (`updateRiderOnlineStatus`), and "On Delivery" while dispatch has them. It
 * was also doubling as "vetted": the rider app treated anything but Active as
 * "under review". So a new rider — Inactive by default — landed on a review
 * screen with no way to submit the documents being reviewed, and an approved
 * rider who went offline was shown the same screen. `approved_at` is the
 * vetting; `status` goes back to meaning only online/offline.
 *
 * ── Guards ───────────────────────────────────────────────────────────────
 *
 * The rider's own functions (`getMyRiderOnboarding`, `submitMyRiderDocuments`)
 * derive the user from the Clerk identity and take no user id — the pattern
 * `data/files.ts` calls for, since its old `uploadUser*Document` took any
 * user id and so let anyone overwrite anyone's ID image.
 *
 * The admin's functions use `assertStaffPermission`, NOT `assertPermission`:
 * the latter passes every rider (system-role bypass), which here would let a
 * rider approve themselves.
 */

/** What a rider must submit before an admin can approve them. */
export function missingRiderDocuments(user: {
  phone?: string;
  rider_details?: { id_image?: unknown; license_image?: unknown };
}): string[] {
  const missing: string[] = [];
  if (!user.phone) missing.push("Phone number");
  if (!user.rider_details?.id_image) missing.push("ID photo");
  if (!user.rider_details?.license_image) missing.push("Licence photo");
  return missing;
}

/** Same phone rule `setMyPhone` applies. */
function normalisePhone(raw: string): string {
  const phone = raw.replace(/[\s-]/g, "");
  if (!/^\+?\d{7,15}$/.test(phone)) {
    throw new ConvexError("Enter a valid phone number.");
  }
  return phone;
}

async function storageUrl(
  ctx: QueryCtx,
  id: Id<"_storage"> | undefined,
): Promise<string | null> {
  return id ? await ctx.storage.getUrl(id) : null;
}

async function requireRider(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users"> | null,
): Promise<Doc<"users">> {
  if (!user) throw new ConvexError("User not found.");
  if (!(await isRider(ctx, user))) throw new ConvexError("This user is not a rider.");
  return user;
}

// ── The rider's own ────────────────────────────────────────────────────────

/** The signed-in rider's onboarding state, for the rider app's form. */
export const getMyRiderOnboarding = query({
  args: {},
  handler: async (ctx) => {
    const { user: authedUser } = await getAuthUser(ctx);
    const user = await ctx.db.get(authedUser._id);
    if (!user || !(await isRider(ctx, user))) return null;

    return {
      phone: user.phone || "",
      idImageUrl: await storageUrl(ctx, user.rider_details?.id_image),
      licenseImageUrl: await storageUrl(ctx, user.rider_details?.license_image),
      missing: missingRiderDocuments(user),
      approved: !!user.rider_details?.approved_at,
    };
  },
});

/**
 * Save the signed-in rider's documents. Any subset may be sent — a rider
 * re-taking one blurry photo should not have to redo the rest. Replaced
 * files are deleted from storage rather than left orphaned.
 *
 * Refused once approved: changing vetted documents afterwards would bypass
 * the review they were approved on. Their hub lead can revoke approval if a
 * document genuinely needs replacing.
 */
export const submitMyRiderDocuments = mutation({
  args: {
    phone: v.optional(v.string()),
    idImage: v.optional(v.id("_storage")),
    licenseImage: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { user: authedUser } = await getAuthUser(ctx);
    const user = await requireRider(ctx, await ctx.db.get(authedUser._id));

    if (user.rider_details?.approved_at) {
      throw new ConvexError(
        "Your account is already approved. Ask your hub lead to change your documents.",
      );
    }

    for (const id of [args.idImage, args.licenseImage]) {
      if (id && !(await ctx.db.system.get(id))) {
        throw new ConvexError("That upload did not finish. Try the photo again.");
      }
    }

    const current = user.rider_details;
    const replaced = [
      args.idImage && current?.id_image !== args.idImage ? current?.id_image : undefined,
      args.licenseImage && current?.license_image !== args.licenseImage
        ? current?.license_image
        : undefined,
    ].filter((id): id is Id<"_storage"> => !!id);

    const riderDetails = {
      // A rider who was given the role but never set up has no details yet.
      vehicle_type: "Motorbike" as const,
      status: "Inactive" as const,
      ...current,
      ...(args.idImage ? { id_image: args.idImage } : {}),
      ...(args.licenseImage ? { license_image: args.licenseImage } : {}),
    };

    await ctx.db.patch(user._id, {
      ...(args.phone !== undefined ? { phone: normalisePhone(args.phone) } : {}),
      rider_details: riderDetails,
      updated_at: Date.now(),
    });

    for (const id of replaced) await ctx.storage.delete(id);

    const updated = await ctx.db.get(user._id);
    return { missing: updated ? missingRiderDocuments(updated) : [] };
  },
});

// ── The admin's ────────────────────────────────────────────────────────────

/** A rider's submitted documents, for review on the Staff page. */
export const getRiderDocuments = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await assertStaffPermission(ctx, "users:READ");
    const user = await requireRider(ctx, await ctx.db.get(args.userId));
    const approver = user.rider_details?.approved_by
      ? await ctx.db.get(user.rider_details.approved_by)
      : null;

    return {
      phone: user.phone || null,
      idImageUrl: await storageUrl(ctx, user.rider_details?.id_image),
      licenseImageUrl: await storageUrl(ctx, user.rider_details?.license_image),
      missing: missingRiderDocuments(user),
      approvedAt: user.rider_details?.approved_at ?? null,
      approvedBy: approver?.name || approver?.email || null,
    };
  },
});

/** Approve a rider whose documents are all in. They can then go online. */
export const approveRider = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const authed = await assertStaffPermission(ctx, "users:UPDATE");
    const user = await requireRider(ctx, await ctx.db.get(args.userId));

    const missing = missingRiderDocuments(user);
    if (missing.length > 0) {
      throw new ConvexError(
        `The rider has not submitted everything yet: ${missing.join(", ")}.`,
      );
    }

    await ctx.db.patch(user._id, {
      rider_details: {
        vehicle_type: "Motorbike" as const,
        status: "Inactive" as const,
        ...user.rider_details,
        approved_at: Date.now(),
        approved_by: authed.user._id,
      },
      updated_at: Date.now(),
    });
  },
});

/**
 * Withdraw approval: the rider is taken offline and sent back to review (and
 * can replace documents again). For a document that turned out to be wrong,
 * or a rider who should stop working.
 */
export const revokeRiderApproval = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await assertStaffPermission(ctx, "users:UPDATE");
    const user = await requireRider(ctx, await ctx.db.get(args.userId));
    if (!user.rider_details) return;

    const { approved_at: _at, approved_by: _by, ...rest } = user.rider_details;
    await ctx.db.patch(user._id, {
      rider_details: { ...rest, status: "Inactive" as const },
      updated_at: Date.now(),
    });
  },
});
