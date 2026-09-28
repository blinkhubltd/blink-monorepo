import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * This app's icons are Ionicons, and nothing here imports Lucide.
 *
 * ── Why a test rather than just removing the dependency ───────────────────
 *
 * Removing `lucide-react-native` from apps/shop/package.json does not by
 * itself prevent importing it: `.npmrc` sets `node-linker=hoisted`, so any
 * package another workspace re-adds lands in the root node_modules, where
 * Metro will happily resolve it from this app. The removal is a statement of
 * intent; this is the enforcement.
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
 * The shared icon (`@repo/mobile-ui/components/ui/icon`) is Ionicons too, and
 * packages/mobile-ui and apps/rider carry their own copy of this guard, so
 * nothing this app pulls in from the shared package brings Lucide back.
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
