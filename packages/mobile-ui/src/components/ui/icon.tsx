import { cssInterop } from "nativewind";
import type { LucideIcon, LucideProps } from "lucide-react-native";

/**
 * Wraps a Lucide icon so `className` drives `color` and `size`, letting icons
 * pick up the semantic palette instead of hardcoding hex per call site.
 *
 * Lucide on a 24px grid with a 2px stroke, per the DS.
 */
function withIconClassName(icon: LucideIcon): LucideIcon {
  cssInterop(icon, {
    className: {
      target: "style",
      nativeStyleToProp: { color: true, width: true, height: true },
    },
  });
  return icon;
}

const DEFAULT_ICON_PROPS: Partial<LucideProps> = {
  size: 24,
  strokeWidth: 2,
};

export { withIconClassName, DEFAULT_ICON_PROPS };
export type { LucideIcon, LucideProps };
