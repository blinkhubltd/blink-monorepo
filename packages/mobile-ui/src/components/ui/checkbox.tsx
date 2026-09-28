import * as CheckboxPrimitive from "@rn-primitives/checkbox";
import { Icon } from "./icon";
import { cn } from "../../lib/utils";

function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.RootProps & {
  ref?: React.RefObject<CheckboxPrimitive.RootRef>;
}) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm border-2",
        props.checked ? "border-primary bg-primary" : "border-input bg-card",
        props.disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="items-center justify-center">
        {/* Ink on yellow, always — `onBrand` is the one role that does not
            flip in dark mode, because the yellow behind it does not either. */}
        <Icon name="checkmark-sharp" size={16} tone="onBrand" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
