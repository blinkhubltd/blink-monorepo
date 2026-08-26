import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Route protection.
 *
 * ── This file did not exist ───────────────────────────────────────────────
 *
 * There was no middleware at all, which is the other half of the "loads forever
 * and never redirects" symptom. With `ClerkProvider` in the layout but no
 * `clerkMiddleware`, `auth()` is never populated on the server and nothing
 * redirects an anonymous visitor — the app just renders the dashboard shell and
 * waits on a client-side check that could not complete.
 *
 * Keeping the decision here rather than in a client component also means a
 * signed-out visitor never downloads the dashboard bundle at all.
 *
 * ── Which routes are public ──────────────────────────────────────────────
 *
 * `/setup` is public deliberately. It is the first-run screen, and its whole
 * purpose is to serve someone who has no role — gating it behind a role check
 * would make the deployment permanently unreachable. The mutation behind it
 * enforces its own rules and refuses once a super admin exists; see
 * `convex/user/bootstrap.ts`.
 *
 * `/r/(.*)` is the agent referral shortlink, hit by people who have no account.
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/setup(.*)",
  "/unauthorized",
  "/r/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const { pathname, search } = req.nextUrl;

  // Signed out, reaching for a protected page.
  if (!userId && !isPublicRoute(req)) {
    const signIn = new URL("/sign-in", req.url);
    // Carry the destination so the sign-in form can return them to it. Without
    // this, deep links always land on the overview and the user has to navigate
    // again — which is worse for a bookmarked order page than it sounds.
    if (pathname !== "/") {
      signIn.searchParams.set("redirect_url", `${pathname}${search}`);
    }
    return NextResponse.redirect(signIn);
  }

  // Signed in, sitting on the sign-in page. Nothing to do there.
  //
  // Deliberately NOT applied to /setup: a signed-in user with no role is exactly
  // who /setup is for, and bouncing them to "/" would drop them back into the
  // dashboard's own unauthorized redirect.
  if (userId && pathname.startsWith("/sign-in")) {
    const target = req.nextUrl.searchParams.get("redirect_url");
    return NextResponse.redirect(
      // Only same-origin relative paths are honoured. An absolute URL here would
      // be an open redirect: anyone could send /sign-in?redirect_url=https://evil
      // to a signed-in admin and bounce them off the platform.
      new URL(target?.startsWith("/") ? target : "/", req.url),
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
