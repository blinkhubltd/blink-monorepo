import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PAYSTACK_BASE_URL,
  extractReference,
  fromMinorUnits,
  isChargeEvent,
  isTransferEvent,
  parseWebhookPayload,
  paystackPaths,
  paymentMethodFromChannel,
  timingSafeEqual,
  toMinorUnits,
  verifyPaystackSignature,
} from "../convex/lib/paystack";

const SECRET = "sk_test_deadbeefdeadbeefdeadbeefdeadbeef";

/** Independent reference implementation, so we are not testing our own maths. */
function sign(body: string, secret = SECRET): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

describe("verifyPaystackSignature", () => {
  const body = JSON.stringify({
    event: "charge.success",
    data: { reference: "BLK-123", status: "success", amount: 150000 },
  });

  it("accepts a signature produced by an independent HMAC-SHA512", async () => {
    expect(await verifyPaystackSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("accepts an uppercase hex signature", async () => {
    const upper = sign(body).toUpperCase();
    expect(await verifyPaystackSignature(body, upper, SECRET)).toBe(true);
  });

  it("tolerates surrounding whitespace in the header", async () => {
    expect(
      await verifyPaystackSignature(body, `  ${sign(body)}  `, SECRET),
    ).toBe(true);
  });

  it("rejects a signature made with a different secret", async () => {
    const wrong = sign(body, "sk_test_someoneelseskey");
    expect(await verifyPaystackSignature(body, wrong, SECRET)).toBe(false);
  });

  it("rejects when the body is altered by a single character", async () => {
    // The whole point: an attacker changing the amount must invalidate the MAC.
    const signature = sign(body);
    const tampered = body.replace("150000", "150001");
    expect(await verifyPaystackSignature(tampered, signature, SECRET)).toBe(
      false,
    );
  });

  it("rejects a re-serialised body even when semantically identical", async () => {
    // This is why the handler must sign `await req.text()` and never a parsed
    // and re-stringified object: key order and whitespace change the bytes.
    const signature = sign(body);
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(await verifyPaystackSignature(reserialised, signature, SECRET)).toBe(
      false,
    );
  });

  it("rejects a missing or empty signature header", async () => {
    expect(await verifyPaystackSignature(body, null, SECRET)).toBe(false);
    expect(await verifyPaystackSignature(body, "", SECRET)).toBe(false);
  });

  it("rejects when the secret is empty rather than signing with nothing", async () => {
    expect(await verifyPaystackSignature(body, sign(body), "")).toBe(false);
  });

  it("rejects a truncated signature", async () => {
    const truncated = sign(body).slice(0, 40);
    expect(await verifyPaystackSignature(body, truncated, SECRET)).toBe(false);
  });

  it("verifies an empty body consistently", async () => {
    expect(await verifyPaystackSignature("", sign(""), SECRET)).toBe(true);
    expect(await verifyPaystackSignature("", sign("x"), SECRET)).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects differing strings of equal length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("rejects strings of differing length", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("matches two empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("does not short-circuit on the first differing character", () => {
    // A `===` would return on index 0 here. This asserts the accumulator form
    // still compares the whole string — the property that removes the timing
    // side channel.
    expect(timingSafeEqual("Xbcdef", "abcdef")).toBe(false);
    expect(timingSafeEqual("abcdeX", "abcdef")).toBe(false);
  });
});

describe("amount conversion", () => {
  it("converts KES to cents", () => {
    expect(toMinorUnits(1500)).toBe(150_000);
    expect(toMinorUnits(0)).toBe(0);
    expect(toMinorUnits(1)).toBe(100);
  });

  it("rounds to a whole minor unit", () => {
    // Paystack rejects fractional minor units outright.
    expect(toMinorUnits(10.005)).toBe(1001);
    expect(toMinorUnits(10.004)).toBe(1000);
    expect(Number.isInteger(toMinorUnits(33.333))).toBe(true);
  });

  it("survives the classic float case", () => {
    // 0.1 + 0.2 territory. 19.99 * 100 is 1998.9999999999998 in IEEE 754.
    expect(toMinorUnits(19.99)).toBe(1999);
    expect(toMinorUnits(0.29)).toBe(29);
  });

  it("throws rather than sending NaN, which Paystack reads as zero", () => {
    expect(() => toMinorUnits(Number.NaN)).toThrow();
    expect(() => toMinorUnits(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("throws on a negative amount", () => {
    expect(() => toMinorUnits(-1)).toThrow();
  });

  it("round-trips", () => {
    for (const amount of [0, 1, 19.99, 1500, 99999.99]) {
      expect(fromMinorUnits(toMinorUnits(amount))).toBeCloseTo(amount, 2);
    }
  });

  it("rejects non-integer minor units", () => {
    expect(() => fromMinorUnits(100.5)).toThrow();
  });
});

describe("event classification", () => {
  it("recognises charge events", () => {
    expect(isChargeEvent("charge.success")).toBe(true);
    expect(isChargeEvent("charge.failed")).toBe(true);
    expect(isChargeEvent("transfer.success")).toBe(false);
    expect(isChargeEvent("subscription.create")).toBe(false);
  });

  it("recognises transfer events", () => {
    expect(isTransferEvent("transfer.success")).toBe(true);
    expect(isTransferEvent("transfer.reversed")).toBe(true);
    expect(isTransferEvent("charge.success")).toBe(false);
  });
});

describe("payload parsing", () => {
  it("parses a well-formed event", () => {
    const p = parseWebhookPayload(
      JSON.stringify({ event: "charge.success", data: { reference: "R1" } }),
    );
    expect(p?.event).toBe("charge.success");
    expect(extractReference(p!)).toBe("R1");
  });

  it("returns null rather than throwing on malformed input", () => {
    // Must not throw: the handler has to answer 200 to stop Paystack retrying
    // a payload it will never understand.
    expect(parseWebhookPayload("not json")).toBeNull();
    expect(parseWebhookPayload("")).toBeNull();
    expect(parseWebhookPayload("null")).toBeNull();
    expect(parseWebhookPayload('"a string"')).toBeNull();
    expect(parseWebhookPayload("[]")).toBeNull();
    expect(parseWebhookPayload("{}")).toBeNull();
    expect(parseWebhookPayload('{"event":123}')).toBeNull();
  });

  it("returns null for a missing or blank reference", () => {
    expect(extractReference({ event: "charge.success" })).toBeNull();
    expect(extractReference({ event: "charge.success", data: {} })).toBeNull();
    expect(
      extractReference({ event: "charge.success", data: { reference: "" } }),
    ).toBeNull();
  });
});

describe("endpoints", () => {
  it("has a single base URL", () => {
    // Previously declared three times across payments.ts and
    // agentPaymentRequests.ts.
    expect(PAYSTACK_BASE_URL).toBe("https://api.paystack.co");
  });

  it("url-encodes the reference so a slash cannot escape the path", () => {
    expect(paystackPaths.verifyTransaction("BLK/123")).toBe(
      "/transaction/verify/BLK%2F123",
    );
  });
});

describe("paymentMethodFromChannel", () => {
  const resp = (channel: string) => ({ data: { channel } });

  it.each([
    ["mobile_money", "Mobile Money"],
    ["mobile money", "Mobile Money"],
    ["mpesa", "Mobile Money"],
    ["MPESA", "Mobile Money"],
    ["bank", "Bank Transfer"],
    ["bank_transfer", "Bank Transfer"],
    ["card", "Card"],
    ["Card", "Card"],
  ] as const)("%s -> %s", (channel, expected) => {
    expect(paymentMethodFromChannel(resp(channel))).toBe(expected);
  });

  it("reads the nested authorization.channel fallback", () => {
    // Paystack has moved this field between the two locations.
    expect(
      paymentMethodFromChannel({ data: { authorization: { channel: "mpesa" } } }),
    ).toBe("Mobile Money");
  });

  it("prefers data.channel over the nested one", () => {
    expect(
      paymentMethodFromChannel({
        data: { channel: "card", authorization: { channel: "mpesa" } },
      }),
    ).toBe("Card");
  });

  it("defaults to Card rather than throwing", () => {
    // The channel is informational on an already-settled payment. Failing order
    // creation over an unfamiliar channel string would be worse than a slightly
    // wrong label.
    for (const bad of [
      undefined,
      null,
      {},
      { data: {} },
      { data: { channel: "" } },
      { data: { channel: "something_new" } },
      "not an object",
      42,
    ]) {
      expect(paymentMethodFromChannel(bad)).toBe("Card");
    }
  });

  it("mobile wins over bank when both substrings appear", () => {
    // Pins the branch order: the two replaced copies both checked mobile first.
    expect(paymentMethodFromChannel(resp("mobile_bank"))).toBe("Mobile Money");
  });

  it("does NOT recognise a hyphenated m-pesa — known gap, pinned", () => {
    // "M-PESA".toLowerCase() is "m-pesa", which does not contain the substring
    // "mpesa", so it falls through to Card. Discovered by this test asserting
    // the wrong thing first.
    //
    // Low risk in practice: Paystack's channel vocabulary is card, bank, ussd,
    // qr, mobile_money, bank_transfer, eft — "mobile_money" matches. But the
    // code checks "mpesa" explicitly, so someone clearly expected an M-Pesa-ish
    // string to arrive, and a hyphenated one would be silently mislabelled.
    //
    // Not "fixed" here: widening the match changes the payment_method recorded
    // on live orders, which is a data change, not a refactor.
    expect(paymentMethodFromChannel(resp("M-PESA"))).toBe("Card");
    expect(paymentMethodFromChannel(resp("m-pesa"))).toBe("Card");
  });

  it("maps Paystack's other real channels to Card", () => {
    // ussd, qr and eft are genuine Paystack channels with no Blink equivalent.
    for (const c of ["ussd", "qr", "eft"]) {
      expect(paymentMethodFromChannel(resp(c))).toBe("Card");
    }
  });
});
