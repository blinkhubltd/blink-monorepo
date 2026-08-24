import { Compass } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";

export default function NotFoundRoute() {
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <EmptyState
        icon={<Compass size={32} strokeWidth={2} className="text-subtle" />}
        title="Page not found"
        body="That link doesn’t lead anywhere in Blink Riders. It may be out of date."
      >
        <Button
          label="Back to home"
          icon={<Compass size={18} strokeWidth={2} className="text-primary-foreground" />}
          onPress={() => router.replace("/(tabs)")}
        />
      </EmptyState>
    </Screen>
  );
}
