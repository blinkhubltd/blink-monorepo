import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The notification feed was a second door onto the delivery code.
 *
 * `orders.generateDeliveryCode` returning the code to any caller was closed in
 * an earlier slice. But `createDeliveryCodeNotification` writes that same
 * six-digit code into a notification's message AND into `data.deliveryCode`, and
 * `getUserNotifications` took `userId: v.id("users")` as an argument and was
 * public — so the code that authorises releasing a parcel was readable by an
 * unauthenticated caller holding a user id.
 *
 * Closing one route to a secret and leaving another is how a fix comes to be
 * believed, which is why this file exists rather than a line in a commit
 * message.
 *
 * The seven `create*Notification` mutations were public too, so anyone could
 * write into any customer's feed. A notification titled "🔐 Your Delivery Code"
 * carrying an attacker's phone number is a complete phishing message, delivered
 * inside the app the customer trusts.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

const notifications = read("data", "user_notifications.ts");
const actions = read("data", "notifications.ts");

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

const MINE = [
  "getMyNotifications",
  "getMyUnreadCount",
  "markMyNotificationRead",
  "markAllMyNotificationsRead",
  "deleteMyNotification",
] as const;

const CREATORS = [
  "createNotification",
  "createRiderAssignmentNotification",
  "createPickerAssignmentNotification",
  "createVendorPickerNotification",
  "createOrderReadyNotification",
  "createDeliveryCodeNotification",
  "createOrderStatusNotification",
] as const;

const RETIRED = [
  "getUserNotifications",
  "getUnreadNotificationCount",
  "markNotificationAsRead",
  "markAllNotificationsAsRead",
  "deleteNotification",
  "deleteReadNotifications",
] as const;

describe("the delivery code is not readable through the feed", () => {
  it("getUserNotifications is internal", () => {
    expect(notifications).toMatch(
      /export const getUserNotifications = internalQuery\(/,
    );
    expect(notifications).not.toMatch(
      /export const getUserNotifications = query\(/,
    );
  });

  it("createDeliveryCodeNotification cannot be called from a client", () => {
    expect(notifications).toMatch(
      /export const createDeliveryCodeNotification = internalMutation\(/,
    );
  });

  it("the action that sends it reaches it internally", () => {
    // `api.*` on an internal function does not resolve, so this would fail at
    // deploy — asserted anyway, because the mistake is easy to make in reverse.
    expect(actions).not.toMatch(/api\.data\.user_notifications\.create/);
    expect(actions).toMatch(
      /internal\.data\.user_notifications\.createDeliveryCodeNotification/,
    );
  });
});

describe("the auth-derived feed", () => {
  it("exists for read, count, mark and delete", () => {
    for (const name of MINE) {
      expect(notifications).toMatch(
        new RegExp(`export const ${name} = (?:mutation|query)\\(`),
      );
    }
  });

  it("is told nothing about who is calling", () => {
    for (const name of MINE) {
      expect(argsOf(fnBody(notifications, name)), name).not.toMatch(
        /userId|user_id|clerkId|clerk_id|email/,
      );
    }
  });

  it("derives identity from the token", () => {
    for (const name of MINE) {
      expect(fnBody(notifications, name), name).toMatch(
        /getAuthUser\(ctx\)|getAuthUserOrNull\(ctx\)/,
      );
    }
  });

  it("checks ownership on the single-row writes", () => {
    for (const name of ["markMyNotificationRead", "deleteMyNotification"]) {
      expect(fnBody(notifications, name), name).toMatch(
        /notification\.user_id !== user\._id/,
      );
    }
  });

  it("reads are bounded, never collected", () => {
    for (const name of MINE) {
      // `.collect()` on a per-user index is unbounded by construction, and the
      // customer it throws for is the one who never opened the screen.
      expect(fnBody(notifications, name), name).not.toMatch(/\.collect\(\)/);
    }
    expect(fnBody(notifications, "markAllMyNotificationsRead")).toMatch(
      /MAX_BULK_MARK/,
    );
    // And it says when the cap was hit, rather than reporting a clear feed.
    expect(fnBody(notifications, "markAllMyNotificationsRead")).toMatch(
      /more:/,
    );
  });

  it("projects `data` rather than returning an untyped blob", () => {
    const body = fnBody(notifications, "getMyNotifications");
    expect(body).toMatch(/readOrderId\(n\.data\)/);
    expect(body).toMatch(/readRoute\(n\.data\)/);
    expect(body).not.toMatch(/data: n\.data/);
  });
});

describe("the writers and the retired readers", () => {
  it("every creator is internal", () => {
    for (const name of CREATORS) {
      expect(notifications, name).toMatch(
        new RegExp(`export const ${name} = internalMutation\\(`),
      );
    }
  });

  it("every userId-argument function is internal", () => {
    for (const name of RETIRED) {
      expect(notifications, name).toMatch(
        new RegExp(`export const ${name} = internal(?:Query|Mutation)\\(`),
      );
    }
  });
});
