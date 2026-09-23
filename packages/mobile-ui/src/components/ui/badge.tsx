import { View, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Text } from "./text";

/** Pill radius, per the DS: anything selectable or status-bearing is a pill. */
const badgeVariants = cva(
  "flex-row self-start items-center justify-center gap-space-1 rounded-pill",
  {
    variants: {
      /**
       * `sm` is for a badge that annotates something else rather than
       * standing on its own — "Default" beside an address, "Only 2 left" on a
       * product card. At the default size those read as loudly as the thing
       * they are qualifying, which is what made a stock count compete with
       * the product name for attention.
       */
      size: {
        default: "px-space-3 py-space-1",
        sm: "px-space-2 py-[1px]",
      },
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
    defaultVariants: { variant: "default", size: "default" },
  },
);

const badgeTextVariants = cva("font-semibold", {
  variants: {
    size: {
      default: "text-caption",
      // Below the type scale's smallest step on purpose: the scale starts at
      // the smallest size meant to be *read*, and this one is meant to be
      // recognised at a glance beside something already being read.
      sm: "text-[10px] leading-[13px]",
    },
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
  defaultVariants: { variant: "default", size: "default" },
});

interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
  label: string;
  icon?: React.ReactNode;
}

function Badge({
  label,
  icon,
  variant,
  size,
  className,
  ...props
}: BadgeProps) {
  return (
    <View
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {icon}
      <Text className={cn(badgeTextVariants({ variant, size }))}>{label}</Text>
    </View>
  );
}

export { Badge, badgeVariants, badgeTextVariants };
