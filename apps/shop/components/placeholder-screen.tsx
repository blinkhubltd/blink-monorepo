import { View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";

/**
 * A route that exists so the navigator is complete, but whose screen is not
 * built yet.
 *
 * Deliberately explicit rather than a blank view: the browse-and-buy spine is
 * being built first, and a route that silently renders nothing is
 * indistinguishable from one that is broken. This says which it is.
 */
export function PlaceholderScreen({
  title,
  note,
  showBack = false,
}: {
  title: string;
  note: string;
  showBack?: boolean;
}) {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="gap-space-4 px-screen flex-1 items-center justify-center">
        <Text variant="heading" size="h2" className="text-center">
          {title}
        </Text>
        <Text variant="muted" size="sm" className="text-center">
          {note}
        </Text>
        {showBack ? (
          <Button
            variant="outline"
            label="Back"
            onPress={() => router.back()}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
