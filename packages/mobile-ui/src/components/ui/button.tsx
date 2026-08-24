import { ActivityIndicator, Pressable, View, type PressableProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Text } from "./text";

/**
 * Radius is `md` (12px) and the minimum height is 44px — the DS control height,
 * which is also the accessible touch target. The old rider app had the 44px fix
 * and ecommerce did not; that fix is carried forward here for both.
 */
const buttonVariants = cva(
  "flex-row items-center justify-center gap-space-3 rounded-md px-space-5 min-h-control",
  {
    variants: {
      variant: {
        /** The yellow CTA. */
        default: "bg-primary",
        /** Ink pill — the DS's second most common control. */
        inverse: "bg-inverse",
        destructive: "bg-destructive",
        outline: "border-hairline border-input bg-transparent",
        secondary: "bg-secondary",
        ghost: "bg-transparent",
        link: "bg-transparent px-0 min-h-0",
      },
      size: {
        default: "h-control",
        sm: "h-control-sm px-space-4",
        lg: "h-control-lg px-space-7",
        icon: "h-control w-control px-0",
        iconSm: "h-control-sm w-control-sm px-0",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "default", size: "default", full: false },
  },
);

const buttonTextVariants = cva("font-semibold text-body", {
  variants: {
    variant: {
      // Yellow is a light surface: ink type on yellow, always.
      default: "text-primary-foreground",
      inverse: "text-inverse-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-strong",
      secondary: "text-secondary-foreground",
      ghost: "text-strong",
      link: "text-strong underline",
    },
    size: {
      default: "",
      sm: "text-body-sm",
      lg: "text-body-lg",
      icon: "",
      iconSm: "",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps
  extends PressableProps,
    VariantProps<typeof buttonVariants> {
  label?: string;
  /** Rendered before the label. */
  icon?: React.ReactNode;
  loading?: boolean;
  children?: React.ReactNode;
}

function Button({
  className,
  variant,
  size,
  full,
  label,
  icon,
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      // DS press feedback: scale(0.96), 160ms.
      className={cn(
        buttonVariants({ variant, size, full }),
        "active:scale-[0.96]",
        isDisabled && "opacity-50",
        className,
      )}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" />
      ) : (
        (children ?? (
          <>
            {icon ? <View>{icon}</View> : null}
            {label ? (
              <Text className={cn(buttonTextVariants({ variant, size }))}>
                {label}
              </Text>
            ) : null}
          </>
        ))
      )}
    </Pressable>
  );
}

export { Button, buttonVariants, buttonTextVariants };
