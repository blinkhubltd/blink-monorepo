import React from "react";
import { Card } from "@/components/ui/card";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";

type StatItem = {
  value: number;
  label: string;
  color: string;
};

type Props = {
  items?: StatItem[]; // custom items
  surfaceColor?: string;
  borderColor?: string;
  // Convenience props for common 3-stat layout (Deliveries)
  pendingCount?: number;
  inTransitCount?: number;
  deliveredCount?: number;
  colors?: {
    surface: string;
    border: string;
    textSecondary: string;
    warning: string;
    info: string;
    success: string;
  };
};

export default function StatsHeader({
  items,
  surfaceColor,
  borderColor,
  pendingCount,
  inTransitCount,
  deliveredCount,
  colors,
}: Props) {
  const resolvedItems: StatItem[] = items
    ? items
    : [
        {
          value: pendingCount || 0,
          label: "To Pickup",
          color: colors?.warning || THEME.colors.warning,
        },
        {
          value: inTransitCount || 0,
          label: "In Transit",
          color: colors?.info || THEME.colors.info || "#2563EB",
        },
        {
          value: deliveredCount || 0,
          label: "Delivered",
          color: colors?.success || THEME.colors.success,
        },
      ];

  const bg = surfaceColor ?? colors?.surface ?? THEME.colors.surface;
  const border = borderColor ?? colors?.border ?? THEME.colors.border;

  return (
    <Card
      style={{
        backgroundColor: bg,
        padding: 16,
        marginBottom: 16,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: (border || THEME.colors.border) + "40",
        ...THEME.shadow.card,
        shadowOpacity: 0.06,
      }}
    >
      <HStack
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {resolvedItems.map((it, idx) => (
          <VStack key={idx} style={{ alignItems: "center", flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: it.color,
              }}
            >
              {it.value}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: THEME.colors.textSecondary,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              {it.label}
            </Text>
          </VStack>
        ))}
      </HStack>
    </Card>
  );
}
