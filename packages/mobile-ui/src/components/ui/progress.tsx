import * as ProgressPrimitive from "@rn-primitives/progress";
import { View } from "react-native";
import { cn } from "../../lib/utils";

interface ProgressProps extends ProgressPrimitive.RootProps {
  indicatorClassName?: string;
}

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <ProgressPrimitive.Root
      className={cn(
        "h-space-3 w-full overflow-hidden rounded-pill bg-secondary",
        className,
      )}
      value={value}
      {...props}
    >
      <View
        className={cn("h-full rounded-pill bg-primary", indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
