import Ionicons from "@expo/vector-icons/Ionicons";

import { type TokenColor, useTokenColors } from "../lib/token-colors";

/**
 * Every icon in this app, except four brand glyphs and one map pin.
 *
 * ── Why a wrapper rather than using Ionicons directly ─────────────────────
 *
 * The two properties this buys are worth more than the indirection costs:
 *
 * 1. `name` is typed as `keyof typeof Ionicons.glyphMap`, so a glyph that does
 *    not exist is a compile error. Without it a typo renders as a blank box at
 *    runtime, on one screen, silently — the single worst failure mode of a font
 *    icon set, and the reason the migration off Lucide could otherwise have left
 *    invisible holes across 31 files.
 *
 * 2. Colour comes from a token role, not a hex literal. The app previously held
 *    99 hardcoded hexes, all light-mode values, which is why dark mode was
 *    broken for every icon: the classes flipped and the `color` props did not.
 *    See lib/token-colors.ts.
 *
 * ── Why not cssInterop ────────────────────────────────────────────────────
 *
 * packages/mobile-ui has `withIconClassName`, a cssInterop that lets `className`
 * drive a Lucide icon's colour and size. It looks like the obvious thing to
 * copy, and it is not used here for three reasons: an Ionicon is a Text-based
 * glyph rather than an SVG, so the interop target differs and is untested in
 * this repo; its failure mode is silent and total (every icon rendering at the
 * default size in black); and the tab bar could not use it regardless, because
 * React Navigation passes `color` as a plain prop. A resolved `color` prop works
 * everywhere, and if the interop route is ever wanted this is the one file that
 * changes rather than thirty-one.
 *
 * Note that Ionicons has no `strokeWidth` and no `fill`. Filled-ness is a
 * different glyph NAME — `heart` against `heart-outline` — so a toggle swaps the
 * name, never a prop.
 */
export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({
  name,
  size = 20,
  tone = "body",
}: {
  name: IconName;
  /** 20 is this app's dominant size; headers use 22–24, empty states 36–48. */
  size?: number;
  tone?: TokenColor;
}) {
  const colors = useTokenColors();
  return <Ionicons name={name} size={size} color={colors[tone]} />;
}
