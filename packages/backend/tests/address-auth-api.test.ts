import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A customer's address book is the most physically consequential thing the
 * customer app writes.
 *
 * Every function in `data/addresses.ts` took `clerkId` as an argument and looked
 * the user up by it — the same shape as the cart IDOR, with worse consequences.
 * A Clerk id is not a secret: it travels in JWTs, server logs and webhook
 * payloads. Holding one meant you could
 *
 *   - read where someone lives, to the coordinate (`getUserAddresses`),
 *   - retire their addresses, which denies them delivery (`deleteAddress`),
 *   - and add or re-default one, which sends a rider to an address of your
 *     choosing with their order in the pannier (`saveAddress`,
 *     `setDefaultAddress`).
 *
 * Source-scanned rather than exercised, because every one of these compiled and
 * read as ordinary code. The defect was the argument's existence.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const addresses = read("data", "addresses.ts");
const coverage = read("data", "coverage.ts");

/** Brace-matched `args:` block — same helper as the cart and order guards. */
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

const MY_WRITES = [
  "saveMyAddress",
  "setMyDefaultAddress",
  "deleteMyAddress",
] as const;

const LEGACY = [
  "getUserAddresses",
  "getDefaultAddress",
  "saveAddress",
  "updateAddress",
  "setDefaultAddress",
  "deleteAddress",
  "searchNearbyAddresses",
  "fetchDefaultAddress",
] as const;

describe("the auth-derived address surface", () => {
  it("exists for read and for all three writes", () => {
    expect(addresses).toMatch(/export const getMyAddresses = query\(/);
    for (const name of MY_WRITES) {
      expect(addresses).toMatch(
        new RegExp(`export const ${name} = mutation\\(`),
      );
    }
  });

  it("accepts no identity whatsoever", () => {
    for (const name of MY_WRITES) {
      // Not "accepts and ignores". An ignored identity argument is the exact
      // shape of the bug, one honouring commit away from returning.
      expect(argsOf(fnBody(addresses, name)), name).not.toMatch(
        /clerkId|clerk_id|user_id|userId|email/,
      );
    }
    expect(argsOf(fnBody(addresses, "getMyAddresses")).trim()).toBe("");
  });

  it("derives the caller from the token", () => {
    for (const name of MY_WRITES) {
      expect(fnBody(addresses, name), name).toMatch(/getAuthUser\(ctx\)/);
    }
  });
});

describe("coverage enforcement on a write", () => {
  it("saveMyAddress refuses a point no vendor covers", () => {
    const body = fnBody(addresses, "saveMyAddress");
    expect(body).toMatch(/readVendorsCoveringPoint\(ctx, args\.coordinates\)/);
    expect(body).toMatch(/covering\.length === 0/);
  });

  it("checks it in its own transaction, not through a runQuery hop", () => {
    // `saveAddress` and `updateAddress` both hop. A hop is a second
    // transaction, so a vendor deactivated between the check and the write let
    // the write pass a check that was no longer true.
    expect(fnBody(addresses, "saveMyAddress")).not.toMatch(/ctx\.runQuery/);
    expect(coverage).toMatch(
      /export async function readVendorsCoveringPoint\(/,
    );
  });

  it("the public coverage query delegates to the same reader", () => {
    // Two copies of a radius comparison is two answers to \"do we deliver here\".
    expect(fnBody(coverage, "vendorsCoveringPoint")).toMatch(
      /readVendorsCoveringPoint\(ctx/,
    );
  });
});

describe("the default address invariant", () => {
  it("the first address saved is default whatever was asked for", () => {
    const body = fnBody(addresses, "saveMyAddress");
    // The no-document branch inserts with is_default: true unconditionally.
    const firstBranch = body.slice(body.indexOf("if (!doc)"));
    expect(firstBranch).toMatch(/is_default: true/);
    expect(firstBranch).not.toMatch(/is_default: args\.is_default/);
  });

  it("deleting the default promotes a survivor deterministically", () => {
    const body = fnBody(addresses, "deleteMyAddress");
    expect(body).toMatch(/target\.is_default/);
    // Sorted, so the promotion cannot depend on array order.
    expect(body).toMatch(/sort\(\s*\(a, b\) => a\.created_at - b\.created_at/);
  });

  it("retires rather than removes, because orders carry the label", () => {
    expect(fnBody(addresses, "deleteMyAddress")).toMatch(
      /status: "Inactive" as const/,
    );
    expect(fnBody(addresses, "deleteMyAddress")).not.toMatch(/ctx\.db\.delete/);
  });
});

describe("the legacy surface", () => {
  it("is tagged so nothing new adopts it", () => {
    for (const name of LEGACY) {
      const declaration = addresses.indexOf(`export const ${name} = `);
      expect(declaration, `${name} not found`).toBeGreaterThan(-1);
      const preamble = addresses.slice(
        Math.max(0, declaration - 500),
        declaration,
      );
      // The tag must be in THIS function's own comment block, not a neighbour's.
      const own = preamble.split("*/").pop() ?? "";
      expect(
        preamble.split("export const").pop()!.includes("@deprecated") ||
          own.includes("@deprecated") ||
          preamble.lastIndexOf("@deprecated") > preamble.lastIndexOf("});"),
        `${name} is not marked deprecated`,
      ).toBe(true);
    }
  });
});
