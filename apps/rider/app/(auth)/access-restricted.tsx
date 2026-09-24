import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Clock } from "lucide-react-native";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { AuthHeader, AuthShell } from "../../components/auth/auth-shell";
import { useCrew } from "../../providers/CrewProvider";

/**
 * Waiting on the hub: a rider whose documents are in but not yet approved
 * (`pending_review`), or a picker their hub set Inactive (`suspended`).
 *
 * It follows the gate. The crew document is a live Convex query, so the
 * moment an admin approves this rider on the Staff page the gate reads "ok"
 * and this screen moves them into the app — no reload, no "check again"
 * button. It used to promise an SMS nothing sends.
 *
 * Sign out calls Clerk's signOut. It used to only navigate to sign-in, which
 * left the session alive — so the gate sent the rider straight back here.
 */
export default function AccessRestrictedRoute() {
  const router = useRouter();
  const { gate, crew, signOut } = useCrew();

  useEffect(() => {
    if (gate === "ok") router.replace("/(tabs)");
    else if (gate === "needs_documents") router.replace("/(auth)/onboarding");
    else if (gate === "no_session") router.replace("/(auth)/sign-in");
  }, [gate, router]);

  const suspended = gate === "suspended";

  return (
    <AuthShell>
      <AuthHeader
        title={suspended ? "Your account is paused." : "Your documents are in."}
        subtitle={
          suspended
            ? "Your hub lead has paused your account. Contact them to be switched back on."
            : "Your hub lead is reviewing them. This page opens the app by itself as soon as you are approved."
        }
      />

      <View className="items-center gap-space-7">
        <View className="size-[72px] items-center justify-center rounded-pill bg-blink-100">
          <Clock size={32} strokeWidth={2} className="text-blink-700" />
        </View>

        {!suspended ? <Badge variant="warning" label="Usually under 24h" /> : null}

        {crew?.name ? (
          <Text size="sm" className="text-center text-ink-500">
            Signed in as {crew.name}
          </Text>
        ) : null}

        <Button
          variant="outline"
          label="Sign out"
          size="ctaLg"
          full
          onPress={() => void signOut()}
        />
      </View>
    </AuthShell>
  );
}
