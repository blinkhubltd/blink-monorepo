import { Pressable, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

interface ListRowProps {
  label: string;
  icon: React.ReactNode;
  onPress?: () => void;
  /** Suppresses the chevron and tints the label — used for Sign out. */
  destructive?: boolean;
  /** Hairline under the row; omit on the last item in a group. */
  divider?: boolean;
  right?: React.ReactNode;
}

export function ListRow({
  label,
  icon,
  onPress,
  destructive,
  divider = true,
  right,
}: ListRowProps) {
  const disabled = !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-control flex-row items-center gap-space-4 px-space-5 py-space-4",
        divider && "border-b-hairline border-border",
        !disabled && "active:opacity-70",
      )}
    >
      {icon}
      <Text
        className="flex-1"
        weight="medium"
        variant={destructive ? "destructive" : "default"}
      >
        {label}
      </Text>
      {right ??
        (destructive || disabled ? null : (
          <ChevronRight size={18} strokeWidth={2} className="text-subtle" />
        ))}
    </Pressable>
  );
}
