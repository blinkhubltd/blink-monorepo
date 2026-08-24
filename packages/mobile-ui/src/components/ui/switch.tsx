import * as SwitchPrimitives from "@rn-primitives/switch";
import { cn } from "../../lib/utils";

function Switch({
  className,
  ...props
}: SwitchPrimitives.RootProps & {
  ref?: React.RefObject<SwitchPrimitives.RootRef>;
}) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "h-[28px] w-[48px] shrink-0 flex-row items-center rounded-pill border-2 border-transparent",
        props.checked ? "bg-primary" : "bg-secondary",
        props.disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "h-[22px] w-[22px] rounded-pill bg-card shadow-xs",
          props.checked ? "translate-x-[21px]" : "translate-x-[1px]",
        )}
      />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
