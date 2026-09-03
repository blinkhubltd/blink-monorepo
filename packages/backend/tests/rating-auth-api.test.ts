import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A rider's rating is their standing, and it was anonymously writable.
 *
 * `submitRiderRating` was a public mutation that checked the order was Delivered
 * and not yet rated, and nothing else. Order ids are not secrets, so any caller
 * could set the score on any delivered order — and the score folds into a running
 * average that follows the rider.
 *
 * `getRiderRatingContext` was a public query returning the rider's full name AND
 * phone number to anyone holding an order id: the same leak class as the tracking
 * queries, in a projection small enough to look harmless.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const ratings = read("data", "ratings.ts");

function fnBody(source: string, name: string): string {
  const pattern = new RegExp(
    `export const ${name} = (?:mutation|query|internalMutation|internalQuery)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

describe("the legacy pair", () => {
  it("submitRiderRating is internal", () => {
    expect(ratings).toMatch(
      /export const submitRiderRating = internalMutation\(/,
    );
    expect(ratings).not.toMatch(/export const submitRiderRating = mutation\(/);
  });

  it("getRiderRatingContext is internal", () => {
    expect(ratings).toMatch(
      /export const getRiderRatingContext = internalQuery\(/,
    );
    expect(ratings).not.toMatch(/export const getRiderRatingContext = query\(/);
  });
});

describe("rateMyDelivery", () => {
  const body = fnBody(ratings, "rateMyDelivery");

  it("authenticates and requires the caller to own the order", () => {
    expect(body).toMatch(/getAuthUser\(ctx\)/);
    expect(body).toMatch(/order\.user_id !== user\._id/);
  });

  it("gives the same answer for someone else's order as for a missing one", () => {
    // Otherwise a rejected rating tells you which order ids exist.
    expect(body).toMatch(/!order \|\| order\.user_id !== user\._id/);
  });
});

describe("getMyDeliveryRating", () => {
  const body = fnBody(ratings, "getMyDeliveryRating");

  it("is owner-scoped", () => {
    expect(body).toMatch(/getAuthUser\(ctx\)/);
    expect(body).toMatch(/order\.user_id !== user\._id/);
  });

  it("returns a first name, and never a phone number", () => {
    expect(body).toMatch(/riderFirstName/);
    // The rider's number belongs to the delivery in progress, not to the
    // rating afterwards.
    expect(body).not.toMatch(/phone/);
    expect(body).not.toMatch(/last_name/);
  });
});

describe("the rating value", () => {
  it("must be a whole number in range", () => {
    const body = ratings.slice(ratings.indexOf("async function applyRating"));
    // `rating < 1 || rating > 5` alone admits 4.7 — and NaN, which fails both
    // comparisons and would poison every later average for that rider.
    expect(body).toMatch(/Number\.isInteger\(rating\)/);
    expect(body).toMatch(/rating < MIN_RATING \|\| rating > MAX_RATING/);
  });

  it("does not spread a possibly-absent rider_details", () => {
    const body = ratings.slice(ratings.indexOf("async function applyRating"));
    // The old version did, behind an `as any`, so a user with no rider_details
    // got an object missing the required `status` and `vehicle_type` — an
    // invalid document, rejected at runtime, surfacing as a failed rating.
    expect(body).toMatch(/if \(!details\) return \{ success: false/);
    expect(body).not.toMatch(/\.\.\.rider\.rider_details/);
    expect(body).not.toMatch(/as any/);
  });
});
