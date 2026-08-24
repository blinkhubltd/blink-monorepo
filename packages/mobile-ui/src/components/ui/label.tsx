import * as LabelPrimitive from "@rn-primitives/label";
import { cn } from "../../lib/utils";

function Label({
  className,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  ...props
}: LabelPrimitive.TextProps & {
  ref?: React.RefObject<LabelPrimitive.TextRef>;
}) {
  return (
    <LabelPrimitive.Root
      className="web:cursor-default"
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <LabelPrimitive.Text
        className={cn(
          "font-semibold uppercase tracking-label text-label text-muted-foreground",
          className,
        )}
        {...props}
      />
    </LabelPrimitive.Root>
  );
}

export { Label };
