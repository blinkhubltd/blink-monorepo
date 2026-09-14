import Svg, { Circle, Path } from "react-native-svg";

import { useTokenColors } from "../../lib/token-colors";

/**
 * The marker at the centre of the location picker's map.
 *
 * ── Why this is not an Ionicon ────────────────────────────────────────────
 *
 * Everything else in this app is Ionicons, deliberately. This one cannot be:
 * it is two-tone — a brand-yellow body with a dark outline — and Ionicons is a
 * single-colour glyph font, so `location` can be yellow OR dark but not both.
 *
 * That matters more here than anywhere else an icon appears. This pin sits on
 * top of arbitrary map tiles: roads, water, parkland, satellite imagery, light
 * and dark. A flat single-colour marker disappears against whichever tile
 * happens to match it, and a customer who cannot see the pin cannot tell where
 * their delivery is going. The fill carries the brand; the outline is what keeps
 * it legible against every possible background.
 *
 * The geometry is a plain 24x24 pin so `size` scales it the way an Ionicon's
 * `size` does, and the caller does not have to care which kind of icon this is.
 * react-native-svg is already a dependency (react-native-qrcode-svg rides on
 * it), so this adds nothing to the bundle.
 *
 * Keep components/location-picker.web.tsx in step — it renders the same control
 * on web and should show the same marker.
 */
export function MapPinMarker({ size = 40 }: { size?: number }) {
  const colors = useTokenColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"
        fill={colors.brand}
        stroke={colors.strong}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={3} fill={colors.strong} />
    </Svg>
  );
}
