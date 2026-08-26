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
import { computeUserSearchText } from "./users";

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

/**
 * The caller's user row, created from the Clerk identity if it does not exist.
 *
 * ── Why setup provisions its own user ─────────────────────────────────────
 *
 * Normally the Clerk webhook creates users. But setup CANNOT depend on that: a
 * fresh deployment has a webhook that has never fired, may have the wrong URL,
 * and cannot be tested until someone can sign in — which is what setup is for.
 * Blocking first-run setup on an unrelated integration means a misconfigured
 * webhook locks the platform permanently, and the only diagnostic is a screen
 * telling you to fix a webhook you cannot yet verify.
 *
 * Creating the row here is safe because it comes from `ctx.auth.getUserIdentity()`
 * — claims Convex has already verified against the Clerk JWKS. The caller cannot
 * provision anyone but themselves, and cannot choose their own clerkId.
 *
 * The row is deliberately built to match what `upsertUser` produces, so a later
 * webhook delivery patches this row rather than creating a second one: same
 * clerkId, same searchText derivation, same empty phone and address.
 */
async function resolveOrCreateCaller(
  ctx: MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Sign in before claiming the super admin role.");
  }

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (existing) return existing;

  // `email` is required on the users table, and the JWT only carries it if the
  // Clerk template includes the claim. Naming the fix beats "email is missing".
  const email = identity.email?.trim().toLowerCase();
  if (!email) {
    throw new ConvexError(
      "Your Clerk session token carries no email claim, so no user record can " +
        "be created. In the Clerk dashboard open JWT Templates, edit the " +
        '"convex" template, and add {"email": "{{user.primary_email_address}}"}. ' +
        "Then sign out, sign in again, and retry.",
    );
  }

  // An existing row under this email with a DIFFERENT clerkId means the same
  // person signed up twice, or the Clerk instance was recreated. Adopt the row
  // rather than inserting a duplicate.
  //
  // This is not a nicety: `getCurrentUser`, `upsertUser` and others look users up
  // with `by_email(...).unique()`, which THROWS when it finds two. Inserting a
  // second row under the same address would break sign-in for that person
  // everywhere, and the error would point at those queries rather than here.
  let byEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  if (!byEmail) {
    // The index is exact, so a row stored as "Charles@..." is invisible to a
    // lookup for "charles@...". A bounded scan catches that. Justified because
    // this runs once per deployment, on a table that is empty or nearly so, and
    // the alternative is the duplicate-email corruption described above.
    const candidates = await ctx.db.query("users").take(2000);
    byEmail =
      candidates.find((u) => (u.email ?? "").trim().toLowerCase() === email) ??
      null;
  }

  const given = identity.givenName?.trim() ?? "";
  const family = identity.familyName?.trim() ?? "";
  const fullName = identity.name?.trim() ?? "";
  const parts = fullName.split(" ").filter(Boolean);
  const firstName = given || parts[0] || "";
  const lastName = family || parts.slice(1).join(" ") || "";

  if (byEmail) {
    await ctx.db.patch(byEmail._id, {
      clerkId: identity.subject,
      updated_at: Date.now(),
    });
    const adopted = await ctx.db.get(byEmail._id);
    if (!adopted) throw new ConvexError("Could not read the adopted user row.");
    return adopted;
  }

  const id = await ctx.db.insert("users", {
    clerkId: identity.subject,
    email,
    name: fullName,
    first_name: firstName,
    last_name: lastName,
    image: identity.pictureUrl ?? "",
    phone: "",
    searchText: computeUserSearchText({
      name: fullName,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: "",
    }),
    // Same defaults as upsertUser, so a webhook delivery later patches rather
    // than conflicts.
    status: "Inactive",
    address: { address: "", lat: 0, lng: 0 },
    updated_at: Date.now(),
  });

  const created = await ctx.db.get(id);
  if (!created) throw new ConvexError("Could not read the created user row.");
  return created;
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

    // A count, not a list. "Is anything here at all" separates a webhook that
    // has never fired from one that fired for other people but not this caller.
    const anyUser = await ctx.db.query("users").take(1);

    return {
      rolesSeeded: roles.length > 0,
      roleCount: roles.length,
      /** Whether ANY user row exists. False means the webhook has never landed. */
      anyUsersExist: anyUser.length > 0,
      /**
       * The email on the caller's session token. Null means the Clerk JWT
       * template omits the claim, which is the one case setup cannot work
       * around — the users table requires an email.
       */
      identityEmail: identity?.email ?? null,
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

    // Create the row from the verified Clerk identity if the webhook has not
    // produced one. Setup must not depend on the webhook — see
    // resolveOrCreateCaller.
    const user = await resolveOrCreateCaller(ctx);

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
