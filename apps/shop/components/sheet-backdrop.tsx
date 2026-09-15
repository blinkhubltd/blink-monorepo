import { Pressable } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";

/**
 * A dim backdrop for a `@gorhom/bottom-sheet`, for the contrast a sheet needs
 * against the screen behind it — without looking like the dimming itself is
 * rising up together with the sheet.
 *
 * Gorhom's own `BottomSheetBackdrop` interpolates opacity linearly across the
 * sheet's *entire* open/close range (`animatedIndex` from -1 to 0), so the
 * scrim visibly darkens in lockstep with the sheet the whole way up — that
 * was the "rises together" look this replaces. Here the same `animatedIndex`
 * drives the interpolation, but over a much shorter leading slice of it
 * (`-1` to `-0.85`), so the backdrop reaches full opacity almost immediately
 * once the sheet starts moving and then just sits there, dark, while the
 * sheet does the rest of its rise on its own.
 */
export function SheetBackdrop({
  animatedIndex,
  style,
  onPress,
  overlayColor,
}: BottomSheetBackdropProps & {
  onPress?: () => void;
  overlayColor: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      animatedIndex.value,
      [-1, -0.85, 0],
      [0, 1, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View
      style={[style, { backgroundColor: overlayColor }, animatedStyle]}
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
    </Animated.View>
  );
}
