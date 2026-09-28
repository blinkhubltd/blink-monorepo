import { Linking, Platform, Pressable, View } from "react-native";
import { Icon } from "@repo/mobile-ui/components/ui/icon";

/**
 * Call and message the customer — the two round buttons on the customer card.
 *
 * Both hand off to the phone's own dialer and messaging app. There is no
 * in-app chat, and inventing one here would mean the rider's messages living
 * somewhere the customer never looks. An SMS reaches the same phone the rider
 * would otherwise ring.
 *
 * Nothing renders without a number: a disabled call button at a locked gate is
 * a button that promises help and gives none.
 */
export function ContactButtons({
  phone,
  name,
}: {
  phone: string | null;
  name: string;
}) {
  if (!phone) return null;
  const digits = phone.replace(/\s/g, "");

  return (
    <View className="flex-row gap-space-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Call ${name}`}
        onPress={() => {
          // `telprompt` on iOS confirms before dialling, so a stray tap on a
          // bumpy ride does not ring the customer.
          const scheme = Platform.OS === "ios" ? "telprompt" : "tel";
          void Linking.openURL(`${scheme}:${digits}`);
        }}
        className="size-[42px] items-center justify-center rounded-pill bg-on-brand-pill active:scale-[0.96]"
      >
        <Icon name="call" size={18} tone="brand" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Message ${name}`}
        onPress={() => void Linking.openURL(`sms:${digits}`)}
        className="size-[42px] items-center justify-center rounded-pill border border-border bg-card active:scale-[0.96]"
      >
        <Icon name="chatbubble-outline" size={18} tone="strong" />
      </Pressable>
    </View>
  );
}
