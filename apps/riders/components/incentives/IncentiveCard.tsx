import React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { SkeletonBox } from "@/components/ui/SkeletonBox";
import { useTheme } from "@/theme/ThemeContext";

export const IncentiveCard: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadow.card,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text
          style={{
            fontWeight: "700",
            fontSize: 15,
            color: theme.colors.text,
            letterSpacing: 0.1,
          }}
        >
          {title}
        </Text>
      </View>
      <View style={{ padding: 16 }}>{children}</View>
    </View>
  );
};

export const IncentiveSkeleton: React.FC<{
  lines?: number;
  title?: string;
}> = ({ lines = 3, title = "Loading..." }) => {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <SkeletonBox width="50%" height={14} borderRadius={6} />
      </View>
      <View style={{ padding: 16, gap: 10 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBox
            key={i}
            width={i % 3 === 0 ? "100%" : i % 3 === 1 ? "75%" : "60%"}
            height={12}
            borderRadius={6}
          />
        ))}
      </View>
    </View>
  );
};
