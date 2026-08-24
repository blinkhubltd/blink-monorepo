import { useRouter } from "expo-router";
import { Clock, LogOut } from "lucide-react-native";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";

export default function AccessRestrictedRoute() {
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <EmptyState
        tone="brand"
        icon={<Clock size={32} strokeWidth={2} className="text-blink-600" />}
        title="Your account is under review"
        body="Your hub is checking your documents. You’ll get an SMS the moment you can start taking jobs."
      >
        <Badge variant="warning" label="Usually under 24h" />
        <Button
          variant="ghost"
          label="Sign out"
          icon={<LogOut size={18} strokeWidth={2} className="text-strong" />}
          onPress={() => router.replace("/(auth)/sign-in")}
        />
      </EmptyState>
    </Screen>
  );
}
