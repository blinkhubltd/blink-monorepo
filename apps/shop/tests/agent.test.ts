import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PAYOUT_STATUSES,
  availableBalance,
  describePayoutStatus,
  payoutRequestProblem,
  referralDeepLink,
} from "../lib/agent";

describe("describePayoutStatus", () => {
  it("covers every status the backend can store", () => {
    for (const status of PAYOUT_STATUSES) {
      expect(describePayoutStatus(status).label.length).toBeGreaterThan(0);
    }
  });

  it("distinguishes awaiting approval from approved", () => {
    // These mean different things to an agent: one can still be refused, the
    // other is money on its way. The old dashboard showed both as "pending".
    expect(describePayoutStatus("pending").label).not.toBe(
      describePayoutStatus("approved").label,
    );
  });

  it("falls back to the raw name on an unknown status", () => {
    expect(describePayoutStatus("settled").label).toBe("settled");
    expect(describePayoutStatus("settled").variant).toBe("secondary");
  });

  it("is not fooled by inherited object keys", () => {
    expect(describePayoutStatus("constructor").label).toBe("constructor");
    expect(describePayoutStatus("toString").variant).toBe("secondary");
  });
});

describe("the status list matches the backend union", () => {
  const validators = readFileSync(
    join(__dirname, "..", "..", "..", "packages", "backend", "convex", "validators.ts"),
    "utf8",
  );

  it("has no status the backend cannot produce, and misses none", () => {
    const match = /export const agentPaymentRequestStatus = \[([\s\S]*?)\] as const;/.exec(
      validators,
    );
    expect(match, "agentPaymentRequestStatus not found").not.toBeNull();
    const backend = [...match![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect([...PAYOUT_STATUSES].sort()).toEqual([...backend].sort());
  });
});

describe("availableBalance", () => {
  it("subtracts money already claimed by an open request", () => {
    expect(availableBalance(5000, 2000)).toBe(3000);
  });

  it("never goes negative", () => {
    // A request approved before a correction could exceed the balance.
    expect(availableBalance(1000, 4000)).toBe(0);
  });

  it("treats a non-finite balance as nothing rather than NaN", () => {
    expect(availableBalance(Number.NaN, 0)).toBe(0);
    expect(availableBalance(1000, Number.NaN)).toBe(1000);
  });
});

describe("payoutRequestProblem", () => {
  const ok = {
    amount: 500,
    available: 1000,
    payoutsEnabled: true,
    hasPendingRequest: false,
  };

  it("is null when a request can be made", () => {
    expect(payoutRequestProblem(ok)).toBeNull();
  });

  it("reports payouts not being enabled first", () => {
    // Before anything about the amount: no destination means no request,
    // whatever the figure.
    const problem = payoutRequestProblem({ ...ok, payoutsEnabled: false });
    expect(problem).toMatch(/not enabled/);
  });

  it("blocks a second concurrent request", () => {
    // The server enforces one at a time; without this the agent sees a raw
    // error after typing an amount.
    expect(
      payoutRequestProblem({ ...ok, hasPendingRequest: true }),
    ).toMatch(/awaiting approval/);
  });

  it("rejects zero, negative and non-numeric amounts", () => {
    expect(payoutRequestProblem({ ...ok, amount: 0 })).toMatch(/Enter an amount/);
    expect(payoutRequestProblem({ ...ok, amount: -5 })).toMatch(
      /Enter an amount/,
    );
    // NaN passes `<= 0` as false and `> available` as false, so without the
    // finite check it would read as a valid request.
    expect(payoutRequestProblem({ ...ok, amount: Number.NaN })).toMatch(
      /Enter an amount/,
    );
  });

  it("rejects more than is available", () => {
    expect(payoutRequestProblem({ ...ok, amount: 1001 })).toMatch(
      /more than your available/,
    );
  });

  it("allows exactly the available balance", () => {
    expect(payoutRequestProblem({ ...ok, amount: 1000 })).toBeNull();
  });
});

describe("referralDeepLink", () => {
  it("builds a blink:// link, not a website URL", () => {
    // No universal https:// link — app.config.ts's associatedDomains point at
    // blink.app, which redirects to an unrelated company. A universal link
    // built on that domain would 404 or land on somebody else's site for
    // anyone scanning without the app already installed.
    expect(referralDeepLink("BLK-1234")).toBe("blink://referral?code=BLK-1234");
  });

  it("URL-encodes the code, so a code with special characters cannot break the query string", () => {
    expect(referralDeepLink("BLK 1234&x=1")).toBe(
      "blink://referral?code=BLK%201234%26x%3D1",
    );
  });

  it("round-trips through URLSearchParams", () => {
    const link = referralDeepLink("BLK-9999");
    const query = link.split("?")[1]!;
    const params = new URLSearchParams(query);
    expect(params.get("code")).toBe("BLK-9999");
  });
});
