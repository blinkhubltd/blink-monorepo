import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every public mutation that writes the `agents` table must be gated.
 *
 * ── The hole this closes ─────────────────────────────────────────────────
 *
 * `createAgent`, `updateAgent` and `deleteAgent` had no authorization check
 * of any kind — not a permission, not even a signed-in requirement. Convex
 * exports every function publicly, so the three of them together were a
 * complete path from "can reach the deployment" to "can withdraw money":
 *
 *   1. `createAgent` — make yourself an agent.
 *   2. `updateAgent` — it took `AgentsUpdateValidator`, the whole document,
 *      so it accepted `balance`. Set your own.
 *   3. `requestMyPayout` — withdraw it. That one IS gated, and correctly, but
 *      it gates on being the agent, which step 1 arranged.
 *
 * This is the same shape as the `incrementInstallCount` /
 * `incrementRegistrationCount` hole recorded in `app/agent/index.tsx`'s
 * header: those were closed by making them internal, and these were left.
 *
 * The ledger fields are a second, separate lesson: `updateAgent` now takes
 * an explicit short arg list instead of the table validator, because
 * "accept the whole document" is how a balance became client-writable in
 * the first place.
 */

const MARKETING_PATH = join(__dirname, "..", "convex", "data", "marketing.ts");
const source = readFileSync(MARKETING_PATH, "utf8");

/** Public mutations only — `internalMutation` is unreachable from an app. */
function extractPublicMutations(text: string): { name: string; body: string }[] {
  const pattern = /export const (\w+) = mutation\(\{([\s\S]*?)\n\}\);/g;
  const out: { name: string; body: string }[] = [];
  for (const match of text.matchAll(pattern)) {
    out.push({ name: match[1]!, body: match[2]! });
  }
  return out;
}

const mutations = extractPublicMutations(source);

describe("data/marketing.ts public mutations", () => {
  it("finds them (the extractor is not silently broken)", () => {
    expect(mutations.length).toBeGreaterThanOrEqual(3);
    for (const name of ["createAgent", "updateAgent", "deleteAgent"]) {
      expect(mutations.some((m) => m.name === name)).toBe(true);
    }
  });

  const ADMIN_WRITES = ["createAgent", "updateAgent", "deleteAgent"];

  for (const name of ADMIN_WRITES) {
    it(`${name} asserts an agents permission`, () => {
      const mutation = mutations.find((m) => m.name === name)!;
      expect(mutation.body).toMatch(/assertPermission\(ctx, "agents:[A-Z]+"\)/);
    });
  }

  /**
   * The two customer-facing mutations here are deliberately NOT permission
   * gated — a customer has no admin permissions — but they must still
   * resolve a caller rather than trusting an id from the wire.
   */
  it("the attribution mutations still resolve the caller from the session", () => {
    for (const name of ["attributeMyRegistration", "attributeMyInstall"]) {
      const mutation = mutations.find((m) => m.name === name);
      if (!mutation) continue;
      expect(mutation.body).toMatch(/getAuthUser/);
    }
  });
});

describe("updateAgent's arguments", () => {
  const body = mutations.find((m) => m.name === "updateAgent")!.body;

  it("does not accept the whole agent document", () => {
    // `AgentsUpdateValidator` includes balance, total_earned, total_paid and
    // the three activity counters.
    expect(body).not.toMatch(/args:\s*AgentsUpdateValidator/);
  });

  for (const field of [
    "balance",
    "total_earned",
    "total_paid",
    "scans",
    "installs",
    "registerations",
    "paystack_recipient_code",
    "code",
  ]) {
    it(`does not accept ${field}, which is computed rather than administered`, () => {
      // Scoped to the args block so a mention in the doc comment above does
      // not count as accepting the field.
      const args = body.slice(body.indexOf("args:"), body.indexOf("handler:"));
      expect(args).not.toContain(`${field}:`);
    });
  }
});
