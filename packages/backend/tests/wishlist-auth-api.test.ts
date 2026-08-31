import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Twelve public wishlist functions, none of which asked who was calling.
 *
 * Every one took the actor as an argument — `clerkId` or a raw `Id<"users">` —
 * and none read `ctx.auth.getUserIdentity()`. `moveWishListToCart` is the worst:
 * a single public mutation that rewrites an arbitrary user's cart AND wishlist
 * given only their user id.
 *
 * The contract was inconsistent too — `{success, message, isInWishlist}`,
 * `{success, inWishlist, message}`, a bare boolean and `{inWishlist}` all
 * appear — and `getWishListByClerkId` returns `success: true` with an empty list
 * from its own catch block, so a database error is indistinguishable from an
 * empty wishlist.
 *
 * Source-scanned for the same reason as the cart, order and address guards:
 * every one of these compiles and reads as ordinary code.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const wishlist = read("data", "wishlist.ts");

/** Brace-matched `args:` block — same helper as the sibling guards. */
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

const MINE = [
  "getMyWishlist",
  "toggleMyWishlistItem",
  "removeFromMyWishlist",
] as const;

const LEGACY = [
  "toggleWishListByClerkId",
  "isProductInWishListByClerkId",
  "getWishListByClerkId",
  "getWishListByClerkIdPaginated",
  "addToWishList",
  "removeFromWishList",
  "toggleWishList",
  "getWishList",
  "isProductInWishList",
  "getWishListCount",
  "clearWishList",
  "moveWishListToCart",
] as const;

describe("the auth-derived wishlist surface", () => {
  it("exists", () => {
    for (const name of MINE) {
      expect(wishlist).toMatch(
        new RegExp(`export const ${name} = (?:mutation|query)\\(`),
      );
    }
  });

  it("is told nothing about who is calling", () => {
    for (const name of MINE) {
      expect(argsOf(fnBody(wishlist, name)), name).not.toMatch(
        /clerkId|clerk_id|user_id|userId|email/,
      );
    }
  });

  it("derives identity from the token", () => {
    for (const name of ["toggleMyWishlistItem", "removeFromMyWishlist"]) {
      expect(fnBody(wishlist, name), name).toMatch(/getAuthUser\(ctx\)/);
    }
    // The read is deliberately softer: signed out is an empty wishlist, not an
    // error, because the heart renders on catalogue cards a guest can browse.
    expect(fnBody(wishlist, "getMyWishlist")).toMatch(
      /ctx\.auth\.getUserIdentity\(\)/,
    );
  });

  it("returns the resulting state, not a success flag", () => {
    const body = fnBody(wishlist, "toggleMyWishlistItem");
    expect(body).toMatch(/inWishlist: true/);
    expect(body).toMatch(/inWishlist: false/);
    // `success: true` on every path — including the ones that changed nothing —
    // is what the twelve legacy functions returned.
    expect(body).not.toMatch(/success: true/);
  });

  it("caps the list, because it is one document and productsByIds caps at 100", () => {
    const body = fnBody(wishlist, "toggleMyWishlistItem");
    expect(body).toMatch(/MAX_WISHLIST_ITEMS/);
    expect(wishlist).toMatch(/const MAX_WISHLIST_ITEMS = 100;/);
    // An uncapped list would show truncated while the count claimed more.
    expect(fnBody(wishlist, "getMyWishlist")).toMatch(/atCapacity/);
  });

  it("does not swallow errors into an empty result", () => {
    // `getWishListByClerkId` returns success with an empty list from its catch,
    // so a database error reads as "you have saved nothing".
    for (const name of MINE) {
      expect(fnBody(wishlist, name), name).not.toMatch(/catch/);
    }
  });
});

describe("the legacy twelve", () => {
  it("are all tagged, so nothing new adopts them", () => {
    for (const name of LEGACY) {
      const declaration = wishlist.indexOf(`export const ${name} = `);
      expect(declaration, `${name} not found`).toBeGreaterThan(-1);
      // The tag must sit in this declaration's own preceding comment, not a
      // neighbour's: everything after the last closing brace before it.
      const preamble = wishlist.slice(
        Math.max(0, declaration - 600),
        declaration,
      );
      const own = preamble.slice(preamble.lastIndexOf("});") + 1);
      expect(own, `${name} is not marked deprecated`).toMatch(/@deprecated/);
    }
  });
});
