import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";

/** A small grey fact — "7 items", "3.4 km away", "Drop by 14:58". */
export function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-pill bg-secondary px-[10px] py-[5px]">
      <Text size="label" weight="semibold" className="text-foreground">
        {label}
      </Text>
    </View>
  );
}
