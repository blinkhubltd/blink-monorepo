import { Text as RNText, type TextProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * Base text. Deliberately neutral: colour only, no weight and no alignment.
 * The old apps both got this wrong in opposite directions — rider baked
 * `font-semibold text-center` (button text leaking into Text) and ecommerce
 * baked a fixed typography colour.
 *
 * Sizes are the Blink DS type scale, not Tailwind's default ramp.
 */
const textVariants = cva("font-sans text-foreground", {
  variants: {
    variant: {
      default: "",
      /** Screen and section titles. */
      heading: "font-bold text-strong",
      /** Secondary copy. */
      muted: "text-muted-foreground",
      /** Tertiary copy — timestamps, helper text. */
      subtle: "text-subtle",
      /** UPPERCASE eyebrow. Sentence case everywhere else, per the DS. */
      eyebrow: "font-semibold uppercase tracking-label text-muted-foreground",
      /** Money. Always gold, always bold. */
      price: "font-bold text-price",
      destructive: "text-destructive",
      success: "text-success",
      /** Type on a yellow surface is ink black, always. */
      onBrand: "text-primary-foreground",
      onInverse: "text-inverse-foreground",
    },
    size: {
      caption: "text-caption",
      label: "text-label",
      sm: "text-body-sm",
      base: "text-body",
      lg: "text-body-lg",
      h4: "text-h4",
      h3: "text-h3",
      h2: "text-h2",
      h1: "text-h1 tracking-h1",
      price: "text-price",
      priceLg: "text-price-lg",
    },
    weight: {
      regular: "font-sans",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
      black: "font-black",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "base",
  },
});

interface Props extends TextProps, VariantProps<typeof textVariants> {}

function Text({ className, variant, size, weight, ...props }: Props) {
  return (
    <RNText
      className={cn(textVariants({ variant, size, weight }), className)}
      {...props}
    />
  );
}

export { Text, textVariants };
