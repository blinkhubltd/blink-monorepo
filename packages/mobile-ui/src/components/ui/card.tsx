import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";
import { Text } from "./text";

/** DS card: 14px radius, hairline border, a whisper of shadow. */
function Card({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "rounded-lg border-hairline border-border bg-card p-space-5 shadow-card",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn("gap-space-1 pb-space-4", className)} {...props} />;
}

function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text variant="heading" size="h3" className={className}>
      {children}
    </Text>
  );
}

function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text variant="muted" size="sm" className={className}>
      {children}
    </Text>
  );
}

function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn("gap-space-4", className)} {...props} />;
}

function CardFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex-row items-center gap-space-4 pt-space-4", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
