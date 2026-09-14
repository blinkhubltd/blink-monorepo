import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * This app's icons are Ionicons, and nothing here imports Lucide.
 *
 * ── Why a test rather than just removing the dependency ───────────────────
 *
 * Removing `lucide-react-native` from apps/shop/package.json does not actually
 * prevent importing it. `.npmrc` sets `node-linker=hoisted`, and Lucide remains
 * a real dependency of apps/rider and a peerDependency of @repo/mobile-ui, so it
 * stays in the monorepo root node_modules — where Metro will happily resolve it
 * from this app. The removal is a statement of intent; this is the enforcement.
 *
 * There is also no ESLint in apps/shop (only apps/admin has a config), so there
 * is no lint rule available to do this job.
 *
 * ── What "strictly Ionicons" means precisely ──────────────────────────────
 *
 * apps/shop ships Ionicons, plus four brand SVG tab glyphs and one two-tone map
 * pin — both cases being brand or two-colour marks that a single-colour glyph
 * font cannot express.
 *
 * The monorepo still contains Lucide, in three files under packages/mobile-ui
 * (`icon.tsx`, `checkbox.tsx`, `dialog.tsx`) that exist for apps/rider. That is
 * not a violation: this app imports none of those three components, so Lucide is
 * not in its bundle at all. Touching the shared package would move risk onto
 * rider for no benefit here.
 *
 * If this app ever needs mobile-ui's dialog or checkbox, that is the moment to
 * revisit — and this test will not catch it, because it scans only this app's
 * own source. Hence the explicit note rather than silence.
 */

const APP_ROOT = join(__dirname, "..");
const SCANNED = ["app", "components", "lib", "providers"];
const EXTENSIONS = [".ts", ".tsx"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

describe("apps/shop imports no Lucide", () => {
  const files = SCANNED.flatMap((dir) => sourceFiles(join(APP_ROOT, dir)));

  it("scans a plausible number of files", () => {
    // Guards the guard: a broken walk that finds nothing would make every
    // assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(40);
  });

  it("has no reference to lucide-react-native", () => {
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes("lucide-react-native"),
    );
    expect(
      offenders.map((f) => f.slice(APP_ROOT.length + 1)),
      "these files import Lucide; use components/icon.tsx instead",
    ).toEqual([]);
  });

  it("does not declare lucide-react-native as a dependency", () => {
    const pkg = JSON.parse(
      readFileSync(join(APP_ROOT, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["lucide-react-native"]).toBeUndefined();
    expect(pkg.devDependencies?.["lucide-react-native"]).toBeUndefined();
  });
});
