import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Text } from "@repo/mobile-ui/components/ui/text";

/**
 * The delivery screens' header: a round bordered back button, a title and a
 * line under it — "Delivery details / Order #… · assigned 14:41".
 *
 * Its own component rather than `ScreenHeader` because the design gives these
 * screens a subtitle and a bordered back control that the other pushed
 * screens (shifts, payout details) do not have.
 */
export function DetailHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-center gap-space-4 bg-background px-screen pb-space-2"
      style={{ paddingTop: insets.top + 12 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack ?? (() => router.back())}
        className="size-[40px] items-center justify-center rounded-pill border border-border bg-card active:opacity-80"
      >
        <Icon name="arrow-back" size={19} tone="strong" />
      </Pressable>
      <View className="flex-1">
        <Text
          weight="bold"
          numberOfLines={1}
          className="text-[19px] leading-[24px] tracking-h2 text-strong"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text size="sm" variant="subtle" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
