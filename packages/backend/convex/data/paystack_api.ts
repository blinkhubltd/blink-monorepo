import { getOptionalEnv } from "../lib/env";
import { PAYSTACK_BASE_URL } from "../lib/paystack";
import { isRecord } from "../lib/json";

/**
 * The Paystack HTTP client, shared by the verification, split and initiation
 * paths.
 *
 * Moved out of `data/payments.ts`. `PAYSTACK_BASE_URL` itself lives in
 * `lib/paystack.ts` alongside the pure request builders and the webhook
 * signature check; this module is the one place that performs `fetch`.
 */

export async function paystackRequest(
  secret: string,
  path: string,
  init?: RequestInit,
) {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      isRecord(body) && typeof body.message === "string"
        ? body.message
        : typeof body === "string"
          ? body
          : `HTTP ${res.status}`;
    console.error("[Paystack] Request failed", {
      path,
      status: res.status,
      statusText: res.statusText,
      message: msg,
    });
    throw new Error(`Paystack API error (${path}): ${msg}`);
  }
  return body;
}
export function getPaystackCurrency(secret: string): string {
  // This project is configured for Kenya. Enforce KES to avoid
  // creating charges/splits with a mismatched currency.
  const configured = getOptionalEnv("PAYSTACK_CURRENCY");
  if (configured && configured.toUpperCase().trim() !== "KES") {
    console.warn(
      "[Paystack] PAYSTACK_CURRENCY is set but will be ignored (currency is enforced to KES)",
      {
        configured,
      },
    );
  }
  void secret;
  return "KES";
}
