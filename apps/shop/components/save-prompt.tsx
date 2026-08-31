import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { X } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";

/**
 * What a guest sees after tapping the heart.
 *
 * Rendered where they were, not navigated to. The plan's standing rule is that
 * side effects raise state for a screen to render and never call `router.replace`
 * — that is what produced the refresh-to-home bug — and commercially, sending
 * someone to a sign-in screen from a browse grid loses the product they were
 * looking at along with the sale.
 *
 * Sign-in itself is a modal over the current URL, so accepting this keeps them
 * on the same screen too.
 */
export function SavePrompt({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return (
    <View className="px-screen pb-space-2">
      <View className="bg-warning-soft gap-space-3 p-space-3 flex-row items-center rounded-md">
        <View className="gap-space-1 flex-1">
          <Text size="sm" weight="semibold">
            Sign in to save items
          </Text>
          <Text size="caption">
            Saved items follow your account rather than this device.
          </Text>
        </View>
        <Button
          size="sm"
          label="Sign in"
          onPress={() => {
            onDismiss();
            router.push("/(auth)/sign-in");
          }}
        />
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
        >
          <X size={16} color="#5A6372" />
        </Pressable>
      </View>
    </View>
  );
}

/** The other outcome of a heart tap: it failed, and saying so beats a silent no-op. */
export function SaveError({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <View className="px-screen pb-space-2">
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="bg-destructive-soft p-space-3 rounded-md"
      >
        <Text size="sm" variant="destructive">
          {message}
        </Text>
      </Pressable>
    </View>
  );
}
