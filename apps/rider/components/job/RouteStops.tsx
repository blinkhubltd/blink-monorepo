import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";

/**
 * Pick up → drop off, with the two dots and the line between them.
 *
 * The pick-up row is left out when the hub is unknown rather than printed as
 * "Pick up · —": a rider can see where they are going without it, and a
 * placeholder hub reads like an instruction.
 */
export function RouteStops({
  pickup,
  dropoff,
}: {
  pickup: string | null;
  dropoff: string;
}) {
  return (
    <View className="flex-row gap-[10px]">
      <View className="items-center pt-[4px]">
        {pickup ? (
          <>
            <View className="size-[9px] rounded-pill bg-strong" />
            <View className="w-[2px] flex-1 bg-border" />
          </>
        ) : null}
        <View className="size-[9px] rounded-pill bg-primary" />
      </View>
      <View className="flex-1 gap-space-4">
        {pickup ? (
          <View>
            <Text size="label" variant="subtle">
              Pick up
            </Text>
            <Text size="sm" weight="semibold" className="text-strong">
              {pickup}
            </Text>
          </View>
        ) : null}
        <View>
          <Text size="label" variant="subtle">
            Drop off
          </Text>
          <Text size="sm" weight="semibold" className="text-strong">
            {dropoff}
          </Text>
        </View>
      </View>
    </View>
  );
}
