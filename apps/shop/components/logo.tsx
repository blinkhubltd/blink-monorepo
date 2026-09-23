import { Image } from "react-native";

/**
 * The real Blink wordmark, not a text lockup.
 *
 * Three artworks from the Blink Hub design system, picked by the surface the
 * mark sits on — the DS's own `Logo` takes the same `tone` prop for the same
 * reason, and its handoff is explicit that the wordmark is never re-typeset,
 * only ever placed:
 *
 *   onbrand — black wordmark, WHITE arrow. For the yellow header band.
 *   ink     — black wordmark, YELLOW arrow. For white and grey surfaces.
 *   white   — white wordmark, yellow arrow. For photography and ink surfaces.
 *
 * All three share the 3.806:1 aspect ratio, so a given `height` produces the
 * same shape whichever tone is asked for — the handoff's own size hints agree
 * (130×34 for ink, 107×28 for white).
 *
 * The `require`s are static and collected in a map on purpose: Metro resolves
 * them at bundle time, so a computed `require(path)` does not work in React
 * Native. A map is how you get a runtime choice between bundled images.
 */
const ASPECT_RATIO = 3.806;

const ARTWORK = {
  onbrand: require("../assets/images/logo-blink-onbrand.png"),
  ink: require("../assets/images/logo-blink-ink.png"),
  white: require("../assets/images/logo-blink-white.png"),
} as const;

export type LogoTone = keyof typeof ARTWORK;

export function Logo({
  height = 20,
  tone = "onbrand",
}: {
  height?: number;
  tone?: LogoTone;
}) {
  return (
    <Image
      source={ARTWORK[tone]}
      style={{ height, width: height * ASPECT_RATIO }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Blink"
    />
  );
}
