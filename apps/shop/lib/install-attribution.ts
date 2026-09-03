/**
 * Android install attribution, from Google Play's own Install Referrer API.
 *
 * ── What "own" buys, and what it does not ──────────────────────────────
 *
 * `incrementInstallCount` used to be a public mutation crediting an agent's
 * balance from a bare client-supplied code — anyone could call it in a loop.
 * The fix that closed it (see `data/marketing.ts`) was not cryptography; it was
 * requiring a real authenticated account and crediting at most once per account
 * ever. Those two properties are what make `attributeMyInstall` safe, and this
 * module's job is only to prepare its input honestly.
 *
 * The referrer string itself is still exactly what it always was: text the
 * device reports, not a signed claim. The Play Install Referrer API does not
 * cryptographically prove anything to the server — Google's own docs are clear
 * that it is "reasonably trustworthy," not tamper-proof. What it genuinely adds
 * over a hand-typed code is cost: producing a specific referrer value requires
 * actually installing the app through a Play Store link carrying it, once per
 * device — not typing a string. Combined with one-credit-per-account, that
 * raises the bar from "guess a code" to "install once per account you are
 * willing to burn," which is the same order of friction a real install-based
 * incentive is supposed to have.
 *
 * A cryptographically verified version of this exists — Google's Play
 * Integrity API, combined with install referrer — and is a materially bigger
 * integration. Not built here; this is the honest middle ground between that
 * and the hole that was closed.
 */

/** The value put on the Play Store link's `referrer` query param. */
export function playStoreReferrerParam(agentCode: string): string {
  return `blink_ref=${encodeURIComponent(agentCode.trim())}`;
}

/**
 * Recover the agent code from what the Install Referrer API reported.
 *
 * The raw `installReferrer` string is itself URL-query-encoded (Google passes
 * through whatever followed `?referrer=` on the Play Store link, decoded once
 * already by the OS) — so this parses it as a query string rather than
 * assuming the whole value is the code, which would break the moment anything
 * else (a UTM parameter, an ad network's own tracking) shares the referrer.
 *
 * Returns `null` for anything that does not look like Blink's own referrer
 * shape: no `installReferrer` at all (an organic install, or one from a source
 * that set no referrer), a referrer with no `blink_ref` key (some other
 * campaign's link), or a value that fails the same shape check `/referral`
 * itself applies before ever calling the mutation.
 */
export function parseAgentCodeFromReferrer(
  installReferrer: string | null | undefined,
): string | null {
  if (!installReferrer) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(installReferrer);
  } catch {
    return null;
  }

  const code = params.get("blink_ref")?.trim();
  if (!code) return null;
  // Same bound `/referral`'s own field enforces (maxLength={32}) — a longer
  // value did not come from a link this app generated.
  if (code.length === 0 || code.length > 32) return null;
  return code;
}
