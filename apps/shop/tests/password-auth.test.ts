import { describe, expect, it } from "vitest";

import {
  isValidEmail,
  normaliseEmail,
  splitName,
  validate,
} from "../lib/auth/credentials";

/**
 * The rules the sign-in handoff spells out, tested against what it says:
 *
 *   Email: required, valid format, trimmed, lower-cased.
 *   Password: required, 8+ characters on sign up.
 *   Name: required on sign up.
 *
 * Pure functions rather than the hook itself, for the reason the rest of this
 * suite works that way: a hook calling Clerk cannot run under vitest, and the
 * part worth testing is the part that has nothing to do with Clerk.
 */

describe("normaliseEmail", () => {
  it("trims and lower-cases, per the handoff", () => {
    expect(normaliseEmail("  Jane@Blink.APP  ")).toBe("jane@blink.app");
  });

  it("is idempotent, so normalising twice cannot change an address", () => {
    const once = normaliseEmail(" Jane@Blink.app ");
    expect(normaliseEmail(once)).toBe(once);
  });
});

describe("isValidEmail", () => {
  it("accepts an ordinary address", () => {
    expect(isValidEmail("jane@blink.app")).toBe(true);
    expect(isValidEmail("  jane.doe+tag@sub.blink.co.ke ")).toBe(true);
  });

  it("refuses the shapes that are not addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("jane")).toBe(false);
    expect(isValidEmail("jane@")).toBe(false);
    expect(isValidEmail("jane@blink")).toBe(false);
    expect(isValidEmail("@blink.app")).toBe(false);
    // A space inside is the classic paste-from-contacts failure.
    expect(isValidEmail("jane doe@blink.app")).toBe(false);
  });
});

describe("splitName", () => {
  it("splits on the first gap, so a surname can have spaces", () => {
    expect(splitName("Jane Wanjiru Mwangi")).toEqual({
      first: "Jane",
      last: "Wanjiru Mwangi",
    });
  });

  it("treats one word as a first name rather than refusing it", () => {
    // The design asks for one "Name" field and does not require a surname;
    // inventing that requirement here would be this app overruling it.
    expect(splitName("Jane")).toEqual({ first: "Jane", last: "" });
  });

  it("collapses stray whitespace", () => {
    expect(splitName("  Jane   Mwangi  ")).toEqual({
      first: "Jane",
      last: "Mwangi",
    });
  });

  it("is empty for an empty name, rather than throwing", () => {
    expect(splitName("   ")).toEqual({ first: "", last: "" });
  });
});

describe("validate", () => {
  const good = {
    name: "Jane Mwangi",
    email: "jane@blink.app",
    password: "correct-horse",
  };

  it("passes a complete sign-up", () => {
    expect(validate("signUp", good)).toEqual({});
  });

  it("passes a sign-in with no name at all", () => {
    // Sign-in has no name field, so a blank one must not block it.
    expect(validate("signIn", { ...good, name: "" })).toEqual({});
  });

  it("requires a name on sign-up only", () => {
    expect(validate("signUp", { ...good, name: "  " }).name).toBeDefined();
    expect(validate("signIn", { ...good, name: "  " }).name).toBeUndefined();
  });

  it("requires an email, and a plausible one", () => {
    expect(validate("signIn", { ...good, email: "" }).email).toBe(
      "Enter your email address.",
    );
    expect(validate("signIn", { ...good, email: "jane@" }).email).toBe(
      "That email address does not look right.",
    );
  });

  it("requires 8+ characters on sign-up but not on sign-in", () => {
    // Sign-in must never impose a length rule: an account created before the
    // rule existed still has to be able to get in.
    expect(validate("signUp", { ...good, password: "short" }).password).toBe(
      "Use at least 8 characters.",
    );
    expect(
      validate("signIn", { ...good, password: "short" }).password,
    ).toBeUndefined();
  });

  it("still requires a password on both", () => {
    expect(validate("signUp", { ...good, password: "" }).password).toBe(
      "Enter your password.",
    );
    expect(validate("signIn", { ...good, password: "" }).password).toBe(
      "Enter your password.",
    );
  });

  it("reports every broken field at once, not just the first", () => {
    const errors = validate("signUp", { name: "", email: "x", password: "" });
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "password"]);
  });
});
