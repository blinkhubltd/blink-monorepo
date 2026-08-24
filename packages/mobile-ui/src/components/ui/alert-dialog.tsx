import * as AlertDialogPrimitive from "@rn-primitives/alert-dialog";
import { View } from "react-native";
import { cn } from "../../lib/utils";
import { Text } from "./text";
import { buttonTextVariants, buttonVariants } from "./button";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogOverlay({
  className,
  children,
  ...props
}: AlertDialogPrimitive.OverlayProps) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "absolute bottom-0 left-0 right-0 top-0 z-50 items-center justify-center bg-overlay p-space-5",
        className,
      )}
      {...props}
    >
      {children}
    </AlertDialogPrimitive.Overlay>
  );
}

function AlertDialogContent({
  className,
  portalHost,
  ...props
}: AlertDialogPrimitive.ContentProps & { portalHost?: string }) {
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          className={cn(
            "w-full max-w-[360px] gap-space-4 rounded-xl border-hairline border-border bg-card p-space-6 shadow-lg",
            className,
          )}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof View>) {
  return <View className={cn("gap-space-2", className)} {...props} />;
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn("flex-row justify-end gap-space-3 pt-space-2", className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.TitleProps) {
  return (
    <AlertDialogPrimitive.Title asChild>
      <Text variant="heading" size="h3" className={className} {...props} />
    </AlertDialogPrimitive.Title>
  );
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.DescriptionProps) {
  return (
    <AlertDialogPrimitive.Description asChild>
      <Text variant="muted" size="sm" className={className} {...props} />
    </AlertDialogPrimitive.Description>
  );
}

function AlertDialogAction({
  className,
  ...props
}: AlertDialogPrimitive.ActionProps) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants({ variant: "default" }), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: AlertDialogPrimitive.CancelProps) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  buttonTextVariants,
};
