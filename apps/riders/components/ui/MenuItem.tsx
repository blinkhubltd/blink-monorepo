import React from "react";
import { TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/ThemeContext";

interface MenuItemProps {
  icon: string;
  label: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
  showBorder?: boolean;
  hideChevron?: boolean;
}

export function MenuItem({
  icon,
  label,
  subtitle,
  value,
  onPress,
  rightElement,
  danger = false,
  showBorder = true,
  hideChevron = false,
}: MenuItemProps) {
  const theme = useTheme();

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: showBorder ? 1 : 0,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: danger
            ? theme.colors.error + "15"
            : theme.colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
          flexShrink: 0,
        }}
      >
        <Ionicons
          name={icon as any}
          size={18}
          color={danger ? theme.colors.error : theme.colors.textSecondary}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "500",
            color: danger ? theme.colors.error : theme.colors.text,
          }}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontSize: 13,
              color: theme.colors.textSecondary,
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            marginRight: 8,
          }}
        >
          {value}
        </Text>
      ) : null}

      {rightElement !== undefined ? rightElement : hideChevron ? null : (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.colors.inactive}
        />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}
