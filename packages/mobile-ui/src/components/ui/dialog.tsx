import * as DialogPrimitive from "@rn-primitives/dialog";
import { View } from "react-native";
import { X } from "lucide-react-native";
import { cn } from "../../lib/utils";
import { Text } from "./text";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

function DialogOverlay({
  className,
  children,
  ...props
}: DialogPrimitive.OverlayProps) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "absolute bottom-0 left-0 right-0 top-0 z-50 items-center justify-center bg-overlay p-space-5",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Overlay>
  );
}

/** Sheet radius (20px) per the DS. */
function DialogContent({
  className,
  children,
  portalHost,
  ...props
}: DialogPrimitive.ContentProps & { portalHost?: string }) {
  return (
    <DialogPortal hostName={portalHost}>
      <DialogOverlay>
        <DialogPrimitive.Content
          className={cn(
            "w-full max-w-[360px] gap-space-4 rounded-xl border-hairline border-border bg-card p-space-6 shadow-lg",
            className,
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close
            accessibilityLabel="Close"
            className="absolute right-space-4 top-space-4 h-space-8 w-space-8 items-center justify-center rounded-pill active:opacity-70"
          >
            <X size={18} strokeWidth={2} color="#5A6372" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("gap-space-2 pr-space-8", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn("flex-row justify-end gap-space-3 pt-space-2", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.TitleProps) {
  return (
    <DialogPrimitive.Title asChild>
      <Text variant="heading" size="h3" className={className} {...props} />
    </DialogPrimitive.Title>
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.DescriptionProps) {
  return (
    <DialogPrimitive.Description asChild>
      <Text variant="muted" size="sm" className={className} {...props} />
    </DialogPrimitive.Description>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
