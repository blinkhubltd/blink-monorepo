import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { useRouter } from "expo-router";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";

export default function NotFoundRoute() {
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <EmptyState
        icon={<Icon name="compass-outline" size={32} tone="subtle" />}
        title="Page not found"
        body="That link doesn’t lead anywhere in Blink Riders. It may be out of date."
      >
        <Button
          label="Back to home"
          icon={<Icon name="compass-outline" size={18} tone="onBrand" />}
          onPress={() => router.replace("/(tabs)")}
        />
      </EmptyState>
    </Screen>
  );
}
