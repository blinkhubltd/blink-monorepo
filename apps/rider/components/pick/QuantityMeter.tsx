import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from "react-native-reanimated";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

/**
 * Per-unit progress for one pick-list item.
 *
 * Up to `PIP_LIMIT` units it draws one segment per unit, so a picker can read
 * "two of three taken" without parsing a number — the count is the shape. Above
 * that the segments would be slivers, so it becomes a single bar. Both forms
 * carry the numeric label, because a pip row alone is ambiguous once it is full.
 */
const PIP_LIMIT = 8;

interface QuantityMeterProps {
  picked: number;
  total: number;
  /** Rendered on the ink card, where the default track is invisible. */
  onInverse?: boolean;
  className?: string;
}

export function QuantityMeter({
  picked,
  total,
  onInverse,
  className,
}: QuantityMeterProps) {
  const safeTotal = Math.max(1, total);
  const safePicked = Math.max(0, Math.min(safeTotal, picked));
  const complete = safePicked >= safeTotal;

  if (safeTotal <= PIP_LIMIT) {
    return (
      <View
        className={cn("flex-row gap-space-1", className)}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: safeTotal, now: safePicked }}
      >
        {Array.from({ length: safeTotal }).map((_, i) => (
          <Pip
            key={i}
            filled={i < safePicked}
            complete={complete}
            onInverse={onInverse}
          />
        ))}
      </View>
    );
  }

  return (
    <Bar
      picked={safePicked}
      total={safeTotal}
      complete={complete}
      onInverse={onInverse}
      className={className}
    />
  );
}

function Pip({
  filled,
  complete,
  onInverse,
}: {
  filled: boolean;
  complete: boolean;
  onInverse?: boolean;
}) {
  // Springs rather than a timing curve: each unit is a discrete physical act, and
  // a small overshoot reads as the segment landing.
  const progress = useDerivedValue(() =>
    withSpring(filled ? 1 : 0, { damping: 18, stiffness: 260 }),
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.72 + progress.value * 0.28 }],
    opacity: 0.35 + progress.value * 0.65,
  }));

  return (
    <Animated.View
      style={style}
      className={cn(
        "h-space-2 w-space-5 rounded-pill",
        filled
          ? complete
            ? "bg-success"
            : "bg-primary"
          : onInverse
            ? "bg-ink-700"
            : "bg-secondary",
      )}
    />
  );
}

function Bar({
  picked,
  total,
  complete,
  onInverse,
  className,
}: {
  picked: number;
  total: number;
  complete: boolean;
  onInverse?: boolean;
  className?: string;
}) {
  const pct = useDerivedValue(() =>
    withSpring((picked / total) * 100, { damping: 20, stiffness: 180 }),
  );
  const style = useAnimatedStyle(() => ({ width: `${pct.value}%` }));

  return (
    <View
      className={cn(
        "h-space-2 overflow-hidden rounded-pill",
        onInverse ? "bg-ink-700" : "bg-secondary",
        className,
      )}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: picked }}
    >
      <Animated.View
        style={style}
        className={cn("h-full rounded-pill", complete ? "bg-success" : "bg-primary")}
      />
    </View>
  );
}

/** "2 of 3" — the numeric form, used beside the meter. */
export function QuantityLabel({
  picked,
  total,
  className,
}: {
  picked: number;
  total: number;
  className?: string;
}) {
  return (
    <Text
      size="label"
      weight="semibold"
      variant={picked >= total ? "success" : "muted"}
      className={className}
    >
      {Math.min(picked, total)} of {total}
    </Text>
  );
}
