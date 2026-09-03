import { describe, expect, it } from "vitest";
import {
  clerkErrorMessage,
  describeSecondFactor,
  isCompleteCode,
  isUnknownAccount,
  normaliseCode,
} from "./sign-in";

/**
 * Sign-in policy.
 *
 * These are the parts that carry hard-won knowledge about a Clerk instance, and
 * every failure here is a user who cannot sign in at all — so the cases are
 * pinned rather than left to a switch statement nobody rereads.
 */

describe("describeSecondFactor", () => {
  it("handles email_code", () => {
    // The case whose absence produced the literal error "requires email_code,
    // which this screen does not support yet" on a real account.
    const prompt = describeSecondFactor("email_code");
    expect(prompt.otp).toBe(true);
    expect(prompt.resendable).toBe(true);
    expect(prompt.helper).not.toMatch(/does not support/);
  });

  it("offers resend only for codes the server sent", () => {
    // A resend button on a TOTP prompt would be a lie: the code is generated on
    // the user's own device.
    expect(describeSecondFactor("email_code").resendable).toBe(true);
    expect(describeSecondFactor("phone_code").resendable).toBe(true);
    expect(describeSecondFactor("totp").resendable).toBe(false);
    expect(describeSecondFactor("backup_code").resendable).toBe(false);
  });

  it("uses OTP boxes only for six-digit codes", () => {
    // A backup code is not six digits, so OTP boxes would truncate it.
    expect(describeSecondFactor("backup_code").otp).toBe(false);
    expect(describeSecondFactor("totp").otp).toBe(true);
  });

  it("names an unknown strategy instead of guessing", () => {
    // The bug this replaces defaulted to "totp", asking for an authenticator
    // code on an instance where nobody had one.
    const prompt = describeSecondFactor("passkey");
    expect(prompt.helper).toContain("passkey");
    expect(prompt.strategy).toBe("passkey");
    expect(prompt.otp).toBe(false);
  });

  it("always returns the strategy it was given", () => {
    for (const s of ["email_code", "phone_code", "totp", "backup_code", "weird"]) {
      expect(describeSecondFactor(s).strategy).toBe(s);
    }
  });
});

describe("clerkErrorMessage", () => {
  it("prefers Clerk's own wording", () => {
    expect(
      clerkErrorMessage([{ code: "x", longMessage: "Long", message: "Short" }], "fb"),
    ).toBe("Long");
    expect(clerkErrorMessage([{ code: "x", message: "Short" }], "fb")).toBe("Short");
  });

  it("falls back when there is nothing usable", () => {
    expect(clerkErrorMessage([], "fb")).toBe("fb");
    expect(clerkErrorMessage(undefined, "fb")).toBe("fb");
    expect(clerkErrorMessage([{ code: "x" }], "fb")).toBe("fb");
  });

  it("does not confirm whether an account exists", () => {
    // Distinct messages for "no such user" and "wrong password" let anyone
    // probe for registered addresses.
    const unknown = clerkErrorMessage(
      [{ code: "form_identifier_not_found", longMessage: "No user found" }],
      "fb",
    );
    const wrongPassword = clerkErrorMessage(
      [{ code: "form_password_incorrect", longMessage: "Password incorrect" }],
      "fb",
    );
    expect(unknown).toBe(wrongPassword);
    expect(unknown).not.toMatch(/No user found/);
    expect(unknown).not.toMatch(/[Pp]assword/);
  });
});

describe("isUnknownAccount", () => {
  it("identifies an unregistered identifier", () => {
    expect(isUnknownAccount([{ code: "form_identifier_not_found" }])).toBe(true);
  });

  it("is false for a wrong password", () => {
    // A shop offers sign-up on an unknown account; a wrong password must NOT
    // route there, or it would tell the user their address is unregistered.
    expect(isUnknownAccount([{ code: "form_password_incorrect" }])).toBe(false);
    expect(isUnknownAccount([])).toBe(false);
    expect(isUnknownAccount(undefined)).toBe(false);
  });
});

describe("code normalisation", () => {
  it("strips spaces that autofill and paste introduce", () => {
    // A code with a stray space fails verification with a message blaming the
    // user for a mistake they did not make.
    expect(normaliseCode("123 456")).toBe("123456");
    expect(normaliseCode(" 123456 ")).toBe("123456");
    // Non-breaking space, which is what a paste from an email client gives.
    expect(normaliseCode("123 456")).toBe("123456");
  });

  it("recognises a complete code", () => {
    expect(isCompleteCode("123456")).toBe(true);
    expect(isCompleteCode("123 456")).toBe(true);
    expect(isCompleteCode("12345")).toBe(false);
    expect(isCompleteCode("1234567")).toBe(false);
    expect(isCompleteCode("12345a")).toBe(false);
    expect(isCompleteCode("")).toBe(false);
  });
});
