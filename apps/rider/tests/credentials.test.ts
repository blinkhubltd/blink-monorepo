import { describe, expect, it } from "vitest";
import { isValidEmail, normaliseEmail, validate } from "../lib/auth/credentials";

describe("normaliseEmail", () => {
  it("trims and lower-cases", () => {
    expect(normaliseEmail("  Rider@Blink.App  ")).toBe("rider@blink.app");
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible address", () => {
    expect(isValidEmail("rider@blink.app")).toBe(true);
  });

  it("rejects addresses missing an @ or a domain", () => {
    expect(isValidEmail("rider")).toBe(false);
    expect(isValidEmail("rider@blink")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("validate", () => {
  it("requires both fields", () => {
    const errors = validate({ email: "", password: "" });
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it("flags a malformed email without touching the password rule", () => {
    const errors = validate({ email: "not-an-email", password: "secret123" });
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeUndefined();
  });

  it("does not enforce a minimum length on sign-in — the password is already set", () => {
    const errors = validate({ email: "rider@blink.app", password: "x" });
    expect(errors).toEqual({});
  });

  it("passes with a valid email and any non-empty password", () => {
    expect(validate({ email: "rider@blink.app", password: "hunter2" })).toEqual({});
  });
});
