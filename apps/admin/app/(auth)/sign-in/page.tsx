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
 * Which steps render is decided by what Clerk offers for the identifier, not by
 * what this app assumes. That is not a hypothetical flourish: this instance was
 * passwordless and then had passwords enabled, and the only reason the screen
 * followed is that it reads `supportedFirstFactors` instead of hardcoding a
 * sequence. The first version hardcoded email + password and then guessed TOTP,
 * which asked for an authenticator code on an instance where nobody had one.
 *
 * See `lib/auth/use-sign-in-flow.ts` for the details, including why the
 * `/v1/environment` flags are the wrong thing to read.
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
  // Relative paths only — honouring an absolute URL would make this an open
  // redirect.
  const redirectTo = raw?.startsWith("/") ? raw : "/";

  const flow = useSignInFlow(redirectTo);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-6">
      {flow.step === "identifier" ? (
        <>
          <Header
            title="Sign in"
            description="Use your Blink Hub administrator account."
          />
          <form onSubmit={flow.submitIdentifier} className="space-y-4">
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

            {/*
              Password sits on the same screen so a password instance is one
              screen and one submit. It is NOT required here: whether a password
              is accepted is decided by what Clerk offers for this identifier, and
              on an instance that signs in by emailed code it is ignored and the
              user is told so rather than left wondering. The helper line under
              the field is what keeps a blank password from looking like an
              incomplete form.
            */}
            <Field>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {/*
                  Offered here as well as on the dedicated password step: with
                  both fields on one screen, this is the only place someone who
                  has forgotten their password ever sees it. On an instance with
                  no password at all it surfaces Clerk's own error rather than
                  silently doing nothing.
                */}
                <button
                  type="button"
                  onClick={flow.requestReset}
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
                  placeholder="••••••••"
                  value={flow.password}
                  onChange={(e) => flow.setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
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
              <p className="text-muted-foreground text-xs">
                Leave blank to sign in with a code sent to your email.
              </p>
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
              No sign-up link: admin accounts are provisioned, not
              self-registered, so inviting someone to create one here is a dead
              end.
            */}
            Accounts are created by an administrator.
          </p>
        </>
      ) : null}

      {flow.step === "password" ? (
        <>
          <Header title="Enter your password" description={flow.email} />
          <form onSubmit={flow.submitPassword} className="space-y-4">
            <Field>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={flow.requestReset}
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
                  autoFocus
                  required
                  placeholder="••••••••"
                  value={flow.password}
                  onChange={(e) => flow.setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  // Labelled because the icon says nothing to a screen reader,
                  // and tabIndex -1 so it does not sit between the field and the
                  // submit button.
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

            <Button
              type="submit"
              className="w-full"
              disabled={flow.loading || !flow.ready}
            >
              {flow.loading ? "Signing in…" : "Sign in"}
            </Button>

            {/*
              Shown only when Clerk actually offers the email code for this
              identifier. An alternative that turns out not to exist is worse
              than no alternative.
            */}
            {flow.emailCodeOffered ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={flow.useEmailCodeInstead}
                disabled={flow.loading}
              >
                Email me a code instead
              </Button>
            ) : null}

            <BackButton onClick={flow.restart} />
          </form>
        </>
      ) : null}

      {flow.step === "emailCode" && flow.prompt ? (
        <>
          <Header title={flow.prompt.title} description={flow.prompt.helper} />
          <form onSubmit={flow.submitEmailCode} className="space-y-5">
            <Otp value={flow.code} onChange={flow.setCode} />
            <Message error={flow.error} notice={flow.notice} />
            <Button
              type="submit"
              className="w-full"
              disabled={flow.loading || flow.code.length < 6}
            >
              {flow.loading ? "Verifying…" : "Sign in"}
            </Button>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={flow.restart}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
                Change email
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={flow.resendEmailCode}
                disabled={flow.loading}
              >
                Resend code
              </Button>
            </div>
          </form>
        </>
      ) : null}

      {flow.step === "secondFactor" && flow.prompt ? (
        <>
          <Header title={flow.prompt.title} description={flow.prompt.helper} />
          <form onSubmit={flow.submitSecondFactor} className="space-y-5">
            {flow.prompt.otp ? (
              <Otp value={flow.code} onChange={flow.setCode} />
            ) : (
              // A backup code is not six digits, so the OTP boxes would
              // silently truncate it.
              <Field>
                <Label htmlFor="backup">Code</Label>
                <Input
                  id="backup"
                  autoFocus
                  required
                  placeholder="xxxx-xxxx"
                  value={flow.code}
                  onChange={(e) => flow.setCode(e.target.value)}
                />
              </Field>
            )}

            <Message error={flow.error} notice={flow.notice} />

            <Button
              type="submit"
              className="w-full"
              disabled={
                flow.loading || (flow.prompt.otp && flow.code.length < 6)
              }
            >
              {flow.loading ? "Verifying…" : "Verify"}
            </Button>

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={flow.restart}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
                Start again
              </Button>
              {/*
                Only where the code is actually delivered. A TOTP or backup code
                comes from the user's own device, so a resend button there is an
                offer that cannot be honoured.
              */}
              {flow.prompt.resendable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={flow.resendSecondFactor}
                  disabled={flow.loading}
                >
                  Resend code
                </Button>
              ) : null}
            </div>
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
            <Otp value={flow.code} onChange={flow.setCode} />
            <Field>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                // No local minimum: the instance owns the password policy, and a
                // hardcoded one here would reject passwords Clerk accepts. Clerk's
                // own validation error is surfaced through Message.
                placeholder="Your new password"
                value={flow.newPassword}
                onChange={(e) => flow.setNewPassword(e.target.value)}
              />
            </Field>

            <Message error={flow.error} notice={flow.notice} />

            <Button
              type="submit"
              className="w-full"
              disabled={
                flow.loading ||
                flow.code.length < 6 ||
                flow.newPassword.length === 0
              }
            >
              {flow.loading ? "Saving…" : "Set password and sign in"}
            </Button>
            <BackButton onClick={flow.restart} />
          </form>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Otp({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex justify-center">
      <InputOTP maxLength={6} value={value} onChange={onChange} autoFocus>
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
  );
}

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
 * Errors and notices.
 *
 * `role="alert"` so a failure is announced rather than only appearing — silent
 * failure reads as a dead button to a screen reader.
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
      className={`flex items-start gap-2 text-sm ${
        isError ? "text-destructive" : "text-muted-foreground"
      }`}
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
      Start again
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
      </div>
    </div>
  );
}
