import Svg, { Path, Rect } from "react-native-svg";

import { useTokenColors } from "../../lib/token-colors";

/**
 * Blink's rider mark — the official logo, not a stand-in.
 *
 * ── Why this replaces an Ionicon ──────────────────────────────────────────
 *
 * The delivery badge used Ionicons' `bicycle`, chosen because the real mark
 * had no asset in this app. It does now, so the badge shows the actual brand
 * rider rather than a generic bicycle.
 *
 * ── Transcribed from the flash-screen export, minus the screen ────────────
 *
 * Source: "Blink Flash Screen-01.svg", a 512x512 splash export — a black
 * backing rect with the mark centred on it in #ffc615. The rect is the splash
 * background rather than part of the logo, so it is dropped here and the
 * viewBox is cropped to the mark's own bounds; otherwise the glyph would
 * render at a third of its box with dead space all round.
 *
 * Colour comes from the token set rather than the file's literal #ffc615,
 * which is the same gold as `--color-primary` (#ffc50b) to within a rounding
 * step. Keeping it tokenised means the mark tracks the palette anywhere it
 * is placed instead of being a hardcoded hex that only happens to match.
 *
 * ── The aspect ratio is not 1:1 ───────────────────────────────────────────
 *
 * The mark is a rider with motion lines behind it — roughly 4:3 landscape. So
 * this takes a `height` and derives the width, rather than taking an Ionicon
 * style square `size` that would letterbox it.
 */

/** The mark's own bounds inside the 512x512 export. */
const VIEW_BOX = "156 180 200 149";
const ASPECT = 200 / 149;

export function BlinkRiderMark({
  height = 12,
  color,
}: {
  height?: number;
  /** Defaults to the brand gold. */
  color?: string;
}) {
  const colors = useTokenColors();
  const fill = color ?? colors.brand;

  return (
    <Svg
      width={Math.round(height * ASPECT)}
      height={height}
      viewBox={VIEW_BOX}
    >
      <Path fill={fill} d="M309.36,195.3c-2-6.62-7.31-11.32-13.07-11.65-9.36-.54-17.79,5.67-14.97,16.39,1.35,5.15,11.47,9.38,14.02,10.5,1.8.79,3.35,1.37,4.47,1.76,1.26-.79,2.53-1.58,3.79-2.37l-7.66-7.72c-1.15-3.32-.19-6.9,2.24-8.81,3.11-2.44,10.36,7.11,11.18,1.9Z" />
      <Path fill={fill} d="M284.32,206.34c-4.78-1.23-10.37,1.39-12.3,4.37-8.54,13.21-13.82,25.81-16.06,32.01-.56,1.42-2.83,7.57,0,11.28,1.3,1.71,4.45,3.9,4.57,3.77,0,0,0,0,0-.01,6.27,1.35,12.53,2.71,18.8,4.06h0l3.06,1.43c1.97.92,2.95,3.16,2.29,5.24l-6.98,21.98h10.77l11.14-31.06c.49-1.35-.12-2.85-1.4-3.49l-22.84-11.38,8.54-16.06,5.59,7.32,20.96,1.93-1.45-5.89-14.23-2.74c-3.05-12.19-4.26-21.17-10.47-22.76Z" />
      <Path fill={fill} d="M338.38,276.56l-11.68-3.15-8.74-29.37,6.81-1.32,1.01-14.63-7.62.6s-.71-1.13-1.19-2.79c-.4-1.36-.65-3.08-.23-4.83.91-3.86-2.85-5.19-4.27-5.19s-2.34.71-3.46,3.05c-1.12,2.34,2.74,4.77,4.77,4.88,1.01.05,1.63,1.17,1.99,2.27.36,1.11.46,2.2.46,2.2l-7.42,2.74.14.8.78,4.58s.19.39.46,1.3c.36,1.18.85,3.22,1.24,6.41.34,2.76.6,6.36.63,11,.1,14.12-3.76,23.47-6.6,27.94-2.85,4.47-10.17,7.93-10.17,7.93l-15.44-.51-2.11-.07-.94-.03s-4.27.31-8.94-3.36c-4.68-3.66,3.96-20.83,3.96-20.83l-39.32-.3s-.81,3.46-1.22,4.98c-.31,1.17-3.52,1.02-8.8,3.82-1.32.7-2.76,1.58-4.32,2.71-.3.21-.6.44-.9.68-8.33,6.4-11.28,19.41-11.28,19.41l17.3.14,19.91.17,14.95.12,46.31.38,3.25,7.82,6.63-3.89,30.49-17.89.98-.58-7.42-7.21ZM253.55,284.48l-5.35,5.35-1.49,1.49c-.92.92-2.18,1.45-3.49,1.45-.65,0-1.3-.13-1.89-.38-.59-.24-1.14-.6-1.6-1.07l-2.78-2.77h7.27l1.16-1.17c.11-.1.11-.27,0-.37l-1.16-1.16h-9.57c-.22,0-.4-.18-.4-.4v-2.28c0-.22.18-.4.4-.4h9.57l1.16-1.17c.11-.1.11-.27,0-.37l-1.16-1.17h-7.27l2.78-2.77c.92-.93,2.18-1.45,3.49-1.45.65,0,1.3.13,1.89.37.59.25,1.14.61,1.6,1.07l6.84,6.84c.09.09.09.25,0,.35Z" />
      <Path fill={fill} d="M231.18,258.07l29.36-.29,16.77,3.85-2.13,2.64-43.49.1s-3.15-1.83-2.64-3.56,2.13-2.74,2.13-2.74Z" />
      <Path fill={fill} d="M254.26,214.9l-31.06-.56c-1.97-.04-3.69,1.33-4.09,3.27l-3.63,17.61-.56,2.71-1.29,6.23-.56,2.71-.79,3.84c-.52,2.54,1.42,4.93,4.02,4.92l32.37-.08c1.99,0,3.69-1.45,4.02-3.41l5.53-32.45c.42-2.47-1.45-4.74-3.96-4.78ZM248.02,235.58l-7.4,7.41-2.07,2.06c-1.28,1.29-3.02,2.01-4.84,2.01-.91,0-1.8-.18-2.62-.52-.82-.34-1.58-.84-2.22-1.48l-3.85-3.85h10.07l1.61-1.61c.14-.14.14-.37,0-.52l-1.61-1.61h-13.26c-.3,0-.55-.25-.55-.56v-3.15c0-.31.25-.56.55-.56h13.26l1.61-1.61c.14-.14.14-.37,0-.52l-1.61-1.61h-10.07l3.85-3.84c1.28-1.29,3.02-2.01,4.84-2.01.91,0,1.8.18,2.62.52.82.34,1.58.85,2.22,1.49l2.07,2.06,7.4,7.41c.14.14.14.35,0,.49Z" />
      <Path fill={fill} d="M258.1,301.32l-7.38.25c.62,1.61.95,3.35.95,5.17,0,8.01-6.52,14.53-14.53,14.53s-14.53-6.51-14.53-14.53c0-1.46.22-2.87.62-4.21l-7.37.26c-.24,1.28-.36,2.6-.36,3.95,0,11.93,9.71,21.64,21.64,21.64s21.65-9.71,21.65-21.64c0-1.87-.24-3.69-.69-5.42Z" />
      <Path fill={fill} d="M346.87,287.85l-6.23,3.76c2.74,2.64,4.46,6.35,4.46,10.46,0,8.01-6.52,14.53-14.53,14.53-6.6,0-12.19-4.43-13.95-10.47l-6.22,3.76c3.14,8.08,11,13.82,20.17,13.82,11.94,0,21.65-9.71,21.65-21.64,0-5.44-2.02-10.42-5.34-14.22Z" />
      <Rect fill={fill} x={188.6} y={235.2} width={28.35} height={2.71} rx={1.35} ry={1.35} />
      <Rect fill={fill} x={206.03} y={274.7} width={28.35} height={2.71} rx={1.35} ry={1.35} />
      <Rect fill={fill} x={174.73} y={274.5} width={28.35} height={2.71} rx={1.35} ry={1.35} />
      <Rect fill={fill} x={159.79} y={286.01} width={46.54} height={2.71} rx={1.35} ry={1.35} />
      <Rect fill={fill} x={171.02} y={244.15} width={45.52} height={2.71} rx={1.35} ry={1.35} />
      <Rect fill={fill} x={160.25} y={251.26} width={45.52} height={2.71} rx={1.35} ry={1.35} />
      <Rect fill={fill} x={184.1} y={265.96} width={45.52} height={2.71} rx={1.35} ry={1.35} />
    </Svg>
  );
}
