import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The agent programme, where a public mutation credited real money.
 *
 * `incrementInstallCount` and `incrementRegistrationCount` were public,
 * unauthenticated mutations that schedule `creditAgentEarning` — an amount
 * credited to an agent's balance and withdrawable through the Paystack payout
 * path. Both were keyed only on `agentCode`, which is printed on the agent's own
 * QR poster and is public by design. Anyone who could read a poster could call
 * either in a loop and mint earnings.
 *
 * That is the most serious defect found in this port, and it is the reason this
 * file leads with it: an auth hole that leaks data is bad, and one that prints
 * money is a different category.
 *
 * The reads were the familiar shape — `getAgentByUser`, `getAgentEarnings`,
 * `getAgentStats` and `getAgentPaymentRequests` all took an id as an argument
 * with no auth, so an id was enough to read another agent's balance, earnings,
 * payout history, M-Pesa number and Paystack recipient code.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const marketing = read("data", "marketing.ts");
const payouts = read("data", "agent_payment_requests.ts");
const validators = read("validators.ts");

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
    `export const ${name} = (?:mutation|query|internalMutation|internalQuery|action|internalAction)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

describe("nothing public can credit an agent", () => {
  it("both earning counters are internal", () => {
    for (const name of [
      "incrementInstallCount",
      "incrementRegistrationCount",
    ]) {
      expect(marketing, name).toMatch(
        new RegExp(`export const ${name} = internalMutation\\(`),
      );
      expect(marketing, name).not.toMatch(
        new RegExp(`export const ${name} = mutation\\(`),
      );
    }
  });

  it("creditAgentEarning stays internal", () => {
    expect(marketing).toMatch(
      /export const creditAgentEarning = internalMutation\(/,
    );
  });

  it("the only public function that credits requires a real account", () => {
    const body = fnBody(marketing, "attributeMyRegistration");
    expect(body).toMatch(/getAuthUser\(ctx\)/);
    expect(body).toMatch(/creditAgentEarning/);
  });

  it("and credits at most once per account, ever", () => {
    const body = fnBody(marketing, "attributeMyRegistration");
    // The marker is set on the user and never cleared, so a replay credits
    // nothing. Without it, this would be the old hole with a login attached.
    expect(body).toMatch(/user\.referred_by_agent_id/);
    expect(body).toMatch(/referred_by_agent_id: agent\._id/);
    expect(validators).toMatch(
      /referred_by_agent_id: v\.optional\(v\.id\("agents"\)\)/,
    );
  });

  it("and refuses to credit an agent for their own account", () => {
    expect(fnBody(marketing, "attributeMyRegistration")).toMatch(
      /agent\.user_id === user\._id/,
    );
  });

  it("does not confirm whether a code exists", () => {
    // Reporting "no such agent" makes this an oracle for enumerating codes, and
    // failing a sign-up over a mistyped referral is worse than ignoring it.
    const body = fnBody(marketing, "attributeMyRegistration");
    expect(body).toMatch(/reason: "unknown" as const/);
    expect(body).not.toMatch(/throw new ConvexError\("Agent not found/);
  });
});

describe("the agent's own figures", () => {
  it("are auth-derived and take no id", () => {
    for (const name of ["getMyAgentSummary", "getMyAgentEarnings"]) {
      expect(argsOf(fnBody(marketing, name)), name).not.toMatch(
        /agentId|agent_id|userId|user_id|clerkId/,
      );
    }
    expect(argsOf(fnBody(payouts, "getMyPayoutRequests"))).not.toMatch(
      /agentId|agent_id|userId/,
    );
    expect(argsOf(fnBody(payouts, "requestMyPayout"))).not.toMatch(
      /agentId|agent_id/,
    );
  });

  it("never hand the client a payout destination", () => {
    const body = fnBody(marketing, "getMyAgentSummary");
    // The screen needs to know whether payouts are ENABLED, not where the money
    // goes. A recipient code on the client is a payout destination on the client.
    expect(body).toMatch(/payoutsEnabled: !!agent\.paystack_recipient_code/);
    expect(body).not.toMatch(/paystack_recipient_code:/);
    expect(body).not.toMatch(/mpesa_number/);
  });

  it("count earnings to a cap rather than collecting the table", () => {
    const body = fnBody(marketing, "getMyAgentSummary");
    expect(body).not.toMatch(/\.collect\(\)/);
    expect(body).toMatch(/EARNINGS_COUNT_CAP/);
    // And say when the count is a floor.
    expect(body).toMatch(/earningsCountIsExact/);
  });
});

describe("the id-argument reads", () => {
  it("are internal", () => {
    for (const [source, name] of [
      [marketing, "getAgentByUser"],
      [marketing, "getAgentEarnings"],
      [marketing, "getAgentStats"],
      [payouts, "getAgentPaymentRequests"],
    ] as const) {
      expect(source, name).toMatch(
        new RegExp(`export const ${name} = internalQuery\\(`),
      );
    }
  });
});

describe("the payout rules live in one place", () => {
  it("both entry points go through the shared helper", () => {
    expect(payouts).toMatch(/async function openPayoutRequest\(/);
    expect(fnBody(payouts, "createPaymentRequest")).toMatch(
      /openPayoutRequest\(ctx, agent, args\.amount\)/,
    );
    expect(fnBody(payouts, "requestMyPayout")).toMatch(
      /openPayoutRequest\(ctx, agent, args\.amount\)/,
    );
  });

  it("the legacy entry point still asserts ownership", () => {
    expect(fnBody(payouts, "createPaymentRequest")).toMatch(
      /assertAgentOwner\(ctx, args\.agentId\)/,
    );
  });

  it("an empty payout-days setting does not block every payout", () => {
    const helper = payouts.slice(payouts.indexOf("async function openPayoutRequest"));
    // `"".split(",")` yields `[""]`, so an unset-but-present setting used to mean
    // "no day is allowed" — payouts silently impossible.
    expect(helper).toMatch(/allowedDays\.length > 0 && !allowedDays\.includes/);
  });

  it("rejects a non-finite amount, not just a non-positive one", () => {
    const helper = payouts.slice(payouts.indexOf("async function openPayoutRequest"));
    // `NaN <= 0` is false, so the original check let NaN through into a balance
    // comparison that is also false — a request for NaN shillings.
    expect(helper).toMatch(/!Number\.isFinite\(amount\) \|\| amount <= 0/);
  });
});
