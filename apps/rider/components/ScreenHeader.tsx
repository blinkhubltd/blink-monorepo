import { View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./IconButton";

interface ScreenHeaderProps {
  title: string;
  /** Where back goes. Defaults to router.back(). */
  onBack?: () => void;
  right?: React.ReactNode;
}

/**
 * The single header for a pushed screen.
 *
 * Expo Router's own header is disabled app-wide in the root layout — the
 * reference app left it on AND rendered its own bar, producing two stacked
 * headers on every detail screen.
 */
export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center gap-space-4 bg-background px-screen pb-space-2"
      style={{ paddingTop: insets.top + 8 }}
    >
      <IconButton
        accessibilityLabel="Go back"
        onPress={onBack ?? (() => router.back())}
      >
        <ArrowLeft size={22} strokeWidth={2} className="text-strong" />
      </IconButton>
      <Text variant="heading" size="h3" className="flex-1" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
