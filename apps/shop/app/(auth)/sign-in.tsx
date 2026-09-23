import { AuthForm } from "../../components/auth/auth-form";

/**
 * Sign in, presented as a modal over whatever route the customer was on.
 *
 * It dismisses in place rather than navigating: the URL never changes, so a
 * reload part-way through checkout returns to checkout. That is what removes
 * two of the eight refresh-to-home causes structurally rather than patching
 * them, and it is why there is no `redirect` param anywhere in this flow.
 *
 * ── What changed here ────────────────────────────────────────────────────
 *
 * This screen used to ask for an email alone and let Clerk's offered factors
 * decide what to ask for next (`lib/auth/use-sign-in-flow.ts`, replaced by
 * `use-password-auth.ts`). The sign-in handoff puts email and password on
 * screen together, so there is no "next" left to decide — but the adaptive
 * behaviour is not gone: it moved into the submit path, which still reads what
 * Clerk actually offers rather than insisting on a password. See that hook's
 * header for the three bugs that shaped it.
 */
export default function SignInScreen() {
  return <AuthForm mode="signIn" />;
}
