import { View, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Text } from "./text";

/** Pill radius, per the DS: anything selectable or status-bearing is a pill. */
const badgeVariants = cva(
  "flex-row self-start items-center justify-center gap-space-1 rounded-pill px-space-3 py-space-1",
  {
    variants: {
      variant: {
        default: "bg-primary",
        inverse: "bg-inverse",
        secondary: "bg-secondary",
        success: "bg-success-soft",
        warning: "bg-warning-soft",
        destructive: "bg-destructive-soft",
        info: "bg-info-soft",
        outline: "border-hairline border-border bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const badgeTextVariants = cva("font-semibold text-caption", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      inverse: "text-inverse-foreground",
      secondary: "text-secondary-foreground",
      success: "text-success",
      warning: "text-warning-foreground",
      destructive: "text-destructive",
      info: "text-info",
      outline: "text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
  label: string;
  icon?: React.ReactNode;
}

function Badge({ label, icon, variant, className, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      {icon}
      <Text className={cn(badgeTextVariants({ variant }))}>{label}</Text>
    </View>
  );
}

export { Badge, badgeVariants, badgeTextVariants };
