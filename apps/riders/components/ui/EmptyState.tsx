import React from "react";
import { View, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/ThemeContext";

interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  action?: EmptyStateAction;
  error?: boolean;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  error = false,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 48,
        paddingHorizontal: 32,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: error
            ? theme.colors.error + "15"
            : theme.colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Ionicons
          name={icon as any}
          size={32}
          color={error ? theme.colors.error : theme.colors.textTertiary}
        />
      </View>

      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          color: theme.colors.text,
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: theme.colors.textSecondary,
          textAlign: "center",
          lineHeight: 20,
          marginBottom: action ? 24 : 0,
        }}
      >
        {subtitle}
      </Text>

      {action && (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.8}
          style={{
            backgroundColor: theme.colors.primary,
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              color: theme.buttonText.primary,
              fontWeight: "700",
              fontSize: 14,
            }}
          >
            {action.label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
