import { useRouter } from "expo-router";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";

export default function AccessDeniedRoute() {
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <EmptyState
        tone="danger"
        icon={<Icon name="ban-outline" size={32} tone="destructive" />}
        title="You’ll need an invite"
        body="Rider and picker accounts are set up by a hub lead. Ask yours to invite you before signing in."
      >
        <Button
          variant="secondary"
          label="Back to sign in"
          icon={<Icon name="help-buoy-outline" size={18} tone="strong" />}
          onPress={() => router.replace("/(auth)/sign-in")}
        />
      </EmptyState>
    </Screen>
  );
}
