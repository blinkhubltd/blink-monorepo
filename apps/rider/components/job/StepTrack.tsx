import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

import { JOB_STEPS, jobSteps, type StepState } from "../../lib/job-status";

const BAR: Record<StepState, string> = {
  done: "bg-strong",
  now: "bg-primary",
  todo: "bg-border",
};

/** Assigned · At hub · On the way · Delivered, as four segments. */
export function StepTrack({ status }: { status: string }) {
  const steps = jobSteps(status);
  return (
    <View
      className="flex-row items-center gap-[6px]"
      accessibilityRole="progressbar"
      accessibilityLabel={`Delivery progress: ${
        JOB_STEPS[Math.max(0, steps.lastIndexOf("done"))]
      }`}
    >
      {JOB_STEPS.map((label, i) => {
        const state = steps[i]!;
        return (
          <View key={label} className="flex-1 gap-[6px]">
            <View className={cn("h-[5px] rounded-pill", BAR[state])} />
            <Text
              weight="semibold"
              className={cn(
                "text-[10px] uppercase leading-[13px] tracking-label",
                state === "todo" ? "text-subtle" : "text-strong",
              )}
            >
              {label.toUpperCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
