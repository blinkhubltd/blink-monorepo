import { useCallback } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Check, Minus, Plus } from "lucide-react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";
import type { PickItem } from "../../lib/data/types";
import { PrescriptionItemLink } from "../PrescriptionItemLink";
import { QuantityLabel, QuantityMeter } from "./QuantityMeter";

interface PickRowProps {
  item: PickItem;
  busy: boolean;
  onPick: (delta: 1 | -1) => void;
}

/**
 * One line on the pick list.
 *
 * The interaction is the point here. A multi-unit item is a counter, not a
 * checkbox: taking three loaves means three presses, and the row shows how many
 * are actually in the bag. A single-unit item collapses to one large tap target,
 * because a stepper for a count of one is friction with no information in it.
 *
 * The old app rendered every item as one checkbox regardless of quantity, so a
 * picker could tick an item of twelve having taken one, and nothing downstream
 * knew.
 */
export function PickRow({ item, busy, onPick }: PickRowProps) {
  const single = item.quantity <= 1;
  const complete = item.picked;
  const locked = item.requiresPrescription;

  const press = useCallback(
    (delta: 1 | -1) => {
      if (busy || locked) return;
      // Haptics carry the feedback the eye is not on — a picker is looking at
      // the shelf, not the screen. A distinct success weight on the last unit is
      // the signal that the item is done and they can move on.
      const willComplete = delta === 1 && item.pickedQuantity + 1 >= item.quantity;
      void Haptics.impactAsync(
        willComplete
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light,
      );
      onPick(delta);
    },
    [busy, locked, item.pickedQuantity, item.quantity, onPick],
  );

  const settle = useDerivedValue(() =>
    withTiming(complete ? 1 : 0, { duration: 240 }),
  );
  const cardStyle = useAnimatedStyle(() => ({
    opacity: busy ? 0.55 : 1 - settle.value * 0.28,
  }));

  return (
    <Animated.View
      style={cardStyle}
      className={cn(
        "flex-row items-center gap-space-4 rounded-lg border-hairline bg-card p-space-4",
        complete ? "border-success/30" : "border-border",
        // A completed row keeps its shadow but loses the lift, so the eye is
        // drawn to what is still outstanding.
        complete ? "" : "shadow-card",
      )}
    >
      <View className="flex-1 gap-space-2">
        <View className="flex-row items-center gap-space-2">
          <Text variant="eyebrow" size="caption">
            {item.location}
          </Text>
          {item.scanned ? (
            <View className="flex-row items-center gap-space-1">
              <Check size={10} strokeWidth={3} className="text-success" />
              <Text size="caption" variant="success" weight="semibold">
                Scanned
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          weight="semibold"
          size="sm"
          numberOfLines={2}
          className={complete ? "text-muted-foreground" : "text-strong"}
        >
          {item.name}
        </Text>

        {/* The meter only earns its place when there is more than one unit. */}
        {single ? null : (
          <View className="flex-row items-center gap-space-3 pt-space-1">
            <QuantityMeter
              picked={item.pickedQuantity}
              total={item.quantity}
              className="flex-shrink"
            />
            <QuantityLabel picked={item.pickedQuantity} total={item.quantity} />
          </View>
        )}
      </View>

      {locked ? (
        <PrescriptionItemLink itemId={item.id} />
      ) : single ? (
        <SingleTap complete={complete} busy={busy} onPress={() => press(complete ? -1 : 1)} />
      ) : (
        <Stepper
          item={item}
          busy={busy}
          onDecrement={() => press(-1)}
          onIncrement={() => press(1)}
        />
      )}
    </Animated.View>
  );
}

/** Quantity of one: a single 44px target that toggles. */
function SingleTap({
  complete,
  busy,
  onPress,
}: {
  complete: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: complete, disabled: busy }}
      accessibilityLabel={complete ? "Put this item back" : "Pick this item"}
      disabled={busy}
      onPress={onPress}
      hitSlop={6}
      className={cn(
        "h-control w-control items-center justify-center rounded-md border-2 active:scale-[0.96]",
        complete
          ? "border-success bg-success"
          : "border-input bg-transparent",
      )}
    >
      {complete ? (
        <Check size={22} strokeWidth={3} className="text-success-foreground" />
      ) : null}
    </Pressable>
  );
}

/** Quantity above one: minus, count, plus. */
function Stepper({
  item,
  busy,
  onDecrement,
  onIncrement,
}: {
  item: PickItem;
  busy: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const atMin = item.pickedQuantity <= 0;
  const atMax = item.pickedQuantity >= item.quantity;

  return (
    <View className="flex-row items-center gap-space-1">
      {/*
        Minus is present but quiet, and disabled at zero. Undo has to be
        reachable — a picker who over-counts must be able to correct it rather
        than abandon the order — but it should never compete with the primary
        action for attention.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Put back one ${item.name}`}
        accessibilityState={{ disabled: busy || atMin }}
        disabled={busy || atMin}
        onPress={onDecrement}
        hitSlop={4}
        className={cn(
          "h-control w-space-9 items-center justify-center rounded-md active:scale-[0.96]",
          atMin ? "opacity-25" : "bg-secondary",
        )}
      >
        <Minus size={18} strokeWidth={2.5} className="text-strong" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          atMax
            ? `All ${item.quantity} ${item.name} picked`
            : `Pick one ${item.name}, ${item.pickedQuantity} of ${item.quantity} so far`
        }
        accessibilityState={{ disabled: busy || atMax }}
        disabled={busy || atMax}
        onPress={onIncrement}
        hitSlop={4}
        className={cn(
          "h-control min-w-[56px] flex-row items-center justify-center gap-space-1 rounded-md active:scale-[0.96]",
          atMax ? "bg-success" : "bg-primary",
        )}
      >
        {atMax ? (
          <Check size={20} strokeWidth={3} className="text-success-foreground" />
        ) : (
          <>
            <Plus
              size={16}
              strokeWidth={3}
              className="text-primary-foreground"
            />
            <Text
              size="sm"
              weight="bold"
              className="text-primary-foreground"
            >
              {item.quantity - item.pickedQuantity}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
