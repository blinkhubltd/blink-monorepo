import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

/**
 * Static placeholder plate. The pulse belongs to the caller (reanimated), so
 * this stays a pure view and never animates on its own — that keeps it usable
 * inside lists without stacking dozens of drivers.
 */
function Skeleton({ className, ...props }: ViewProps) {
  return (
    <View className={cn("rounded-md bg-secondary", className)} {...props} />
  );
}

export { Skeleton };
