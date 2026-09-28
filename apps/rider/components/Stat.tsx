import { View } from "react-native";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Text } from "@repo/mobile-ui/components/ui/text";

interface StatProps {
  label: string;
  value: string;
  unit?: string;
  /** Signed percentage change, e.g. +18. Omit when there is nothing to compare. */
  deltaPct?: number;
}

export function Stat({ label, value, unit, deltaPct }: StatProps) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <View className="gap-space-1">
      <Text variant="eyebrow" size="label">
        {label}
      </Text>
      <View className="flex-row items-baseline gap-space-2">
        <Text variant="heading" size="h2">
          {value}
        </Text>
        {unit ? (
          <Text variant="muted" size="sm">
            {unit}
          </Text>
        ) : null}
      </View>
      {deltaPct !== undefined ? (
        <View className="flex-row items-center gap-space-1">
          {up ? (
            <Icon name="trending-up" size={14} tone="success" />
          ) : (
            <Icon name="trending-down" size={14} tone="destructive" />
          )}
          <Text
            variant={up ? "success" : "destructive"}
            size="caption"
            weight="semibold"
          >
            {up ? "+" : ""}
            {deltaPct}%
          </Text>
        </View>
      ) : null}
    </View>
  );
}
