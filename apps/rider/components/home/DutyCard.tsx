import { Pressable, View } from "react-native";
import { BlinkRiderMark } from "@repo/mobile-ui/components/ui/blink-rider-mark";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

/**
 * Online / offline — the one control a rider touches every shift.
 *
 * The whole card changes, not just the switch: yellow when online, a plain
 * card when not. At a glance, from arm's length on a handlebar mount, the
 * colour of the block is the answer to "am I taking orders?" — a small switch
 * is not.
 *
 * The yellow is `bg-primary`, which does not flip in dark mode, and so its
 * type is `primary-foreground` (ink, also fixed). The switch track is the
 * mode-fixed ink pill for the same reason: `inverse` would go white at night
 * and vanish into the yellow.
 */
export function DutyCard({
  online,
  hubName,
  onToggle,
}: {
  online: boolean;
  hubName: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <View
      className={cn(
        "flex-row items-center justify-between gap-space-4 rounded-lg border p-space-5",
        online ? "border-primary bg-primary" : "border-border bg-card",
      )}
    >
      <View className="flex-1 flex-row items-center gap-space-4">
        <View className="size-[40px] items-center justify-center rounded-pill bg-on-brand-pill">
          <BlinkRiderMark height={15} />
        </View>
        <View className="flex-1">
          <Text
            size="h4"
            weight="bold"
            className={online ? "text-primary-foreground" : "text-strong"}
          >
            {online ? "You’re online" : "You’re offline"}
          </Text>
          <Text
            size="sm"
            numberOfLines={1}
            className={online ? "text-primary-foreground" : "text-foreground"}
          >
            {online ? hubName : "Go online for orders"}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: online }}
        accessibilityLabel={online ? "Go offline" : "Go online"}
        onPress={() => onToggle(!online)}
        hitSlop={8}
        className={cn(
          "h-[32px] w-[58px] flex-row rounded-pill p-[3px]",
          online ? "justify-end bg-on-brand-pill" : "justify-start bg-input",
        )}
      >
        <View className="size-[26px] rounded-pill bg-white shadow-xs" />
      </Pressable>
    </View>
  );
}
