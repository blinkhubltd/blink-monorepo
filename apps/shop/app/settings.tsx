import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { ScreenHeader } from "../components/screen-header";
import { MenuRow, MenuSection } from "../components/menu-list";
import { Icon } from "../components/icon";
import { useCart } from "../providers/CartProvider";
import { useLocation } from "../providers/LocationProvider";
import { useToast } from "../providers/ToastProvider";
import { useReverseGeocode } from "../lib/use-reverse-geocode";
import { initialsOf } from "../lib/initials";
import {
  describeTheme,
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from "../lib/theme-preference";

/**
 * Settings.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 *
 * The design's own rows for this screen included FAQs and a push-notification
 * toggle. Neither is real here yet:
 *
 *   - FAQs: there is no FAQ content anywhere in this app or its backend —
 *     the design's own prototype left the row's tap handler empty. A link to
 *     nothing is worse than no link.
 *   - Push notifications: `expo-notifications` is configured at the native
 *     level (app.config.ts carries the plugin, forwarded from the old app so
 *     the permission prompt exists), but nothing in this app requests a
 *     token or registers one — `data/push_tokens.ts`'s
 *     `registerMyPushToken` has no caller here. `apps/rider` has a complete,
 *     working reference (`providers/PushProvider.tsx`) this could be built
 *     from, but wiring it up is a real feature on its own — permission
 *     flow, token lifecycle, notification-tap routing — not a settings-row
 *     styling change, so it is left for that work rather than shipped here
 *     as a switch connected to nothing.
 *
 * Language and payments are the same story as before: one language ships,
 * and Paystack collects cards per transaction rather than this app storing
 * any. What IS here is what actually takes effect, including two things the
 * design asked for that turned out to be real: changing a password (Clerk
 * supports it; nothing in the app called it) and the support contact
 * (`platform_settings.support_url`, previously reachable only from order
 * tracking).
 */
export default function SettingsScreen() {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const cart = useCart();
  const { point, denied, requesting, request } = useLocation();
  const geocoded = useReverseGeocode(point);
  const toast = useToast();

  // Set by a super admin under the dashboard's Settings page. Null hides
  // the card — a support button that opens nothing is worse than none.
  const supportLink = useQuery(api.data.platform_settings.getSupportLink);

  // Read once: the stored value only changes through this screen, and
  // subscribing to NativeWind's scheme instead would report "dark" for
  // "system" on a dark phone, making the chosen option look wrong.
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);

  const chooseTheme = (next: ThemePreference) => {
    setTheme(next);
    setThemePreference(next);
  };

  const locationMeta = denied
    ? "Permission is off — tap to open the prompt again"
    : geocoded.loading
      ? "Finding you…"
      : (geocoded.address ??
        (point ? "Located" : "Not set — used to pick which shops to show"));

  const name = user?.fullName ?? user?.firstName ?? "";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Settings" />

      <ScrollView contentContainerClassName="px-screen gap-space-5 py-space-4 pb-space-10">
        {isSignedIn ? (
          <View className="border-hairline border-border bg-card gap-space-3 p-space-4 flex-row items-center rounded-lg">
            {user?.imageUrl ? (
              <OptimizedImage
                source={{ uri: user.imageUrl }}
                contentFit="cover"
                className="size-[48px] rounded-pill"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View className="bg-secondary size-[48px] rounded-pill items-center justify-center">
                <Text size="base" weight="bold" variant="muted">
                  {initialsOf(name, email)}
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Text size="sm" variant="muted">
                Welcome
              </Text>
              <Text size="base" weight="semibold" numberOfLines={1}>
                {name || email || "—"}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                // Same ordering as Profile's own sign-out: clear the local
                // basket reference before the token that authorised it is
                // revoked, not after.
                cart.dismissWriteError();
                void signOut();
              }}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              hitSlop={8}
              className="size-control items-center justify-center rounded-pill active:opacity-70"
            >
              <Icon name="log-out-outline" size={20} tone="subtle" />
            </Pressable>
          </View>
        ) : null}

        <MenuSection title="Appearance">
          {/*
            Three rows rather than a switch, because "system" is a real third
            choice and a two-state control cannot express it. The chosen row
            is marked rather than styled differently, so the list still reads
            as a list.
          */}
          <ThemeRow
            first
            icon="sunny-outline"
            label={describeTheme("light")}
            meta="The default"
            selected={theme === "light"}
            onPress={() => chooseTheme("light")}
          />
          <ThemeRow
            icon="moon-outline"
            label={describeTheme("dark")}
            selected={theme === "dark"}
            onPress={() => chooseTheme("dark")}
          />
          <ThemeRow
            icon="phone-portrait-outline"
            label={describeTheme("system")}
            meta="Follows your device setting"
            selected={theme === "system"}
            onPress={() => chooseTheme("system")}
          />
        </MenuSection>

        <MenuSection title="Location">
          <MenuRow
            first
            icon="locate-outline"
            label="Where you are now"
            meta={requesting ? "Asking…" : locationMeta}
            onPress={() => void request()}
          />
          <MenuRow
            icon="location-outline"
            label="Delivery addresses"
            meta="Where your orders go"
            onPress={() => router.push("/addresses")}
          />
        </MenuSection>

        {isSignedIn ? (
          <MenuSection title="Account">
            <MenuRow
              first
              icon="person-outline"
              label="Your details"
              meta="Name, phone and email"
              onPress={() => router.push("/edit-profile")}
            />
            <MenuRow
              icon="lock-closed-outline"
              label={user?.passwordEnabled ? "Change password" : "Set a password"}
              meta={
                user?.passwordEnabled
                  ? "Update your sign-in password"
                  : "Add a password as another way in"
              }
              onPress={() => router.push("/change-password")}
            />
            {/*
              Moved here from Profile, where the Agent dashboard row took its
              place. It is not decoration: `attributeMyRegistration` credits
              an agent at most once per account and needs a real customer to
              type the code, so this screen is the only way to credit an
              agent who handed their code over in person. Scanning their QR
              still deep-links straight to it.
            */}
            <MenuRow
              icon="gift-outline"
              label="Referral code"
              meta="Credit whoever signed you up"
              onPress={() => router.push("/referral")}
            />
          </MenuSection>
        ) : null}

        <MenuSection title="About">
          <MenuRow
            first
            icon="information-circle-outline"
            label="Version"
            meta={`Blink v${Constants.expoConfig?.version ?? "—"}`}
            onPress={() => {
              // Not navigation — this is the detail support asks for, and a
              // toast is easier to read out than a buried about screen.
              //
              // `runtimeVersion` is rendered only when it is a string:
              // app.config.ts sets it to `{ policy: "appVersion" }`, and an
              // object in a template literal prints "[object Object]".
              const runtime = Constants.expoConfig?.runtimeVersion;
              toast(
                [
                  `Blink v${Constants.expoConfig?.version ?? "—"}`,
                  typeof runtime === "string" ? `runtime ${runtime}` : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              );
            }}
          />
        </MenuSection>

        {supportLink ? (
          <View className="bg-accent gap-space-2 p-space-4 items-center rounded-lg">
            <Text size="sm" className="text-center">
              If you have any other query you can reach out to us.
            </Text>
            <Pressable
              onPress={() => void Linking.openURL(supportLink)}
              accessibilityRole="link"
              accessibilityLabel={describeSupportAction(supportLink)}
              hitSlop={8}
            >
              <Text size="sm" weight="semibold" className="underline">
                {describeSupportAction(supportLink)}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * How to name the support button, from the link's own scheme — "WhatsApp
 * us" reads very differently from "Call us", and the admin picks the
 * channel by picking the link, not by typing a label to go with it.
 */
function describeSupportAction(link: string): string {
  if (link.startsWith("tel:")) return "Call us";
  if (link.startsWith("mailto:")) return "Email us";
  if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(link)) {
    return "WhatsApp us";
  }
  return "Contact support";
}

/** A `MenuRow` whose trailing affordance is a selection mark, not a chevron. */
function ThemeRow({
  icon,
  label,
  meta,
  selected,
  onPress,
  first,
}: {
  icon: "sunny-outline" | "moon-outline" | "phone-portrait-outline";
  label: string;
  meta?: string;
  selected: boolean;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <View accessibilityRole="radio" accessibilityState={{ selected }}>
      <MenuRow
        first={first}
        icon={icon}
        label={label}
        meta={meta}
        onPress={onPress}
        right={
          selected ? (
            <Icon name="checkmark-circle" size={20} tone="success" />
          ) : (
            <View className="border-border size-[20px] rounded-pill border-2" />
          )
        }
      />
    </View>
  );
}
