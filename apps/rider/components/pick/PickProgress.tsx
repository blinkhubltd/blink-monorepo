import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from "react-native-reanimated";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

interface PickProgressProps {
  unitsPicked: number;
  unitsTotal: number;
  itemsPicked: number;
  itemsTotal: number;
}

/**
 * Order-level progress, pinned under the header.
 *
 * Measured in UNITS, with line items as the secondary figure. An order of one
 * loaf and twelve eggs is not half picked when the loaf is in the bag, and the
 * old app's item-based bar said it was — which is exactly the number a picker
 * uses to judge how much is left.
 */
export function PickProgress({
  unitsPicked,
  unitsTotal,
  itemsPicked,
  itemsTotal,
}: PickProgressProps) {
  const total = Math.max(1, unitsTotal);
  const picked = Math.max(0, Math.min(total, unitsPicked));
  const complete = picked >= total;

  const pct = useDerivedValue(() =>
    withSpring((picked / total) * 100, { damping: 22, stiffness: 170 }),
  );
  const fill = useAnimatedStyle(() => ({ width: `${pct.value}%` }));

  return (
    <View className="gap-space-3 bg-background px-screen pb-space-4">
      <View className="flex-row items-end justify-between">
        <View className="flex-row items-baseline gap-space-2">
          <Text variant="heading" size="h2">
            {picked}
          </Text>
          <Text variant="muted" size="sm" weight="medium">
            of {total} units
          </Text>
        </View>
        <Text variant={complete ? "success" : "muted"} size="label" weight="semibold">
          {itemsPicked}/{itemsTotal} items
        </Text>
      </View>

      <View className="h-space-3 overflow-hidden rounded-pill bg-secondary">
        <Animated.View
          style={fill}
          className={cn(
            "h-full rounded-pill",
            complete ? "bg-success" : "bg-primary",
          )}
        />
      </View>
    </View>
  );
}
