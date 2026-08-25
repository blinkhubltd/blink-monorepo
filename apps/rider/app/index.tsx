import { useEffect } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { useCrew } from "../providers/CrewProvider";

/**
 * Splash and gate.
 *
 * Holds only as long as Clerk and the crew document take to resolve, then routes
 * on the real answer. It is a route rather than a state inside the tab layout so
 * the native splash can hand off to it without a flash of the tab bar.
 */
export default function SplashRoute() {
  const router = useRouter();
  const { gate } = useCrew();

  useEffect(() => {
    switch (gate) {
      case "loading":
        return;
      case "no_session":
        router.replace("/(auth)/sign-in");
        return;
      case "no_account":
        // Signed in with Clerk but the `users` row does not exist yet. The Clerk
        // webhook creates it, so this is usually a race on first sign-in — but it
        // is also exactly what a genuinely unregistered number looks like, and
        // the app cannot tell them apart. access-denied reads correctly for both
        // and offers a way back.
        router.replace("/(auth)/access-denied");
        return;
      case "not_crew":
        router.replace("/(auth)/access-denied");
        return;
      case "suspended":
        router.replace("/(auth)/access-restricted");
        return;
      case "ok":
        router.replace("/(tabs)");
        return;
    }
  }, [gate, router]);

  return (
    <View className="flex-1 items-center justify-center gap-space-5 bg-background px-space-7">
      <Image
        source={require("../assets/images/logo-blink-ink.png")}
        style={{ width: 152, height: 40 }}
        contentFit="contain"
      />
      {/* One of exactly two strings the DS allows in uppercase. */}
      <Text
        weight="black"
        size="base"
        className="uppercase italic tracking-[0.6px] text-strong"
      >
        FASTER THAN YOU
      </Text>
      <View className="absolute bottom-space-11">
        <Text variant="muted" size="sm" weight="medium">
          Loading rider tools…
        </Text>
      </View>
    </View>
  );
}
