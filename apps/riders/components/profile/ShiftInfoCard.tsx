import React from "react";
import { View, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/ThemeContext";

interface TodaySchedule {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface ShiftInfoCardProps {
  todaySchedule?: TodaySchedule | null;
  shiftMessage?: string;
  onPress: () => void;
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function ShiftInfoCard({
  todaySchedule,
  shiftMessage,
  onPress,
}: ShiftInfoCardProps) {
  const theme = useTheme();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          padding: 20,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...theme.shadow.card,
          gap: 12,
        }}
      >
        {/* Header row */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: theme.colors.primary + "20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="calendar-outline" size={24} color={theme.colors.primary} />
            </View>
            <View>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: theme.colors.text,
                }}
              >
                My Shifts
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  marginTop: 2,
                }}
              >
                View your weekly schedule
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
        </View>

        {/* Today's shift info */}
        {todaySchedule?.enabled ? (
          <View
            style={{
              backgroundColor: theme.colors.surfaceSecondary,
              padding: 12,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="time-outline" size={16} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: theme.colors.primary,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {shiftMessage || "Today's Shift"}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginTop: 2,
                }}
              >
                {formatTime(todaySchedule.startTime)} – {formatTime(todaySchedule.endTime)}
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: theme.colors.surfaceSecondary,
              padding: 12,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: theme.colors.textSecondary,
                fontWeight: "500",
              }}
            >
              No shift scheduled for today
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
