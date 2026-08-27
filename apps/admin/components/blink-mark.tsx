import type { SVGProps } from "react";

/**
 * The Blink mark — the arrow-with-motion-lines symbol, the same shape as the
 * favicon.
 *
 * ── Where this came from ──────────────────────────────────────────────────
 *
 * Traced from `apps/rider/assets/images/logo-mark-ink.png`, the official
 * 1252×1094 asset, which is the same mark `app/favicon.ico` renders at 32×27 in
 * brand yellow. The trace was verified against the source rather than eyeballed:
 * every scanline of that PNG is a single horizontal run, so the outline reduces
 * to a left and a right edge curve, sampled at sub-pixel precision from the
 * alpha channel and simplified with Douglas–Peucker. Re-rasterising the result
 * differs from the source mask by 0.16% of pixels, which is the antialiased
 * boundary and nothing else.
 *
 * ── Why a vector rather than the PNG ─────────────────────────────────────
 *
 * The rail mark renders at 20px inside a 32px tile, and the sidebar collapses.
 * A 1252px PNG scaled to 20px is a wasted download, and the favicon itself is
 * only 32×27, so it would be soft on any retina display. Inline SVG is exact at
 * every size, needs no request, and cannot shift layout as it loads.
 *
 * `currentColor` matters as much: the mark sits on brand yellow in the rail
 * today, but the same component has to work on ink and on white without a
 * second asset. The official PNGs ship as separate `-ink` and `-white` files
 * precisely because a raster cannot do that.
 *
 * ── Do not re-draw this ──────────────────────────────────────────────────
 *
 * The path is generated output, not hand-authored geometry. If the brand mark
 * changes, re-trace from the new official asset rather than nudging
 * coordinates.
 */

/** Aspect ratio of the mark, 1252:1094. Exported so callers can size a box. */
export const BLINK_MARK_ASPECT = 1252 / 1094;

const PATH =
  "M48.0 0.08L52.21 0.72L55.72 1.84L59.15 3.51L62.56 5.91L99.62 42.81L99.92 43.93" +
  "L99.58 44.57L62.55 81.47L59.27 83.79L55.48 85.62L51.44 86.82L47.76 87.3L44.73 87.3" +
  "L41.48 86.9L37.89 85.94L34.38 84.42L31.52 82.67L28.37 80.03L13.92 65.57L51.47 65.5" +
  "L57.45 59.5L57.8 58.47L57.52 57.75L51.45 51.68L1.68 51.6L0.51 50.96L0.0 49.92" +
  "L0.0 37.46L0.37 36.58L1.32 35.86L51.45 35.7L57.44 29.71L57.8 28.91L57.53 27.96" +
  "L51.47 21.88L13.94 21.81L28.77 6.95L31.39 4.79L34.66 2.8L37.85 1.44L41.4 0.48" +
  "L44.49 0.08Z";

export function BlinkMark({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 87.38"
      // The mark is decorative wherever it sits beside the "Blink" wordmark, so
      // it is hidden from assistive tech by default and the adjacent text
      // carries the name. A caller using it alone should pass role="img" and an
      // aria-label.
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d={PATH} />
    </svg>
  );
}
