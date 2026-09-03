import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A consent record the client authors is not a consent record.
 *
 * `recordAcceptance` used to take `terms_version`, `privacy_version` and
 * `eula_version` as arguments and store them verbatim. Both call sites in the
 * customer app passed the literal string "v1.0", so every acceptance row on the
 * platform claims v1.0 whatever `platform_settings` says — and the moment a
 * version is bumped to force re-acceptance, the check compares the new required
 * version against a fabricated one: it either nags forever, or records
 * agreement to a document nobody was shown.
 *
 * Source-scanned rather than exercised, because the broken version compiled,
 * type-checked and looked entirely ordinary at the call site. The bug was that
 * the argument existed at all.
 */

const CONVEX = join(__dirname, "..", "convex");

/**
 * Read with line endings normalised. These files are checked in with mixed
 * endings, and a regex anchored on a newline before a closing brace matches
 * nothing against CRLF — which surfaces as "function not found" rather than as
 * a broken matcher, i.e. as a passing test that checks nothing.
 */
function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const acceptances = read("data", "legal_acceptances.ts");
const settings = read("data", "platform_settings.ts");

/** Brace-matched `args:` block — same helper as the order and cart guards. */
function argsOf(body: string): string {
  const start = body.indexOf("args:");
  if (start === -1) return "";
  const open = body.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < body.length; i += 1) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") {
      depth -= 1;
      if (depth === 0) return body.slice(open + 1, i);
    }
  }
  return "";
}

function fnBody(source: string, name: string): string {
  const pattern = new RegExp(
    `export const ${name} = (?:mutation|query|internalMutation|internalQuery)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

describe("recordAcceptance", () => {
  const body = fnBody(acceptances, "recordAcceptance");

  it("accepts no version from the caller", () => {
    // Not "accepts and ignores": an ignored argument reads as a bug, and the
    // next person to notice it fixes it by honouring it again.
    expect(argsOf(body)).not.toMatch(/version/i);
  });

  it("reads the versions server-side, inside its own transaction", () => {
    expect(body).toMatch(/readLegalVersions\(ctx\)/);
  });

  it("stamps all three versions from what it read", () => {
    for (const field of [
      "terms_version",
      "privacy_version",
      "eula_version",
    ] as const) {
      expect(
        body,
        `${field} must come from the server read, not from an argument`,
      ).toMatch(new RegExp(`${field}:\\s*versions\\.${field}`));
    }
  });

  it("authenticates, and is not told who the caller is", () => {
    expect(body).toMatch(/getAuthUser\(ctx\)/);
    // No user id, clerk id or email as an argument — the IDOR shape the cart
    // and order APIs both had.
    expect(argsOf(body)).not.toMatch(/user_id|clerkId|clerk_id|email/);
  });

  it("asserts no version literal of its own", () => {
    // A hardcoded "v1.0" in this file would mean a version was being claimed
    // rather than read. The fallback belongs in platform_settings, once.
    expect(acceptances).not.toMatch(/"v\d/);
  });
});

describe("checkNeedsReacceptance", () => {
  it("compares against the same reader the acceptance stamps from", () => {
    // While these two disagreed about the current version, the app either
    // nagged forever or accepted a document nobody had seen.
    expect(fnBody(acceptances, "checkNeedsReacceptance")).toMatch(
      /readLegalVersions\(ctx\)/,
    );
  });
});

describe("readLegalVersions", () => {
  it("exists, and reads all three keys through the by_key index", () => {
    expect(settings).toMatch(/export async function readLegalVersions\(/);
    for (const key of [
      "TERMS_VERSION_KEY",
      "PRIVACY_VERSION_KEY",
      "EULA_VERSION_KEY",
    ]) {
      expect(settings).toMatch(new RegExp(`export const ${key} = "`));
      expect(settings).toMatch(new RegExp(`q\\.eq\\("key", ${key}\\)`));
    }
  });
});
