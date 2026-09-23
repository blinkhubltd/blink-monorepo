import { AuthForm } from "../../components/auth/auth-form";

/**
 * Create an account: name, email, password — or Google / Apple.
 *
 * The whole screen is `AuthForm`, which sign-in shares: the handoff draws the
 * two as one layout with a different title, one extra field and a different
 * footer line, so they are one component with a `mode` rather than two files
 * that diverge the first time either is touched.
 */
export default function SignUpScreen() {
  return <AuthForm mode="signUp" />;
}
