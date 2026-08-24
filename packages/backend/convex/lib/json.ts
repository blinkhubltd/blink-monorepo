/**
 * Safe navigation of untyped JSON, for reading third-party API responses.
 *
 * Moved out of `data/payments.ts`, which reached 2593 lines. These are used by
 * the Paystack verification, split and finalisation paths, which is why they
 * belong somewhere all three can import rather than being private to one module.
 */

export type JsonRecord = Record<string, unknown>;
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}
export function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}
export function getNestedString(value: unknown, path: string[]): string | undefined {
  const nested = getNestedValue(value, path);
  return typeof nested === "string" && nested.trim() ? nested : undefined;
}
