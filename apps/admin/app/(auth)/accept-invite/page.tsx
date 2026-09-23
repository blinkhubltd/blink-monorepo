"use client";

import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "../_components/auth-shell";

/**
 * Where an admin invitation lands.
 *
 * `user/invitations.ts` sets this as the invitation's `redirect_url`, so
 * Clerk appends `__clerk_ticket`/`__clerk_status` to it once the person
 * clicks the emailed link. Clerk's own `<SignUp/>` reads those on mount and
 * takes it from there — email fixed to whatever the invite named, and
 * whatever the Clerk instance is configured to collect for the rest
 * (password always; phone, if the instance requires it, with its own
 * verification step).
 *
 * ── Why Clerk's own component, unlike `/sign-in` ──────────────────────────
 *
 * `/sign-in` is hand-built against `useSignIn()` because its shape is fixed
 * and well understood — email/password/OTP, always the same three. This
 * screen's shape depends on whatever fields the Clerk instance happens to be
 * configured to require, which nothing in this repository can see. Hand-
 * rolling it would mean guessing that configuration and hard-coding a phone
 * step that will not test against a real Clerk instance until this ships;
 * Clerk's own component does not need the guess, since it just asks for
 * whatever the instance says it needs.
 *
 * `routing="hash"` avoids needing this page to *be* a catch-all route — the
 * whole flow (ticket exchange, missing fields, phone verification) happens
 * on this one path with a `#/...` fragment, rather than needing
 * `accept-invite/[[...rest]]/page.tsx`.
 *
 * The role itself is never asked for here and never could be: it travelled
 * on the invitation's `public_metadata` and is applied server-side by the
 * `user.created` webhook once this completes — see `user/clerk.ts` and
 * `user/users.ts`'s `upsertUser`.
 */
export default function AcceptInvitePage() {
  return (
    <AuthShell>
      <div className="space-y-6">
        {/*
          Clerk's own header/footer are hidden below so this doesn't carry
          two titles and two "already have an account" links — this text
          takes over that role, matching `/sign-in`'s own heading.
        */}
        <div className="space-y-1.5">
          <h2 className="text-2xl font-bold tracking-tight">
            Finish setting up your account
          </h2>
          <p className="text-muted-foreground text-sm">
            You were invited to Blink Hub. Set a password to continue.
          </p>
        </div>

        <SignUp
          routing="hash"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-none border-0 p-0 w-full",
              header: "hidden",
              footer: "hidden",
            },
          }}
        />
      </div>
    </AuthShell>
  );
}
