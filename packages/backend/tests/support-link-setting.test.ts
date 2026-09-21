import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The support link is a platform setting shown to every customer as a button,
 * so the server — not just the admin form — refuses a bad one.
 *
 * What counts as bad is unit-tested in `packages/lib` (`support-link.test.ts`);
 * this pins that the backend actually applies it, on write and on read.
 */

const settings = readFileSync(
  join(__dirname, "..", "convex", "data", "platform_settings.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("support_url", () => {
  it("is validated in upsert, after the super-admin check and before any write", () => {
    const upsert = settings.slice(settings.indexOf("export const upsert"));
    const gate = upsert.indexOf("assertSuperAdmin(ctx)");
    const check = upsert.indexOf("describeSupportLinkProblem(args.value)");
    const write = upsert.indexOf("ctx.db.patch");
    expect(gate).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(gate);
    expect(write).toBeGreaterThan(check);
  });

  it("is re-normalised on read, so an old unchecked row cannot reach the app", () => {
    const read = settings.slice(
      settings.indexOf("export const getSupportLink"),
    );
    expect(read).toMatch(/return normalizeSupportLink\(row\?\.value\)/);
  });
});
