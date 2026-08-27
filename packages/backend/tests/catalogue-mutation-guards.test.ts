import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every catalogue write must be authenticated.
 *
 * ── What was wrong ────────────────────────────────────────────────────────
 *
 * `data/categories.ts` and `data/products.ts` had **no authorization anywhere**
 * — no `getAuthUser`, no `assertPermission`, not even a signed-in requirement.
 * Convex exposes every `mutation` export over the public API, so the deployment
 * URL alone was enough for an anonymous caller to run `deleteCategory`,
 * `bulkUpdateProductStatus`, or `updateProductQuantity` against production.
 * `lib/permissions.ts` and `auth.helpers.ts` already existed and were used
 * elsewhere; these two files simply never adopted them.
 *
 * This was found while planning the customer app, and it matters more once that
 * app ships: a public storefront widens the set of people who know the
 * deployment URL.
 *
 * ── Why a source-scanning test ────────────────────────────────────────────
 *
 * The same reason as `role-mutation-guards.test.ts`: an ungated mutation
 * compiles, type-checks, and looks entirely normal at the call site. Nothing
 * short of reading the handler reveals it. So the check is mechanical, and it
 * fails on the *next* one somebody adds rather than on the ones already fixed.
 */

const FILES = ["categories.ts", "products.ts"] as const;

const GUARDS =
  /assertPermission|assertStaffOrPermission|assertSuperAdmin|getAuthUser/;

/** Public mutations only. `internalMutation` is unreachable by construction. */
function extractPublicMutations(text: string): { name: string; body: string }[] {
  const pattern = /export const (\w+) = mutation\(\{([\s\S]*?)\n\}\);/g;
  const out: { name: string; body: string }[] = [];
  for (const match of text.matchAll(pattern)) {
    out.push({ name: match[1]!, body: match[2]! });
  }
  return out;
}

const sources = FILES.map((file) => ({
  file,
  text: readFileSync(join(__dirname, "..", "convex", "data", file), "utf8"),
}));

describe.each(sources)("data/$file", ({ file, text }) => {
  const mutations = extractPublicMutations(text);

  it("finds public mutations (the extractor is not silently broken)", () => {
    // If a refactor changes the export style, this test would otherwise pass by
    // finding nothing at all.
    expect(mutations.length).toBeGreaterThan(3);
  });

  it("gates every public mutation on an auth check", () => {
    const unguarded = mutations
      .filter((m) => !GUARDS.test(m.body))
      .map((m) => m.name);

    expect(unguarded).toEqual([]);
  });

  it("checks the guard before any write or upload", () => {
    // Ordering matters: a guard after `ctx.db.insert` still throws, but the row
    // is already written and the transaction's rollback is the only thing
    // saving you. Assert the guard comes first instead of relying on that.
    const offenders: string[] = [];

    for (const m of mutations) {
      const guardAt = m.body.search(GUARDS);
      const writeAt = m.body.search(
        /ctx\.db\.(insert|patch|replace|delete)|ctx\.storage\.(generateUploadUrl|delete)|ctx\.scheduler\./,
      );
      if (writeAt >= 0 && guardAt >= 0 && guardAt > writeAt) {
        offenders.push(m.name);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("names a real permission resource", () => {
    // A typo like "product:CREATE" (singular) would be a permission no role can
    // ever hold, which fails closed and locks out every administrator — the
    // opposite failure from the one above, and just as invisible.
    const resource = file === "categories.ts" ? "categories" : "products";
    const used = [...text.matchAll(/assertPermission\(ctx, "([^"]+)"\)/g)].map(
      (m) => m[1]!,
    );

    expect(used.length).toBeGreaterThan(0);
    for (const permission of used) {
      expect(permission).toMatch(
        new RegExp(`^${resource}:(CREATE|READ|UPDATE|DELETE)$`),
      );
    }
  });
});

describe("the specific mutations that were open", () => {
  const all = sources.map((s) => s.text).join("\n");

  // Named individually because these are the ones that were publicly callable
  // against production. A regression on any single one is worth a failing test
  // that says which.
  const MUST_BE_GATED = [
    "generateUploadUrl",
    "createCategory",
    "updateCategory",
    "deleteCategory",
    "bulkCreateCategories",
    "backfillCategoriesSearchText",
    "createProduct",
    "updateProduct",
    "updateProductQuantity",
    "updateSingleProductStatus",
    "bulkUpdateProductStatus",
    "bulkCreateProducts",
    "addProductImages",
    "backfillProductsSearchText",
  ];

  it.each(MUST_BE_GATED)("%s is gated", (name) => {
    const pattern = new RegExp(
      `export const ${name} = mutation\\(\\{([\\s\\S]*?)\\n\\}\\);`,
    );
    const match = all.match(pattern);

    // Deleted or made internal is also an acceptable outcome — both remove the
    // hole. Only "still public and still ungated" fails.
    if (!match) return;

    expect(GUARDS.test(match[1]!)).toBe(true);
  });
});
