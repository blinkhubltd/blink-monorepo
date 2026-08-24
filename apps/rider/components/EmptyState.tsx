import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  /** Tint of the 72px circle behind the icon. */
  tone?: "neutral" | "danger" | "brand" | "success";
  title: string;
  body?: string;
  children?: React.ReactNode;
}

const TONE_BG: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  neutral: "bg-secondary",
  danger: "bg-destructive-soft",
  brand: "bg-accent",
  success: "bg-success-soft",
};

export function EmptyState({
  icon,
  tone = "neutral",
  title,
  body,
  children,
}: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-space-6 px-space-7 py-space-8">
      <View
        className={cn(
          "h-[72px] w-[72px] items-center justify-center rounded-pill",
          TONE_BG[tone],
        )}
      >
        {icon}
      </View>
      <View className="gap-space-3">
        <Text variant="heading" size="h2" className="text-center">
          {title}
        </Text>
        {body ? (
          <Text variant="muted" className="max-w-[280px] text-center">
            {body}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
