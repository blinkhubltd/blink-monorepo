/**
 * Whether this build can take a card payment at all.
 *
 * The publishable key is safe to ship — the charge is verified server-side in
 * Convex with the secret key, so a leaked publishable key cannot move money.
 * But an absent one means the payment sheet cannot open.
 *
 * The old app rendered `<PaystackProvider publicKey={key || ""}>` and only
 * discovered the problem when the customer pressed Pay, at which point it
 * showed "Configuration Error · Paystack public key is missing" — a developer's
 * message, to a shopper, at the last possible moment.
 *
 * Here the option is simply not offered. `PaystackProvider` is still mounted
 * unconditionally in the root layout, because `usePaystack()` throws without it
 * and a hook that throws on some renders and not others changes the hook count
 * between renders — which is a crash, not a fallback. The old component wrapped
 * that call in a `try/catch` IIFE, which is exactly that bug.
 */
export const PAYSTACK_PUBLIC_KEY =
  process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";

export const PAYSTACK_CURRENCY = "KES" as const;

/**
 * Card, M-Pesa and bank.
 *
 * M-Pesa is likely the majority of pay-now volume here, and it is the channel
 * the Convex webhook was specifically built for: its docstring records that STK
 * pushes routinely outrun a client-side poll, because the customer has to find
 * their phone, read the prompt and type a PIN.
 */
export const PAYSTACK_CHANNELS = ["card", "mobile_money", "bank"] as const;

export function isCardPaymentConfigured(
  key: string = PAYSTACK_PUBLIC_KEY,
): boolean {
  return key.trim().length > 0;
}
