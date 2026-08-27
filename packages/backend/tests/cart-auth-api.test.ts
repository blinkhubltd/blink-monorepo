import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The cart's auth-derived API, and the IDOR it replaces.
 *
 * ── The hole ──────────────────────────────────────────────────────────────
 *
 * Every original cart function takes the caller's identity as an ARGUMENT —
 * either `user_id`, or a `clerkId` handed straight to `getUserByClerkId`. Convex
 * exposes them publicly, so any client could read or mutate any customer's
 * basket by supplying somebody else's id. Nothing about the call site looks
 * wrong; the argument list is the bug.
 *
 * The replacements derive identity from `ctx.auth.getUserIdentity()` and accept
 * no actor argument at all. Not accepted-and-ignored — an ignored parameter
 * invites a future change to start honouring it.
 *
 * This is a source-scanning test for the same reason as the catalogue and role
 * guard tests: the failure compiles and type-checks.
 */

const source = readFileSync(
  join(__dirname, "..", "convex", "data", "cart.ts"),
  "utf8",
);

/** The auth-derived surface apps/shop is allowed to call. */
const SHOP_API = [
  "getMyCart",
  "setMyCartLine",
  "clearMyCart",
  "mergeIntoMyCart",
] as const;

function bodyOf(name: string): string | null {
  const match = source.match(
    new RegExp(
      `export const ${name} = (?:mutation|query)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
    ),
  );
  return match?.[1] ?? null;
}

/**
 * The `args:` object of a function definition, and nothing else.
 *
 * Brace-matched rather than regexed. A regex closing on the first `\n  }` runs
 * straight past a single-line `args: { ... },` into the handler — which contains
 * legitimate `user_id` references in its inserts. That made the test fail a safe
 * signature, and it would equally have passed a spoofable one.
 */
function argsOf(name: string): string {
  const body = bodyOf(name);
  if (!body) return "";
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

describe("the auth-derived cart API", () => {
  it.each(SHOP_API)("%s exists", (name) => {
    expect(bodyOf(name)).not.toBeNull();
  });

  it.each(SHOP_API)("%s never accepts an actor argument", (name) => {
    // The args block only. A `v.id("users")` deeper in the handler is a lookup,
    // not an actor claim.
    const args = argsOf(name);

    expect(args).not.toMatch(/clerkId/);
    expect(args).not.toMatch(/user_id/);
    expect(args).not.toMatch(/userId/);
    expect(args).not.toMatch(/v\.id\("users"\)/);
  });

  it.each(SHOP_API)("%s derives identity from the auth token", (name) => {
    const body = bodyOf(name)!;
    // Either directly, or through the local callerUser() helper which does.
    expect(body).toMatch(/callerUser\(ctx\)|ctx\.auth\.getUserIdentity\(\)/);
  });

  it("callerUser reads the token, not an argument", () => {
    const helper = source.match(
      /async function callerUser\([\s\S]*?\n\}/,
    )?.[0];
    expect(helper).toBeDefined();
    expect(helper!).toMatch(/ctx\.auth\.getUserIdentity\(\)/);
    // Takes only ctx — no id to be spoofed.
    expect(helper!).toMatch(/callerUser\(ctx: QueryCtx \| MutationCtx\)/);
  });

  it("the mutations refuse a signed-out caller", () => {
    // getMyCart deliberately returns an empty basket instead of throwing, since
    // browsing is legal for guests and a throw would surface as a broken screen.
    // The WRITES must refuse.
    for (const name of ["setMyCartLine", "clearMyCart", "mergeIntoMyCart"]) {
      expect(bodyOf(name)!).toMatch(/if \(!user\) throw new ConvexError/);
    }
  });

  it("getMyCart returns an empty basket rather than throwing", () => {
    expect(bodyOf("getMyCart")!).toMatch(/if \(!user\) return/);
  });
});

describe("the legacy cart API is marked as unsafe", () => {
  // Not deleted: the standalone blink-ecommerce app still calls these until it
  // retires. Tagged so nothing NEW adopts them.
  const LEGACY = [
    "getCartItemsByClerkId",
    "createCartItemByClerkId",
    "updateCartItemQuantityByClerkId",
    "removeCartItemByClerkId",
    "clearCartByClerkId",
    "getCartCountByClerkId",
    "mergeCart",
    "getCartSummary",
  ];

  it.each(LEGACY)("%s carries a @deprecated notice", (name) => {
    const index = source.indexOf(`export const ${name} = `);
    if (index === -1) return; // Deleted is also a fine outcome.
    const preamble = source.slice(Math.max(0, index - 600), index);
    expect(preamble).toMatch(/@deprecated/);
  });

  it("getCartSummary's hardcoded fee is called out, not silently kept", () => {
    // It quotes 250 / free-over-2000 while orders.ts charges getDeliveryFees
    // (default 200), so the basket shows a price the order will not honour.
    // apps/shop must not call it. Documented until the threshold becomes a
    // platform setting.
    expect(source).toMatch(/@deprecated[\s\S]{0,600}export const getCartSummary/);
  });
});

describe("mergeIntoMyCart semantics", () => {
  const body = bodyOf("mergeIntoMyCart")!;

  it("takes the larger quantity rather than summing", () => {
    // Summing is the intuitive choice and the wrong one: two in the guest
    // basket plus two already saved is not a request for four.
    expect(body).toMatch(/Math\.max\(/);
    // No accumulation of the two sides.
    expect(body).not.toMatch(/merged\.get\([^)]*\)\s*\+\s*quantity/);
  });

  it("drops products that are no longer sellable", () => {
    // A guest basket can be days old, so the merge re-checks status and stock
    // rather than trusting what was stored on the device.
    expect(body).toMatch(/status !== "Active"/);
    expect(body).toMatch(/quantity <= 0/);
  });

  it("caps each line to available stock", () => {
    expect(body).toMatch(/Math\.min\(quantity, product\.quantity\)/);
  });
});

describe("setMyCartLine semantics", () => {
  const body = bodyOf("setMyCartLine")!;

  it("sets an absolute quantity rather than applying a delta", () => {
    // Idempotent, so a double-tapped stepper cannot add two. The UI already
    // knows the number it wants.
    const args = argsOf("setMyCartLine");
    expect(args).toMatch(/quantity: v\.number\(\)/);
    expect(args).not.toMatch(/delta|increment/i);
  });

  it("refuses an inactive product and caps to stock", () => {
    expect(body).toMatch(/status !== "Active"/);
    expect(body).toMatch(/Math\.min\(quantity, product\.quantity\)/);
  });

  it("treats zero as removal", () => {
    expect(body).toMatch(/capped === 0/);
  });
});
