import React, { useState, useMemo } from "react";
import { View, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Heading } from "@/components/ui/heading";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";
import { api } from "@repo/backend";
import { useUserData } from "@/providers/DataProvider";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type DaySchedule = {
  startTime: string;
  endTime: string;
  enabled: boolean;
};

function getCurrentDayName(): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[new Date().getDay()];
}

function formatTime(time: string): string {
  // Convert 24-hour format to 12-hour format
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function calculateDuration(startTime: string, endTime: string): string {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;
  const durationMinutes = endTotal - startTotal;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export default function ShiftScreen() {
  const router = useRouter();
  const { currentUser } = useUserData();
  const userId = currentUser?._id;

  // Get user's schedule (works for both riders and pickers)
  const schedule = useQuery(
    api.data.shift_utils.getUserShiftStatus,
    userId ? { userId: userId } : "skip",
  );

  const currentDay = getCurrentDayName();
  const weeklySchedule = schedule?.schedule?.weeklySchedule;

  // Calculate total weekly hours
  const totalWeeklyHours = useMemo(() => {
    if (!weeklySchedule) return "0h";
    let totalMinutes = 0;
    DAYS_OF_WEEK.forEach((day) => {
      const daySchedule = weeklySchedule[day];
      if (daySchedule?.enabled) {
        const [startHours, startMinutes] = daySchedule.startTime
          .split(":")
          .map(Number);
        const [endHours, endMinutes] = daySchedule.endTime
          .split(":")
          .map(Number);
        const startTotal = startHours * 60 + startMinutes;
        const endTotal = endHours * 60 + endMinutes;
        totalMinutes += endTotal - startTotal;
      }
    });
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }, [weeklySchedule]);

  // Get today's shift info
  const todaySchedule =
    weeklySchedule?.[currentDay as keyof typeof weeklySchedule];

  const DayCard = ({
    day,
    daySchedule,
  }: {
    day: string;
    daySchedule?: DaySchedule;
  }) => {
    const isToday = day === currentDay;
    const isEnabled = daySchedule?.enabled;

    return (
      <Card
        style={{
          backgroundColor: THEME.colors.surface,
          borderRadius: 16,
          padding: 16,
          borderWidth: isToday ? 1.5 : 1,
          borderColor: isToday ? THEME.colors.primary : THEME.colors.border,
          ...THEME.shadow.card,
        }}
      >
        <VStack style={{ gap: 12 }}>
          {/* Day Header */}
          <HStack
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <HStack
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: isToday ? THEME.colors.primary : THEME.colors.text,
                }}
              >
                {day}
              </Text>
              {isToday && (
                <View
                  style={{
                    backgroundColor: THEME.colors.primary,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: THEME.buttonText.primary,
                    }}
                  >
                    TODAY
                  </Text>
                </View>
              )}
            </HStack>
            <Ionicons
              name={isEnabled ? "checkmark-circle-outline" : "close-circle-outline"}
              size={20}
              color={isEnabled ? THEME.colors.success : THEME.colors.textSecondary}
            />
          </HStack>

          {/* Shift Details */}
          {isEnabled && daySchedule ? (
            <VStack style={{ gap: 8 }}>
              <HStack
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: isToday
                    ? THEME.colors.primary + "20"
                    : THEME.colors.surfaceSecondary,
                  padding: 12,
                  borderRadius: 12,
                }}
              >
                <Ionicons name="time-outline" size={16} color={isToday ? THEME.colors.primary : THEME.colors.textSecondary} />
                <VStack style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: THEME.colors.text,
                    }}
                  >
                    {formatTime(daySchedule.startTime)} -{" "}
                    {formatTime(daySchedule.endTime)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: THEME.colors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    {calculateDuration(
                      daySchedule.startTime,
                      daySchedule.endTime,
                    )}{" "}
                    shift
                  </Text>
                </VStack>
              </HStack>
            </VStack>
          ) : (
            <View
              style={{
                backgroundColor: THEME.colors.surfaceSecondary,
                padding: 12,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: THEME.colors.textSecondary,
                  fontWeight: "500",
                }}
              >
                Day Off
              </Text>
            </View>
          )}
        </VStack>
      </Card>
    );
  };

  if (!schedule) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: THEME.colors.background }}
      >
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: THEME.colors.primary + "15",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="time-outline" size={28} color={THEME.colors.primary} />
          </View>
          <ActivityIndicator size="small" color={THEME.colors.primary} />
          <Text style={{ color: THEME.colors.textSecondary, fontSize: 14 }}>
            Loading your schedule...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: THEME.colors.background,
        marginTop: 20,
      }}
    >
      {/* Header */}
      <View
        style={{
          backgroundColor: THEME.colors.surfaceSecondary,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 20,
          borderBottomWidth: 1,
          borderBottomColor: THEME.colors.border,
        }}
      >
        <HStack
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: THEME.colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back-outline" size={20} color={THEME.colors.text} />
          </TouchableOpacity>
          <Heading
            style={{
              fontSize: 24,
              fontWeight: "700",
              color: THEME.colors.text,
              flex: 1,
              textAlign: "center",
              marginRight: 40,
            }}
          >
            My Shifts
          </Heading>
        </HStack>

        {/* Current Status Card */}
        {todaySchedule?.enabled ? (
          <Card
            style={{
              backgroundColor: THEME.colors.primary + "20",
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: THEME.colors.primary + "40",
            }}
          >
            <HStack
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: THEME.colors.primary + "30",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="time-outline" size={24} color={THEME.colors.primary} />
              </View>
              <VStack style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: THEME.colors.primary,
                    fontWeight: "600",
                    textTransform: "uppercase",
                    marginBottom: 2,
                  }}
                >
                  {schedule.message}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: THEME.colors.text,
                  }}
                >
                  {formatTime(todaySchedule.startTime)} -{" "}
                  {formatTime(todaySchedule.endTime)}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: THEME.colors.textSecondary,
                    marginTop: 2,
                  }}
                >
                  {calculateDuration(
                    todaySchedule.startTime,
                    todaySchedule.endTime,
                  )}{" "}
                  shift today
                </Text>
              </VStack>
            </HStack>
          </Card>
        ) : (
          <Card
            style={{
              backgroundColor: THEME.colors.surface,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: THEME.colors.border,
            }}
          >
            <HStack
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: THEME.colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="alert-circle-outline" size={24} color={THEME.colors.textSecondary} />
              </View>
              <VStack style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: THEME.colors.text,
                    marginBottom: 2,
                  }}
                >
                  No Shift Today
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: THEME.colors.textSecondary,
                  }}
                >
                  Enjoy your day off!
                </Text>
              </VStack>
            </HStack>
          </Card>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <VStack style={{ paddingHorizontal: 20, paddingTop: 24, gap: 24 }}>
          {/* Weekly Summary */}
          <Card
            style={{
              backgroundColor: THEME.colors.surface,
              borderRadius: 16,
              padding: 20,
              borderWidth: 1,
              borderColor: THEME.colors.border,
              ...THEME.shadow.card,
            }}
          >
            <HStack
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <HStack
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: THEME.colors.primary + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="calendar-outline" size={20} color={THEME.colors.primary} />
                </View>
                <VStack>
                  <Text
                    style={{
                      fontSize: 12,
                      color: THEME.colors.textSecondary,
                      fontWeight: "500",
                    }}
                  >
                    Total Weekly Hours
                  </Text>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: "700",
                      color: THEME.colors.text,
                    }}
                  >
                    {totalWeeklyHours}
                  </Text>
                </VStack>
              </HStack>
            </HStack>
          </Card>

          {/* Weekly Schedule Header */}
          <VStack style={{ gap: 12 }}>
            <HStack
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: THEME.colors.text,
                }}
              >
                Weekly Schedule
              </Text>
              {!weeklySchedule && (
                <View
                  style={{
                    backgroundColor: THEME.colors.warning + "15",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: THEME.colors.warning,
                    }}
                  >
                    NO SCHEDULE
                  </Text>
                </View>
              )}
            </HStack>

            {!weeklySchedule ? (
              <Card
                style={{
                  backgroundColor: THEME.colors.surface,
                  borderRadius: 16,
                  padding: 24,
                  borderWidth: 1,
                  borderColor: THEME.colors.border,
                  alignItems: "center",
                }}
              >
                <Ionicons name="alert-circle-outline" size={48} color={THEME.colors.textSecondary} />
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: THEME.colors.text,
                    marginTop: 12,
                  }}
                >
                  This is not your shift
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: THEME.colors.textSecondary,
                    marginTop: 4,
                    textAlign: "center",
                  }}
                >
                  Please contact your manager for schedule details.
                </Text>
              </Card>
            ) : (
              <VStack style={{ gap: 12 }}>
                {DAYS_OF_WEEK.map((day) => (
                  <DayCard
                    key={day}
                    day={day}
                    daySchedule={weeklySchedule[day]}
                  />
                ))}
              </VStack>
            )}
          </VStack>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
