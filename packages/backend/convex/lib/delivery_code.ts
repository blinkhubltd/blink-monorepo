/**
 * Six-digit delivery verification codes.
 *
 * Moved from `hooks/index.ts`. Note this is NOT dead code: `data/orders.ts`
 * imports it when creating an order, and `orders.delivery_code` plus the
 * `by_delivery_code_verified` index back the rider app's code-entry sheet. An
 * earlier audit recorded it as unimported, which was wrong.
 *
 * The rejection list excludes codes a customer would misread or misreport when
 * reading them out to a rider — all-identical digits and simple sequences.
 *
 * Known limitation, deliberately left as-is: `Math.random()` is not
 * cryptographically secure. For a code read aloud and verified server-side
 * against one specific order, guessing is bounded by the order lookup rather
 * than by entropy. `crypto.getRandomValues` would be strictly better and is a
 * small change, but it alters generated values, so it belongs in its own commit.
 */

const MIN_CODE = 100_000;
const MAX_CODE = 999_999;

/**
 * All six characters identical.
 *
 * Written as a scan rather than the backreference regex the original used
 * (`^(\d)\1{5}$`). Same behaviour, and it cannot be silently broken by an
 * escaping mistake — which is exactly what happened while moving this file: the
 * backreference was dropped, leaving a pattern that matched nothing and quietly
 * disabled the check.
 */
function isAllSameDigit(code: string): boolean {
  return code.split("").every((c) => c === code[0]);
}

const SEQUENTIAL_CODES = new Set(["123456", "654321", "000000"]);

function isWeakCode(code: string): boolean {
  return isAllSameDigit(code) || SEQUENTIAL_CODES.has(code);
}

export function generateDeliveryCode(): string {
  let code: string;
  do {
    code = String(
      Math.floor(Math.random() * (MAX_CODE - MIN_CODE + 1)) + MIN_CODE,
    );
  } while (isWeakCode(code));
  return code;
}

/** Exported for tests — the rejection rule is the part worth pinning. */
export const __testing = { isWeakCode, isAllSameDigit };
