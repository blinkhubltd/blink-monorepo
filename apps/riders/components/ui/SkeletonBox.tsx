import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { useTheme } from "@/theme/ThemeContext";

interface SkeletonBoxProps {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBox({
  width = "100%",
  height,
  borderRadius = 8,
  style,
}: SkeletonBoxProps) {
  const theme = useTheme();
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.colors.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: theme.colors.surfaceSecondary,
            opacity: 0.8,
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
}
