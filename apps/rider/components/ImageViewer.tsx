import { Modal, View } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { IconButton } from "./IconButton";

interface ImageViewerProps {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
  /** Shown top-left, e.g. "2 of 3". */
  caption?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/**
 * Full-screen pinch-and-pan image viewer.
 *
 * A picker verifying a prescription has to read the prescriber's handwriting and
 * the dosage — the reference app showed the image at thumbnail size with no way
 * to enlarge it, which makes the check it is asking for impossible to actually
 * perform.
 */
export function ImageViewer({
  uri,
  visible,
  onClose,
  caption,
}: ImageViewerProps) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  function reset() {
    scale.value = withTiming(1, { duration: 160 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 160 });
    translateY.value = withTiming(0, { duration: 160 });
    savedX.value = 0;
    savedY.value = 0;
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Snapping back at 1x also recentres, so a pinch-out then release cannot
      // leave the image panned off screen with nothing visible.
      if (scale.value <= MIN_SCALE) {
        scale.value = withTiming(1, { duration: 160 });
        translateX.value = withTiming(0, { duration: 160 });
        translateY.value = withTiming(0, { duration: 160 });
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      // Panning only makes sense once zoomed in.
      if (scale.value <= MIN_SCALE) return;
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > MIN_SCALE) {
        scale.value = withTiming(1, { duration: 160 });
        translateX.value = withTiming(0, { duration: 160 });
        translateY.value = withTiming(0, { duration: 160 });
        savedScale.value = 1;
        savedX.value = 0;
        savedY.value = 0;
      } else {
        scale.value = withTiming(2.5, { duration: 160 });
        savedScale.value = 2.5;
      }
    });

  const gesture = Gesture.Simultaneous(pan, pinch, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        reset();
        onClose();
      }}
      statusBarTranslucent
    >
      <View className="flex-1 bg-ink-950">
        <View
          className="absolute left-0 right-0 z-10 flex-row items-center justify-between px-screen"
          style={{ top: insets.top + 8 }}
        >
          {caption ? (
            <Text size="sm" weight="medium" className="text-white">
              {caption}
            </Text>
          ) : (
            <View />
          )}
          <IconButton
            accessibilityLabel="Close image"
            onPress={() => {
              reset();
              onClose();
            }}
          >
            <X size={22} strokeWidth={2} className="text-white" />
          </IconButton>
        </View>

        <GestureDetector gesture={gesture}>
          <Animated.View className="flex-1 items-center justify-center" style={animatedStyle}>
            {uri ? (
              <Image
                source={{ uri }}
                style={{ width: "100%", height: "80%" }}
                contentFit="contain"
                transition={160}
              />
            ) : null}
          </Animated.View>
        </GestureDetector>

        <View
          className="absolute left-0 right-0 items-center"
          style={{ bottom: insets.bottom + 16 }}
        >
          <Text size="caption" className="text-ink-400">
            Pinch or double-tap to zoom
          </Text>
        </View>
      </View>
    </Modal>
  );
}
