"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  InformationCircleIcon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@repo/ui/components/ui/input-otp";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useSignInFlow } from "@/lib/auth/use-sign-in-flow";
import { AuthShell } from "../_components/auth-shell";

/**
 * Sign in.
 *
 * Custom, following sydia's arrangement — but on Clerk 6, whose API differs from
 * the v7 surface sydia's hook uses. See `lib/auth/use-sign-in-flow.ts`.
 *
 * Beyond sydia's email/password + OTP: a password-reset flow, a show-password
 * toggle, the destination carried through from middleware so a deep link
 * survives sign-in, and a real second-factor step that reads the offered
 * strategy instead of assuming one.
 */
export default function SignInPage() {
  return (
    <AuthShell>
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={<FormSkeleton />}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}

function SignInForm() {
  const params = useSearchParams();
  const raw = params.get("redirect_url");
  // Relative paths only. Honouring an absolute URL here would make the sign-in
  // page an open redirect.
  const redirectTo = raw?.startsWith("/") ? raw : "/";

  const flow = useSignInFlow(redirectTo);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-6">
      {flow.step === "credentials" ? (
        <>
          <Header
            title="Sign in"
            description="Use your Blink Hub administrator account."
          />
          <form onSubmit={flow.submitCredentials} className="space-y-4">
            <Field>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@blinkhub.co"
                value={flow.email}
                onChange={(e) => flow.setEmail(e.target.value)}
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => flow.goTo("resetRequest")}
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={flow.password}
                  onChange={(e) => flow.setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  // Labelled because the icon alone says nothing to a screen
                  // reader, and tabIndex -1 so it does not sit between the
                  // password field and the submit button.
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-10 place-items-center"
                >
                  <HugeiconsIcon
                    icon={showPassword ? ViewOffSlashIcon : ViewIcon}
                    className="size-4"
                  />
                </button>
              </div>
            </Field>

            <Message error={flow.error} notice={flow.notice} />

            {/* Clerk mounts its bot-protection challenge here when enabled. */}
            <div id="clerk-captcha" />

            <Button
              type="submit"
              className="w-full"
              disabled={flow.loading || !flow.ready}
            >
              {flow.loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-muted-foreground text-center text-xs">
            {/*
              No sign-up link. Admin accounts are provisioned, not
              self-registered, and an invitation to create one here would be a
              dead end.
            */}
            Accounts are created by an administrator.
          </p>
        </>
      ) : null}

      {flow.step === "secondFactor" && flow.secondFactor ? (
        <>
          <Header
            title="One more step"
            description={flow.secondFactor.helper}
          />
          <form onSubmit={flow.submitSecondFactor} className="space-y-5">
            <div className="space-y-2">
              <Label className="sr-only">{flow.secondFactor.label}</Label>
              {flow.secondFactor.strategy === "backup_code" ? (
                // A backup code is not six digits, so the OTP boxes would
                // silently truncate it.
                <Input
                  autoFocus
                  required
                  placeholder="xxxx-xxxx"
                  value={flow.code}
                  onChange={(e) => flow.setCode(e.target.value)}
                />
              ) : (
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={flow.code}
                    onChange={flow.setCode}
                    autoFocus
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              )}
            </div>

            <Message error={flow.error} notice={flow.notice} />

            <Button
              type="submit"
              className="w-full"
              disabled={
                flow.loading ||
                (flow.secondFactor.strategy !== "backup_code" &&
                  flow.code.length < 6)
              }
            >
              {flow.loading ? "Verifying…" : "Verify"}
            </Button>
            <BackButton onClick={() => flow.goTo("credentials")} />
          </form>
        </>
      ) : null}

      {flow.step === "resetRequest" ? (
        <>
          <Header
            title="Reset your password"
            description="We will email you a code to set a new one."
          />
          <form onSubmit={flow.requestReset} className="space-y-4">
            <Field>
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@blinkhub.co"
                value={flow.email}
                onChange={(e) => flow.setEmail(e.target.value)}
              />
            </Field>
            <Message error={flow.error} notice={flow.notice} />
            <Button
              type="submit"
              className="w-full"
              disabled={flow.loading || !flow.ready}
            >
              {flow.loading ? "Sending…" : "Send code"}
            </Button>
            <BackButton onClick={() => flow.goTo("credentials")} />
          </form>
        </>
      ) : null}

      {flow.step === "resetVerify" ? (
        <>
          <Header
            title="Set a new password"
            description={`Enter the code sent to ${flow.email}.`}
          />
          <form onSubmit={flow.submitReset} className="space-y-5">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={flow.code}
                onChange={flow.setCode}
                autoFocus
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Field>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={flow.newPassword}
                onChange={(e) => flow.setNewPassword(e.target.value)}
              />
            </Field>

            <Message error={flow.error} notice={flow.notice} />

            <Button
              type="submit"
              className="w-full"
              disabled={
                flow.loading || flow.code.length < 6 || flow.newPassword.length < 8
              }
            >
              {flow.loading ? "Saving…" : "Set password and sign in"}
            </Button>
            <BackButton onClick={() => flow.goTo("credentials")} />
          </form>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Header({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

/**
 * Errors and notices, with an icon and a role.
 *
 * `role="alert"` so the message is announced rather than only appearing — a
 * failed sign-in that is silent to a screen reader looks like a dead button.
 */
function Message({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  if (!error && !notice) return null;
  const isError = Boolean(error);
  return (
    <div
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "text-destructive flex items-start gap-2 text-sm"
          : "text-muted-foreground flex items-start gap-2 text-sm"
      }
    >
      <HugeiconsIcon
        icon={isError ? Alert02Icon : InformationCircleIcon}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>{error ?? notice}</span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" className="w-full" onClick={onClick}>
      <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
      Back to sign in
    </Button>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
