import { Pressable, type PressableProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@repo/mobile-ui/lib/utils";

/**
 * The DS's circular header button. 44px — the minimum hit target — even when
 * the glyph inside is 18px.
 */
const iconButtonVariants = cva(
  "h-control w-control items-center justify-center rounded-pill active:scale-[0.96]",
  {
    variants: {
      variant: {
        ghost: "bg-transparent",
        secondary: "bg-secondary",
        /** The black circular button from the app header. */
        inverse: "bg-inverse",
        brand: "bg-primary",
      },
      size: {
        default: "h-control w-control",
        sm: "h-space-8 w-space-8",
      },
    },
    defaultVariants: { variant: "ghost", size: "default" },
  },
);

interface IconButtonProps
  extends PressableProps,
    VariantProps<typeof iconButtonVariants> {
  /** Required: an icon-only control is invisible to a screen reader without it. */
  accessibilityLabel: string;
}

export function IconButton({
  className,
  variant,
  size,
  children,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(iconButtonVariants({ variant, size }), className)}
      hitSlop={8}
      {...props}
    >
      {children}
    </Pressable>
  );
}
