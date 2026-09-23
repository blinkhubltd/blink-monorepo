import { v, ConvexError } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertPermission } from "../auth.helpers";
import { isSuperAdminPermissions } from "../lib/role_presets";

/**
 * Inviting someone who does not have an account yet, as a chosen role.
 *
 * ── Why this is separate from `assignRoleToUser` ──────────────────────────
 *
 * `assignRoleToUser` changes the role of a user who already exists — which,
 * until now, meant the only way onto the admin dashboard was to already be a
 * customer (sign up in the shop app) and then be promoted. There was no way
 * to bring in someone who has never touched Blink at all, which is the
 * ordinary way a new staff member or admin joins.
 *
 * This uses Clerk's own invitation flow: an email goes out with a signed
 * link, and following it drops the person into Clerk's sign-up form with the
 * email already fixed — password and (if the Clerk instance is configured to
 * collect it) phone are the only things left to fill in. There is
 * deliberately no local "pending invitations" bookkeeping table; Clerk
 * already tracks invitation status, and duplicating that here would just be
 * a second place for it to go stale.
 *
 * ── How the role survives the round trip ──────────────────────────────────
 *
 * The invitation's `public_metadata` carries `invited_role`. Clerk copies an
 * invitation's `public_metadata` onto the account it produces, so when that
 * person completes sign-up, the `user.created` webhook
 * (`user/clerk.ts`) reads it straight off the event and `upsertUser`
 * (`user/users.ts`) assigns that role instead of the ordinary default —
 * see the comments on both for why an update can never replay it.
 * `public_metadata` is Backend-API-only, so nothing the person does in the
 * sign-up form can put a different value there.
 *
 * ── The privilege-escalation guard ─────────────────────────────────────────
 *
 * `users:CREATE` is enough to invite someone as an ordinary role, but never
 * as one holding the wildcard permission (full access to everything,
 * `isSuperAdminPermissions`) unless the inviter already holds it themselves.
 * Without this, anyone who could invite staff at all could invite themselves
 * a friend with full access.
 */

export const validateInvite = internalQuery({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args): Promise<{ roleName: string }> => {
    const authed = await assertPermission(ctx, "users:CREATE");

    const role = await ctx.db.get(args.roleId);
    if (!role) throw new ConvexError("That role no longer exists.");

    if (
      isSuperAdminPermissions(role.permissions) &&
      !isSuperAdminPermissions(authed.permissions)
    ) {
      throw new ConvexError(
        "Only a super admin can invite someone with full-access permissions.",
      );
    }

    return { roleName: role.name };
  },
});

export const inviteUser = action({
  args: {
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    roleId: v.id("roles"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ invitationId: string; status: string }> => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("That does not look like a valid email address.");
    }
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) {
      throw new ConvexError("First and last name are both required.");
    }

    // Permission and role checks happen here, not in this action — actions
    // have no `ctx.db`, and `assertPermission` needs it. Convex carries the
    // caller's identity through `ctx.runQuery`, so this checks the SAME
    // caller the action itself was invoked by.
    const { roleName } = await ctx.runQuery(
      internal.user.invitations.validateInvite,
      { roleId: args.roleId },
    );

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new ConvexError(
        "Invitations are not configured on this deployment: " +
          "CLERK_SECRET_KEY is not set.",
      );
    }
    const adminAppUrl = process.env.ADMIN_APP_URL;
    if (!adminAppUrl) {
      throw new ConvexError(
        "Invitations are not configured on this deployment: " +
          "ADMIN_APP_URL is not set (the admin dashboard's own URL, " +
          "so the invite email can link back to its sign-up page).",
      );
    }

    const response = await fetch("https://api.clerk.com/v1/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        // Read back on acceptance by `user/clerk.ts`'s webhook handler — see
        // the module comment for the full round trip. `invited_first_name`/
        // `invited_last_name` are informational only, for a sign-up form
        // that does not itself collect a name.
        public_metadata: {
          invited_role: roleName,
          invited_first_name: firstName,
          invited_last_name: lastName,
        },
        redirect_url: `${adminAppUrl.replace(/\/+$/, "")}/accept-invite`,
        notify: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[invitations] Clerk rejected the invite: ${body}`);
      // Clerk's own message ("already a member", "already invited", ...) is
      // safe and useful to relay — it names no secret, and it is exactly
      // what an admin retrying this needs to see.
      let detail = "";
      try {
        const parsed = JSON.parse(body) as {
          errors?: { message?: string }[];
        };
        detail = parsed.errors?.[0]?.message ?? "";
      } catch {
        // Not JSON — fall through with no detail rather than surfacing raw
        // response text of unknown shape.
      }
      throw new ConvexError(
        detail
          ? `Could not send the invitation: ${detail}`
          : "Could not send the invitation.",
      );
    }

    const invitation = (await response.json()) as {
      id: string;
      status: string;
    };
    return { invitationId: invitation.id, status: invitation.status };
  },
});
