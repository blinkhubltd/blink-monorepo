import { ConvexError } from "convex/values";

/**
 * Re-exported, not reimplemented.
 *
 * `cn` lives in @repo/ui because every primitive there needs it. The app keeps
 * importing it from here alongside formatKES and getConvexErrorMessage, so the
 * 58 existing call sites do not have to split their imports by symbol — but
 * there is one implementation, in the package that owns the class merging.
 */
export { cn } from "@repo/ui/lib/utils";

export function formatKES(amount: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Extracts a user-friendly error message from a Convex mutation/action error.
 * When the backend throws `new ConvexError("...")`, the message is in `error.data`.
 * Falls back to `fallback` for any other error type.
 */
export function getConvexErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ConvexError) {
    const { data } = error;
    if (typeof data === "string" && data.trim().length > 0) return data;
    if (typeof data === "object" && data !== null && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  return fallback;
}
