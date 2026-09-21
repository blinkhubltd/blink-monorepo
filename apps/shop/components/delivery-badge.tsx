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
 * ── The mark is 16px, where the Ionicon it replaced was 12px ──────────────
 *
 * This used Ionicons' `bicycle` at 12px, a stand-in from when the real rider
 * mark had no asset in this app. The real mark carries far more detail — a
 * rider, a scooter, and motion lines behind it — and at 12px that detail
 * collapses into a blob. 16px is where it resolves, and it still clears the
 * 20px pill it sits in, so the header's geometry is unchanged.
 *
 * ── Why the label is skewed rather than `italic` ──────────────────────────
 *
 * The lean is the point: it is what makes the badge read as fast. It is a
 * `skewX` transform rather than `fontStyle: "italic"` because this app loads
 * exactly four Inter faces (see app/_layout.tsx, where the per-face imports
 * are deliberate — the package barrel ships 6.2MB of fonts to use four of
 * them) and none of them is an italic. Asking for `italic` against a family
 * with no italic face is not a no-op with a predictable fallback: iOS
 * generally leaves it upright while Android fakes an oblique, so the badge
 * would lean on one platform and not the other. A transform leans by the
 * same nine degrees on both, and adds nothing to the bundle.
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
    <View className="h-[20px] gap-space-1 bg-on-brand-pill rounded-pill flex-row items-center px-[7px]">
      <BlinkRiderMark height={16} />
      <Text
        size="caption"
        weight="bold"
        numberOfLines={1}
        className="uppercase tracking-label text-[#FFFFFF]"
        // Leans right, the way the rider is travelling.
        style={{ transform: [{ skewX: "-9deg" }] }}
      >
        {minutes} minutes delivery
      </Text>
    </View>
  );
}
