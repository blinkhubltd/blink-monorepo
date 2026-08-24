import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import type { ChartModel } from "../lib/incentives";

interface BarChartProps extends ChartModel {
  /** Plot height in px. The DS prototype uses 120. */
  height?: number;
}

/**
 * Bars plus a dashed plan line. Deliberately plain views rather than
 * react-native-chart-kit: chart-kit needs react-native-svg, cannot be themed
 * from className, and this is six rectangles.
 */
export function BarChart({ bars, targetLinePct, height = 120 }: BarChartProps) {
  return (
    <View>
      <View className="relative flex-row items-end gap-space-3" style={{ height }}>
        {/* The plan line. Dashed via a repeating hairline row, since RN has no
            border-style: dashed on Android. */}
        <View
          className="absolute left-0 right-0 flex-row overflow-hidden"
          style={{ bottom: `${targetLinePct}%` }}
          pointerEvents="none"
        >
          {Array.from({ length: 40 }).map((_, i) => (
            <View key={i} className="h-[2px] flex-1 bg-ink-400 opacity-70" style={{ marginRight: 3 }} />
          ))}
        </View>
        {bars.map((bar) => (
          <View key={bar.label} className="flex-1 items-center justify-end">
            <View
              className="w-full max-w-[22px] rounded-t-sm bg-primary"
              style={{ height: `${bar.heightPct}%` }}
              accessibilityLabel={`${bar.label}: ${bar.value}`}
            />
          </View>
        ))}
      </View>
      <View className="mt-space-2 flex-row gap-space-3">
        {bars.map((bar) => (
          <Text
            key={bar.label}
            size="caption"
            variant="subtle"
            className="flex-1 text-center"
          >
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
