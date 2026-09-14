import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon } from "./icon";

/**
 * The "10 minutes delivery" pill on the Home header.
 *
 * Ink pill, gold icon, white bold text — and none of those three colours vary
 * with the scheme. `bg-on-brand-pill` is reused rather than `bg-inverse`
 * deliberately: `inverse` flips to white in dark mode, which would turn an
 * ink pill into a white one — the same trap the yellow header's own icon
 * buttons were built to avoid. The text is a literal `#FFFFFF`, not a
 * semantic class, because nothing in the token set names "always white
 * regardless of scheme" and this is the one place that specific fixed colour
 * is wanted. `bicycle` stands in for the design's own custom "rider" glyph,
 * which has no Ionicons equivalent and no asset in this app; it is already
 * this app's icon for a delivery rider elsewhere (order tracking,
 * notifications), so it stays the one vocabulary rather than introducing a
 * second glyph for the same idea.
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
      <Icon name="bicycle" size={12} tone="brand" />
      <Text
        size="caption"
        weight="bold"
        numberOfLines={1}
        className="uppercase tracking-label text-[#FFFFFF]"
      >
        {minutes} minutes delivery
      </Text>
    </View>
  );
}
