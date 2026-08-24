import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Animated } from "react-native";
import { Pressable } from "@/components/ui/pressable";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import Ionicons from "@expo/vector-icons/Ionicons";

type TabItem = {
  key: string;
  label: string;
  icon?: any; // lucide icon component ref to be used by Icon
  count?: number;
};

type Colors = {
  surface: string;
  surfaceSecondary: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
};

type TabSelectorProps = {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  colors: Colors;
};

export function TabSelector({
  tabs,
  activeKey,
  onChange,
  colors,
}: TabSelectorProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const innerWidth = Math.max(0, containerWidth - 8); // padding 4 on both sides
  const segmentWidth = useMemo(
    () => (tabs.length > 0 ? innerWidth / tabs.length : 0),
    [innerWidth, tabs.length]
  );
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeKey)
  );

  const translateX = useRef(
    new Animated.Value(activeIndex * segmentWidth || 0)
  ).current;

  useEffect(() => {
    const toValue = activeIndex * segmentWidth;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      friction: 7,
      tension: 120,
    }).start();
  }, [activeIndex, segmentWidth]);

  return (
    <HStack
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.surfaceSecondary + "60",
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 14,
        padding: 4,
        borderWidth: 1,
        borderColor: colors.border + "30",
        position: "relative",
      }}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {containerWidth > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: 4,
            width: segmentWidth,
            borderRadius: 10,
            backgroundColor: colors.surface,
            transform: [{ translateX }],
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        />
      )}

      {tabs.map((tab, index) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 10,
              backgroundColor: "transparent",
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <HStack
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              space="xs"
            >
              {tab.icon ? (
                typeof tab.icon === "string" ? (
                  <Ionicons
                    name={tab.icon as any}
                    size={18}
                    color={isActive ? colors.primary : colors.textSecondary}
                  />
                ) : (
                  <Icon
                    as={tab.icon}
                    size={18}
                    color={isActive ? colors.primary : colors.textSecondary}
                  />
                )
              ) : null}
              <HStack
                style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    marginRight: tab.count != null ? 4 : 0,
                    color: isActive ? colors.text : colors.textSecondary,
                  }}
                >
                  {tab.label}
                </Text>
                {tab.count != null && (
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: isActive ? colors.primary : colors.textSecondary,
                    }}
                  >
                    {tab.count}
                  </Text>
                )}
              </HStack>
            </HStack>
          </Pressable>
        );
      })}
    </HStack>
  );
}

export default TabSelector;
