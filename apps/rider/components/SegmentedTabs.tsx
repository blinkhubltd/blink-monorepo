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

/**
 * Pill-in-a-pill segmented control, per the rider design: 38px segments on an
 * ink-100 track, the active one ink with gold type.
 *
 * The ink is the mode-fixed pill rather than `inverse`, which flips to white
 * in dark mode and would leave gold type on white — 1.7:1.
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
}: SegmentedTabsProps<T>) {
  return (
    <View className="flex-row gap-space-3 rounded-pill bg-secondary p-space-1">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.value)}
            className={cn(
              "h-[38px] flex-1 items-center justify-center rounded-pill",
              active && "bg-on-brand-pill",
            )}
          >
            <Text
              size="sm"
              weight="semibold"
              className={active ? "text-primary" : "text-foreground"}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
