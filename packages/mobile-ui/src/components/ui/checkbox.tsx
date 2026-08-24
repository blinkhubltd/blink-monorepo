import * as CheckboxPrimitive from "@rn-primitives/checkbox";
import { Check } from "lucide-react-native";
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
        {/* Ink on yellow, always. */}
        <Check size={14} strokeWidth={3} color="#0A0E16" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
