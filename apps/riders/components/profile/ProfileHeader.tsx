import React from "react";
import { View, TouchableOpacity, Image } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/ThemeContext";

interface ProfileHeaderProps {
  displayName: string;
  userImage?: string | null;
  roleName?: string;
  isClearanceRider?: boolean;
  accountCompletion: number;
  onImagePress: () => void;
}

export function ProfileHeader({
  displayName,
  userImage,
  roleName,
  isClearanceRider = false,
  accountCompletion,
  onImagePress,
}: ProfileHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        padding: 24,
        borderRadius: 20,
        borderWidth: isClearanceRider ? 2 : 1,
        borderColor: isClearanceRider ? theme.colors.clearance : theme.colors.border,
        ...theme.shadow.card,
        alignItems: "center",
        gap: 16,
      }}
    >
      {/* Avatar */}
      <View style={{ position: "relative" }}>
        <TouchableOpacity onPress={onImagePress} activeOpacity={0.85}>
          {userImage ? (
            <Image
              source={{ uri: userImage }}
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                borderWidth: 2,
                borderColor: theme.colors.border,
              }}
            />
          ) : (
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: theme.colors.primary + "20",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: theme.colors.primary + "40",
              }}
            >
              <Text
                style={{
                  color: theme.colors.primary,
                  fontSize: 36,
                  fontWeight: "700",
                }}
              >
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onImagePress}
          activeOpacity={0.85}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: theme.colors.surface,
          }}
        >
          <Ionicons name="camera-outline" size={16} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Name + role */}
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text
          style={{ fontSize: 24, fontWeight: "700", color: theme.colors.text }}
        >
          {displayName}
        </Text>
        <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
          {roleName ?? "Rider"}
        </Text>

        {isClearanceRider && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.colors.clearanceLight,
              borderColor: theme.colors.clearanceBorder,
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
              marginTop: 4,
              gap: 4,
            }}
          >
            <Ionicons name="pricetag-outline" size={14} color={theme.colors.clearance} />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: theme.colors.clearance,
                textTransform: "uppercase",
              }}
            >
              Clearance Rider
            </Text>
          </View>
        )}
      </View>

      {/* Account completion bar */}
      {accountCompletion < 100 && (
        <View style={{ width: "100%", gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: theme.colors.text,
              }}
            >
              Account Completion
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: theme.colors.warning,
              }}
            >
              {accountCompletion}%
            </Text>
          </View>
          <View
            style={{
              width: "100%",
              height: 6,
              backgroundColor: theme.colors.surfaceSecondary,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${accountCompletion}%`,
                height: "100%",
                backgroundColor: theme.colors.warning,
                borderRadius: 3,
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}
