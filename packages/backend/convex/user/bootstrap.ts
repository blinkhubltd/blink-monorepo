import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  isSuperAdminPermissions,
  rolePresets,
  SUPER_ADMIN_ROLE_NAME,
  validateRolePresets,
} from "../lib/role_presets";
import { buildSearchText } from "./roles";

/**
 * First-run setup: seed the roles, and give the first person to ask the keys.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * A fresh deployment is a locked room. The `roles` table is empty, so the Clerk
 * webhook creates users with `role_id: undefined`, so every gate denies them,
 * so nobody can reach the roles page to create the role that would let them in.
 * Seeding from a script is the usual answer, but `convex run` needs a deploy key
 * with `deployment:functions:run` and ours does not have it — and a setup step
 * that only works from one machine is not a setup step.
 *
 * ── Why it is safe to leave deployed ─────────────────────────────────────
 *
 * `claimSuperAdmin` is public, and it must be: the caller has no role yet, so
 * there is no permission it could require. What makes that acceptable is that it
 * is SELF-CLOSING. It refuses the moment any user holds a wildcard role. So the
 * window is open exactly once, from an empty database to the first claim, and
 * every later call — from anyone, authenticated or not — is rejected.
 *
 * That window is a real exposure and worth naming: between deploying and
 * claiming, any authenticated Clerk user can take it. Two mitigations, in order
 * of strength:
 *
 *   1. Set `BOOTSTRAP_SUPERADMIN_EMAIL` on the deployment. The claim then also
 *      requires the caller's email to match it, which closes the window
 *      entirely. Recommended for production.
 *   2. Claim it immediately after deploying, before anyone else signs up.
 *
 * A third option is to not deploy this at all and seed through `seedRoles` +
 * `promoteToSuperAdminByEmail` (both internal, so they need dashboard or CLI access)
 * and delete this module. That is the right choice once the platform is live.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * Is there already someone with absolute access?
 *
 * By permission rather than by name, so renaming the role does not reopen the
 * window and creating a differently-named wildcard role does not leave it open.
 * A wildcard role with no users assigned does NOT count as claimed — otherwise
 * seeding the roles would lock the door before anyone was inside.
 */
async function findSuperAdmin(
  ctx: QueryCtx,
): Promise<{ user: Doc<"users">; role: Doc<"roles"> } | null> {
  const roles = await ctx.db.query("roles").collect();
  const wildcardRoles = roles.filter((r) =>
    isSuperAdminPermissions(r.permissions),
  );

  for (const role of wildcardRoles) {
    const holder = await ctx.db
      .query("users")
      .withIndex("by_role_id", (q) => q.eq("role_id", role._id))
      .first();
    if (holder) return { user: holder, role };
  }
  return null;
}

/**
 * Create any missing preset role, leaving existing ones untouched.
 *
 * Idempotent and additive. It never patches a role that already exists: by the
 * time this runs a second time someone may have edited permissions through the
 * roles page, and overwriting that would silently revoke access.
 */
async function ensureRoles(ctx: MutationCtx): Promise<{
  created: string[];
  existing: string[];
  superAdminRoleId: Id<"roles">;
}> {
  const problems = validateRolePresets();
  if (problems.length > 0) {
    // A bad preset would produce a deployment nobody can sign in to, so this
    // fails loudly at seed time rather than quietly at first login.
    throw new ConvexError(`Role presets are invalid: ${problems.join("; ")}`);
  }

  const existingRoles = await ctx.db.query("roles").collect();
  const byName = new Map(
    existingRoles.map((r) => [r.name.trim().toLowerCase(), r]),
  );

  const created: string[] = [];
  const existing: string[] = [];
  let superAdminRoleId: Id<"roles"> | null = null;

  for (const preset of rolePresets) {
    const match = byName.get(preset.name.trim().toLowerCase());
    if (match) {
      existing.push(match.name);
      if (isSuperAdminPermissions(match.permissions)) {
        superAdminRoleId = match._id;
      }
      continue;
    }

    // Only claim `is_default` if nothing else already holds it. Two default
    // roles would make which one a new signup receives depend on index order.
    const defaultTaken = existingRoles.some((r) => r.is_default);

    const id = await ctx.db.insert("roles", {
      name: preset.name,
      description: preset.description,
      permissions: preset.permissions,
      is_default: preset.is_default && !defaultTaken,
      manages_vendor: preset.manages_vendor,
      search_text: buildSearchText(preset.name, preset.description),
    });
    created.push(preset.name);
    if (isSuperAdminPermissions(preset.permissions)) {
      superAdminRoleId = id;
    }
  }

  if (!superAdminRoleId) {
    // Reachable only if a pre-existing role is named "Super Admin" without
    // holding the wildcard — so the preset was skipped as already present, and
    // there is nothing to promote anyone to. Say so rather than assigning a role
    // that grants nothing.
    throw new ConvexError(
      `A role named "${SUPER_ADMIN_ROLE_NAME}" exists but does not hold "*". ` +
        `Add the wildcard to it, or rename it, then run setup again.`,
    );
  }

  return { created, existing, superAdminRoleId };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * What the setup screen needs to know.
 *
 * Public and unauthenticated on purpose — it is read by a signed-out visitor
 * hitting /setup. It returns counts and flags only: no user names, no emails,
 * nothing about who the super admin is. "Someone has claimed this" is all an
 * anonymous caller learns, and they can infer that from being refused anyway.
 */
export const getSetupStatus = query({
  args: {},
  handler: async (ctx) => {
    const roles = await ctx.db.query("roles").collect();
    const claimed = await findSuperAdmin(ctx);

    // The caller, if they are signed in. `getAuthUser` is not used here because
    // this must not throw for an anonymous visitor.
    const identity = await ctx.auth.getUserIdentity();
    let caller: Doc<"users"> | null = null;
    if (identity) {
      caller = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    const callerRole = caller?.role_id
      ? await ctx.db.get(caller.role_id)
      : null;

    return {
      rolesSeeded: roles.length > 0,
      roleCount: roles.length,
      /** True once a user holds a wildcard role. The claim is refused after this. */
      claimed: claimed !== null,
      /** Whether an email allowlist is configured, so the UI can say so. */
      emailRestricted: Boolean(process.env.BOOTSTRAP_SUPERADMIN_EMAIL),
      signedIn: identity !== null,
      /**
       * Whether the Clerk webhook has produced a Convex row yet. A signed-in
       * caller with no row means the webhook is misconfigured, which is a
       * different problem from having no role and deserves a different message.
       */
      hasConvexUser: caller !== null,
      callerRoleName: callerRole?.name ?? null,
      callerIsSuperAdmin: isSuperAdminPermissions(callerRole?.permissions),
    };
  },
});

// ---------------------------------------------------------------------------
// The claim
// ---------------------------------------------------------------------------

/**
 * Seed the four roles and make the caller Super Admin.
 *
 * Refuses once anyone holds a wildcard role. See the module comment for why a
 * public mutation is both necessary and acceptable here.
 */
export const claimSuperAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Sign in before claiming the super admin role.");
    }

    // Closed as soon as anyone holds it. Checked FIRST, before any write, so a
    // second caller cannot seed or patch anything.
    const claimed = await findSuperAdmin(ctx);
    if (claimed) {
      throw new ConvexError(
        "Setup has already been completed. Ask an existing super admin to " +
          "assign your role.",
      );
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      // The Clerk webhook has not run, or is misconfigured. Naming the cause
      // matters: the alternative is a "not found" that reads as a bug in setup.
      throw new ConvexError(
        "Your Clerk account has no record in Convex yet. Check that the Clerk " +
          "webhook points at /api/v1/webhooks/clerk and resend the user.created " +
          "event, then try again.",
      );
    }

    // Optional hard lock. With this set the window is closed entirely rather
    // than merely first-come.
    const allowedEmail = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim();
    if (allowedEmail) {
      const callerEmail = (user.email ?? "").trim().toLowerCase();
      if (callerEmail !== allowedEmail.toLowerCase()) {
        throw new ConvexError(
          "This deployment restricts setup to a specific email address.",
        );
      }
    }

    const { created, existing, superAdminRoleId } = await ensureRoles(ctx);

    await ctx.db.patch(user._id, {
      role_id: superAdminRoleId,
      // A super admin who cannot be listed among active staff is confusing, and
      // `upsertUser` creates every user Inactive.
      status: "Active",
      updated_at: Date.now(),
    });

    return {
      rolesCreated: created,
      rolesAlreadyPresent: existing,
      roleName: SUPER_ADMIN_ROLE_NAME,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal equivalents, for when the public claim is gone
// ---------------------------------------------------------------------------

/**
 * Seed the presets without assigning anyone.
 *
 * Internal: run from the Convex dashboard or `npx convex run`. Safe to re-run —
 * it only adds what is missing.
 */
export const seedRoles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { created, existing } = await ensureRoles(ctx);
    return { created, existing };
  },
});

/**
 * Promote a user to Super Admin by email.
 *
 * Internal, and unlike `claimSuperAdmin` it does NOT refuse when a super admin
 * already exists — that guard exists to close a public window and this has none.
 * This is how a second super admin is made, and how you recover if the first
 * loses access:
 *
 *   npx convex run user/bootstrap:promoteToSuperAdminByEmail  *     '{"email":"someone@example.com"}'
 */
export const promoteToSuperAdminByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!user) {
      // Exact match on a lowercased index lookup, so a differently-cased stored
      // address would miss. Say which address was tried rather than "not found".
      throw new ConvexError(`No user with email ${email}.`);
    }

    const { superAdminRoleId } = await ensureRoles(ctx);

    await ctx.db.patch(user._id, {
      role_id: superAdminRoleId,
      status: "Active",
      updated_at: Date.now(),
    });

    return { userId: user._id, roleName: SUPER_ADMIN_ROLE_NAME };
  },
});
