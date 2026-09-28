import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

import { sparkHeights } from "../../lib/earnings";

/**
 * A headline number over a seven-day sparkline — the two home stat cards.
 *
 * Today is the last bar and the only yellow one, so the eye goes from the big
 * number to the bar it describes. `footnote` is omitted rather than filled
 * with a placeholder when there is nothing true to say — a new rider has no
 * "last week" to compare with.
 */
export function SparkStat({
  label,
  value,
  bars,
  footnote,
}: {
  label: string;
  value: string;
  /** Oldest first, today last. */
  bars: number[];
  footnote?: string | null;
}) {
  const heights = sparkHeights(bars);
  return (
    <View className="flex-1 gap-[10px] rounded-lg border border-border bg-card p-space-4">
      <View className="gap-[2px]">
        <Text size="label" variant="subtle">
          {label}
        </Text>
        <Text
          weight="bold"
          numberOfLines={1}
          className="text-[19px] leading-[24px] tracking-h2 text-strong"
        >
          {value}
        </Text>
      </View>
      <View
        className="h-[34px] flex-row items-end gap-space-1"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {heights.map((h, i) => (
          <View
            key={i}
            className={cn(
              "flex-1 rounded-[3px]",
              i === heights.length - 1 ? "bg-primary" : "bg-border",
            )}
            style={{ height: `${h}%` }}
          />
        ))}
      </View>
      {footnote ? (
        <Text size="label" variant="subtle" numberOfLines={1}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}
