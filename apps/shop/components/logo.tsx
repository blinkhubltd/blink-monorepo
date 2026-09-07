import { Image } from "react-native";

/**
 * The real Blink wordmark, not a text lockup.
 *
 * `assets/images/logo-blink-onbrand.png` is the "onbrand" variant from the
 * Blink Hub design system — black wordmark, white arrow, drawn for a yellow
 * surface. Aspect ratio 3.806:1, sized off `height` the same way the source
 * design system's own `Logo` component does, so a given `height` always
 * produces the same shape rather than an independently guessed width.
 */
const ASPECT_RATIO = 3.806;

export function Logo({ height = 30 }: { height?: number }) {
  return (
    <Image
      source={require("../assets/images/logo-blink-onbrand.png")}
      style={{ height, width: height * ASPECT_RATIO }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Blink"
    />
  );
}
