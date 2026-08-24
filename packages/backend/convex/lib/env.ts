/**
 * Deployment environment variable access.
 *
 * `requireEnv` throws on a missing or blank value; `getOptionalEnv` returns
 * `undefined`. Both trim, so a variable set to whitespace counts as unset —
 * which is the common shape of a misconfigured dashboard entry.
 */

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || !String(val).trim()) throw new Error(`Missing env var: ${name}`);
  return String(val).trim();
}
export function getOptionalEnv(name: string): string | undefined {
  const val = process.env[name];
  const trimmed =
    typeof val === "string" ? val.trim() : String(val ?? "").trim();
  return trimmed ? trimmed : undefined;
}
