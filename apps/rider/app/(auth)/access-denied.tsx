import { useRouter } from "expo-router";
import { LifeBuoy, ShieldOff } from "lucide-react-native";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";

export default function AccessDeniedRoute() {
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <EmptyState
        tone="danger"
        icon={<ShieldOff size={32} strokeWidth={2} className="text-destructive" />}
        title="You’ll need an invite"
        body="Rider and picker accounts are set up by a hub lead. Ask yours to invite you before signing in."
      >
        <Button
          variant="secondary"
          label="Back to sign in"
          icon={<LifeBuoy size={18} strokeWidth={2} className="text-secondary-foreground" />}
          onPress={() => router.replace("/(auth)/sign-in")}
        />
      </EmptyState>
    </Screen>
  );
}
