import Ionicons from "@expo/vector-icons/Ionicons";

import { type TokenColor, useTokenColors } from "../../theme/token-colors";

/**
 * Every icon in every Blink app, except a handful of brand glyphs.
 *
 * One icon set across apps/shop and apps/rider: Ionicons, through this one
 * wrapper. This file used to hold `withIconClassName`, a Lucide helper that
 * nothing called; rider imported Lucide glyphs directly and coloured them with
 * `className`, while the shop had moved to Ionicons through its own copy of
 * this component. Two apps, two icon sets, two colouring mechanisms — so the
 * same "phone" glyph was a different drawing, at a different weight, in a
 * different colour depending on which app you were holding.
 *
 * ── Why a wrapper rather than using Ionicons directly ─────────────────────
 *
 * The two properties this buys are worth more than the indirection costs:
 *
 * 1. `name` is typed as `keyof typeof Ionicons.glyphMap`, so a glyph that does
 *    not exist is a compile error. Without it a typo renders as a blank box at
 *    runtime, on one screen, silently — the single worst failure mode of a font
 *    icon set.
 *
 * 2. Colour comes from a token role, not a hex literal, so an icon themes with
 *    everything around it. See `theme/token-colors.ts`.
 *
 * ── Why not cssInterop ────────────────────────────────────────────────────
 *
 * An Ionicon is a Text-based glyph rather than an SVG, so a className interop
 * targets something different and is untested here; its failure mode is silent
 * and total (every icon at the default size in black); and a tab bar could not
 * use it regardless, because React Navigation passes `color` as a plain prop. A
 * resolved `color` prop works everywhere.
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
  color,
}: {
  name: IconName;
  /** 20 is the dominant size; headers use 22–24, empty states 36–48. */
  size?: number;
  tone?: TokenColor;
  /**
   * A literal colour, for the rare glyph on a surface whose colour is not a
   * themed role — ink on a mode-fixed yellow card, for instance. Prefer `tone`;
   * this wins over it when both are given.
   */
  color?: string;
}) {
  const colors = useTokenColors();
  return <Ionicons name={name} size={size} color={color ?? colors[tone]} />;
}
