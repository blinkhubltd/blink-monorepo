import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon } from "./icon";

/**
 * The "10 minutes delivery" pill on the Home header.
 *
 * Ink pill, gold icon, white bold uppercase text — and none of those three
 * colours vary with the scheme. `bg-on-brand-pill` is reused rather than
 * `bg-inverse` deliberately: `inverse` flips to white in dark mode, which
 * would turn an ink pill into a white one — the same trap the yellow
 * header's own icon buttons were built to avoid. The text is a literal
 * `#FFFFFF`, not a semantic class, because nothing in the token set names
 * "always white regardless of scheme" and this is the one place that
 * specific fixed colour is wanted. `bicycle` stands in for the design's own
 * custom "rider" glyph, which has no Ionicons equivalent and no asset in
 * this app; it is already this app's icon for a delivery rider elsewhere
 * (order tracking, notifications), so it stays the one vocabulary rather
 * than introducing a second glyph for the same idea.
 */
export function DeliveryBadge({ minutes = 10 }: { minutes?: number }) {
  return (
    <View className="h-[30px] gap-space-2 bg-on-brand-pill rounded-pill flex-row items-center px-[11px]">
      <Icon name="bicycle" size={17} tone="brand" />
      <Text
        size="caption"
        weight="bold"
        className="uppercase tracking-label text-[#FFFFFF]"
      >
        {minutes} minutes delivery
      </Text>
    </View>
  );
}
