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
        title="This number isn’t registered"
        body="We couldn’t find a rider or picker account for that number. Ask your hub lead to add you."
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
