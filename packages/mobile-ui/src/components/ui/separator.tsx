import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

interface SeparatorProps extends ViewProps {
  orientation?: "horizontal" | "vertical";
}

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) {
  return (
    <View
      accessibilityRole="none"
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-hairline w-full" : "w-hairline h-full",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
