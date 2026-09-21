import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PAYOUT_STATUSES,
  availableBalance,
  describePayoutStatus,
  earningRangeStart,
  filterEarningsByRange,
  parsePayoutDays,
  payoutDayProblem,
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

describe("payoutDayProblem", () => {
  // A Wednesday.
  const wednesday = new Date("2026-03-04T10:00:00");

  it("allows every day when nothing is configured", () => {
    // Matches the server: an unset or blank setting is "no restriction".
    // Reading it as "no day is allowed" would block every payout platform-wide.
    expect(payoutDayProblem(null, wednesday)).toBeNull();
    expect(payoutDayProblem(undefined, wednesday)).toBeNull();
    expect(payoutDayProblem("", wednesday)).toBeNull();
    expect(payoutDayProblem("   ,  ", wednesday)).toBeNull();
  });

  it("allows today when today is listed", () => {
    expect(payoutDayProblem("Monday,Wednesday", wednesday)).toBeNull();
  });

  it("is case- and space-insensitive, because an admin typed it", () => {
    expect(payoutDayProblem("  monday , WEDNESDAY ", wednesday)).toBeNull();
  });

  it("refuses on a day that is not listed, quoting the setting verbatim", () => {
    // Verbatim so this message and the server's refusal read identically.
    expect(payoutDayProblem("Monday,Thursday", wednesday)).toBe(
      "Payouts can only be requested on Monday,Thursday.",
    );
  });
});

describe("parsePayoutDays", () => {
  it("drops empty entries rather than producing blank days", () => {
    expect(parsePayoutDays("Monday,,Thursday,")).toEqual([
      "monday",
      "thursday",
    ]);
  });
});

describe("earningRangeStart", () => {
  it("has no lower bound for all", () => {
    expect(earningRangeStart("all")).toBeNull();
  });

  it("starts today at local midnight, not 24 hours ago", () => {
    const now = new Date("2026-03-04T15:30:00");
    const start = new Date(earningRangeStart("today", now)!);
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(4);
  });

  it("starts the week on Monday", () => {
    // Wednesday 4 March 2026 -> Monday 2 March.
    const start = new Date(
      earningRangeStart("week", new Date("2026-03-04T15:30:00"))!,
    );
    expect(start.getDate()).toBe(2);
    expect(start.getDay()).toBe(1);
  });

  it("treats Sunday as the end of the week just gone, not the start of the next", () => {
    // JS makes Sunday 0, which is the trap: a naive `getDay()` subtraction
    // would move the boundary forward a day and hide the whole week.
    const start = new Date(
      earningRangeStart("week", new Date("2026-03-08T12:00:00"))!,
    );
    expect(start.getDate()).toBe(2);
    expect(start.getDay()).toBe(1);
  });

  it("starts the month on the first", () => {
    const start = new Date(
      earningRangeStart("month", new Date("2026-03-04T15:30:00"))!,
    );
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(2);
  });
});

describe("filterEarningsByRange", () => {
  const now = new Date("2026-03-04T15:30:00");
  const earnings = [
    { created_at: new Date("2026-03-04T09:00:00").getTime() },
    { created_at: new Date("2026-03-03T09:00:00").getTime() },
    { created_at: new Date("2026-02-20T09:00:00").getTime() },
  ];

  it("returns everything for all", () => {
    expect(filterEarningsByRange(earnings, "all", now)).toHaveLength(3);
  });

  it("keeps only today", () => {
    expect(filterEarningsByRange(earnings, "today", now)).toHaveLength(1);
  });

  it("keeps this week", () => {
    expect(filterEarningsByRange(earnings, "week", now)).toHaveLength(2);
  });

  it("keeps this month", () => {
    expect(filterEarningsByRange(earnings, "month", now)).toHaveLength(2);
  });

  it("does not mutate the input", () => {
    const copy = [...earnings];
    filterEarningsByRange(earnings, "today", now);
    expect(earnings).toEqual(copy);
  });
});
