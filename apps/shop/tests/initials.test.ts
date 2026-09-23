import { describe, expect, it } from "vitest";

import { initialsOf } from "../lib/initials";

describe("initialsOf", () => {
  it("takes the first letter of the first two words of a name", () => {
    expect(initialsOf("Charles Nderitu", "")).toBe("CN");
  });

  it("uppercases", () => {
    expect(initialsOf("charles nderitu", "")).toBe("CN");
  });

  it("falls back to the first two letters of a single-word name", () => {
    expect(initialsOf("Charles", "")).toBe("CH");
  });

  it("falls back to the email's local part when there is no name", () => {
    expect(initialsOf("", "charlieraph36@gmail.com")).toBe("CH");
  });

  it("splits the email's local part on separators same as a name", () => {
    expect(initialsOf("", "charlie.raph@gmail.com")).toBe("CR");
  });

  it("returns a placeholder when there is neither a name nor an email", () => {
    expect(initialsOf("", "")).toBe("?");
  });

  it("prefers the name over the email when both are present", () => {
    expect(initialsOf("Charles Nderitu", "someone.else@gmail.com")).toBe("CN");
  });

  it("ignores a name that is only whitespace", () => {
    expect(initialsOf("   ", "charlie@gmail.com")).toBe("CH");
  });
});
