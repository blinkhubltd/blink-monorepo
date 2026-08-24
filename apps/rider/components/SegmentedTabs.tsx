import { Pressable, View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

export interface SegmentedTabItem<T extends string> {
  value: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  items: readonly SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Pill-in-a-pill segmented control, per the DS. */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
}: SegmentedTabsProps<T>) {
  return (
    <View className="flex-row rounded-pill bg-secondary p-space-1">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.value)}
            className={cn(
              "flex-1 items-center justify-center rounded-pill py-space-2",
              active && "bg-inverse",
            )}
          >
            <Text
              size="label"
              weight="semibold"
              variant={active ? "onInverse" : "muted"}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
