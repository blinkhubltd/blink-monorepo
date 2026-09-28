import { View } from "react-native";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

import { clockTo } from "../../lib/earnings";

/**
 * The drop-by countdown: time left on the customer's promise.
 *
 * Yellow while there is time, red once the promise has passed — and it keeps
 * counting, as "3:05 late", rather than freezing at zero. `lg` is the ride
 * screen's floating clock; `sm` sits beside a section title.
 *
 * Renders nothing without a deadline. An order with no order time has no
 * promise to count down to, and an invented one would be worse than a gap.
 */
export function ClockPill({
  deadline,
  now,
  size = "sm",
}: {
  deadline: number | null;
  now: number;
  size?: "sm" | "lg";
}) {
  if (deadline === null) return null;
  const { label, late } = clockTo(deadline, now);
  const lg = size === "lg";
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={late ? `${label} late` : `${label} left to drop off`}
      className={cn(
        "flex-row items-center rounded-pill",
        late ? "bg-destructive" : "bg-primary",
        lg ? "gap-[9px] px-[22px] py-[11px] shadow-lg" : "gap-[6px] px-[12px] py-[5px]",
      )}
    >
      <Icon
        name="time-outline"
        size={lg ? 19 : 14}
        tone={late ? "onSolid" : "onBrand"}
      />
      <Text
        weight="bold"
        className={cn(
          late ? "text-destructive-foreground" : "text-primary-foreground",
          lg ? "text-[22px] leading-[26px]" : "text-label",
        )}
      >
        {late ? `${label} late` : label}
      </Text>
    </View>
  );
}
