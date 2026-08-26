"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  ShieldUserIcon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";

import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { getConvexErrorMessage } from "@/lib/utils";
import { AuthShell } from "../_components/auth-shell";

/**
 * First-run setup.
 *
 * A fresh deployment has no roles, so the Clerk webhook creates users with no
 * role, so every gate denies them and nothing in the UI can create the role that
 * would let them in. This is the way out of that: sign in, claim the Super Admin
 * role, and the four base roles are seeded in the same mutation.
 *
 * Public by necessity — the caller has no role, so there is no permission to
 * require. `claimSuperAdmin` closes itself the moment anyone holds a wildcard
 * role, so the window is open exactly once. See `convex/user/bootstrap.ts`.
 *
 * This screen states plainly what is about to be granted, and to whom. A setup
 * button that says only "Continue" is how someone clicks past the fact that they
 * just took ownership of the platform.
 */
export default function SetupPage() {
  const router = useRouter();
  const status = useQuery(api.user.bootstrap.getSetupStatus, {});
  const claim = useMutation(api.user.bootstrap.claimSuperAdmin);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  async function onClaim() {
    setBusy(true);
    setError(null);
    try {
      const result = await claim({});
      setDone(result.rolesCreated);
    } catch (err) {
      setError(
        getConvexErrorMessage(err, "Setup failed. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (status === undefined) {
    return (
      <AuthShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-full" />
        </div>
      </AuthShell>
    );
  }

  // Claimed and it was this user — nothing left to do here.
  if (done || status.callerIsSuperAdmin) {
    return (
      <AuthShell>
        <Panel
          tone="success"
          icon={CheckmarkCircle02Icon}
          title="Setup complete"
          description="You hold the Super Admin role. The four base roles are in place."
        >
          {done && done.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              Created: {done.join(", ")}.
            </p>
          ) : null}
          <Button className="w-full" onClick={() => router.replace("/")}>
            Go to the dashboard
          </Button>
        </Panel>
      </AuthShell>
    );
  }

  // Someone else already claimed it. Say so without naming them.
  if (status.claimed) {
    return (
      <AuthShell>
        <Panel
          tone="neutral"
          icon={ShieldUserIcon}
          title="Setup is already done"
          description="A super admin exists for this deployment, so this screen is closed. Ask them to assign your role."
        >
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Back to the dashboard</Link>
          </Button>
        </Panel>
      </AuthShell>
    );
  }

  if (!status.signedIn) {
    return (
      <AuthShell>
        <Panel
          tone="neutral"
          icon={ShieldUserIcon}
          title="Sign in first"
          description="Setup assigns the Super Admin role to your account, so it needs to know who you are."
        >
          <Button asChild className="w-full">
            <Link href="/sign-in?redirect_url=/setup">Sign in</Link>
          </Button>
        </Panel>
      </AuthShell>
    );
  }

  // Signed in with Clerk but no Convex row: the webhook has not fired. A
  // different problem from having no role, and a different fix — so it gets its
  // own screen rather than a generic failure.
  if (!status.hasConvexUser) {
    return (
      <AuthShell>
        <Panel
          tone="error"
          icon={Alert02Icon}
          title="Your account has not synced"
          description="You are signed in with Clerk, but no matching record exists in Convex — which means the Clerk webhook has not reached this deployment."
        >
          <div className="text-muted-foreground space-y-2 text-sm">
            <p>In the Clerk dashboard, under Webhooks:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Point the endpoint at{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-xs">
                  /api/v1/webhooks/clerk
                </code>{" "}
                on this deployment.
              </li>
              <li>
                Subscribe to <code className="text-xs">user.created</code>,{" "}
                <code className="text-xs">user.updated</code> and{" "}
                <code className="text-xs">user.deleted</code>.
              </li>
              <li>Resend the failed delivery for your account.</li>
            </ol>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.refresh()}
          >
            Check again
          </Button>
        </Panel>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Panel
        tone="neutral"
        icon={ShieldUserIcon}
        title="Claim this deployment"
        description="No super admin exists yet. Claiming makes your account the platform owner."
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">This will:</p>
          <ul className="space-y-1.5">
            <Bullet>
              Create the <strong>Super Admin</strong> role, holding{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">*</code> —
              every module, every action.
            </Bullet>
            <Bullet>
              Create <strong>Customer</strong>, <strong>Rider</strong> and{" "}
              <strong>Picker</strong>. Customer becomes the default, so new
              signups get it automatically.
            </Bullet>
            <Bullet>Assign Super Admin to you, and mark you active.</Bullet>
          </ul>

          {status.rolesSeeded ? (
            <p className="text-muted-foreground text-xs">
              {status.roleCount} role
              {status.roleCount === 1 ? "" : "s"} already exist and will be left
              exactly as they are — only missing ones get created.
            </p>
          ) : null}

          {status.emailRestricted ? (
            <p className="text-muted-foreground text-xs">
              This deployment restricts setup to one configured email address.
            </p>
          ) : (
            // Named, not hidden. Whoever runs setup should know the window is
            // first-come until it is taken.
            <p className="text-muted-foreground text-xs">
              Until someone claims it, any signed-in user can. To close that,
              set <code className="text-xs">BOOTSTRAP_SUPERADMIN_EMAIL</code> on
              the deployment before deploying.
            </p>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <Button className="w-full" onClick={onClaim} disabled={busy}>
          {busy ? "Setting up…" : "Claim Super Admin"}
        </Button>
      </Panel>
    </AuthShell>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        className="text-primary mt-0.5 size-4 shrink-0"
      />
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

function Panel({
  tone,
  icon,
  title,
  description,
  children,
}: {
  tone: "neutral" | "success" | "error";
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const ring =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "error"
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/15 text-primary";

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <span className={`grid size-11 place-items-center rounded-xl ${ring}`}>
          <HugeiconsIcon icon={icon} className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
