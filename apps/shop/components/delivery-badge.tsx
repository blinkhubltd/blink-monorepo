import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { BlinkRiderMark } from "./icons/blink-rider";

/**
 * The "10 minutes delivery" pill on the Home header.
 *
 * Ink pill, gold mark, white bold text — and none of those three colours vary
 * with the scheme. `bg-on-brand-pill` is reused rather than `bg-inverse`
 * deliberately: `inverse` flips to white in dark mode, which would turn an
 * ink pill into a white one — the same trap the yellow header's own icon
 * buttons were built to avoid. The text is a literal `#FFFFFF`, not a
 * semantic class, because nothing in the token set names "always white
 * regardless of scheme" and this is the one place that specific fixed colour
 * is wanted.
 *
 * ── Why the type is set in a style prop, not by className ────────────────
 *
 * The lean is a real face — Inter Bold Italic, loaded in app/_layout.tsx —
 * rather than the `skewX` transform this badge first used or NativeWind's
 * `italic` utility. A synthesised slant shears the upright glyphs; the true
 * italic redraws them, and at this size that is the difference between a
 * typeface and a squashed one.
 *
 * It is named here instead of through a `font-*` class because every font
 * slot in tailwind.config.js compiles to a `fontFamily`, `bold` included —
 * so a class would put two competing family declarations on one element and
 * let stylesheet order pick the winner. A style prop simply wins. The size
 * is set alongside it for the same reason the cart badge does: the type
 * scale stops at 11px (`caption`) and this label wants 10.
 *
 * No explicit font family: blink-ecommerce never actually applies its
 * configured fonts to any text (`font-body` resolves to `fontFamily.body:
 * undefined` there, including on this badge's nearest analogue,
 * `AddToCartBadge`) — the whole app renders in the platform system font. Our
 * own `font-sans` (Inter) is this app's equivalent stand-in for that same
 * system-font intent, so this badge just inherits it like everything else.
 * Uppercase is a deliberate departure from the old app (which has no
 * uppercase/tracked-letter-spacing precedent for this copy) — requested to
 * read more like a badge/label than a sentence.
 */
export function DeliveryBadge({ minutes = 10 }: { minutes?: number }) {
  return (
    <View className="h-[18px] bg-on-brand-pill rounded-pill flex-row items-center gap-[3px] px-[6px]">
      <BlinkRiderMark height={13} />
      <Text
        numberOfLines={1}
        className="uppercase tracking-label text-[#FFFFFF]"
        style={{
          fontFamily: "Inter_700Bold_Italic",
          fontSize: 10,
          lineHeight: 12,
        }}
      >
        {minutes} minutes delivery
      </Text>
    </View>
  );
}
