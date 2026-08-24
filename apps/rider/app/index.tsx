import { useEffect } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Text } from "@repo/mobile-ui/components/ui/text";

/**
 * Splash. Holds only as long as the crew identity takes to resolve, then
 * redirects. It is a route rather than a state inside the tab layout so the
 * native splash can hand off to it without a flash of the tab bar.
 */
export default function SplashRoute() {
  const router = useRouter();

  useEffect(() => {
    // Once Clerk is wired this branches on session + role:
    //   no session            -> /(auth)/sign-in
    //   session, no crew role -> /(auth)/access-denied
    //   crew pending review   -> /(auth)/access-restricted
    //   otherwise             -> /(tabs)
    const t = setTimeout(() => router.replace("/(auth)/sign-in"), 900);
    return () => clearTimeout(t);
  }, [router]);

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
