import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useAuth } from "@clerk/clerk-expo";

import { ScreenHeader } from "../components/screen-header";
import { MenuRow, MenuSection } from "../components/menu-list";
import { Icon } from "../components/icon";
import { useLocation } from "../providers/LocationProvider";
import { useToast } from "../providers/ToastProvider";
import { useReverseGeocode } from "../lib/use-reverse-geocode";
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
 * The design's placeholder copy for this screen was "Language, payments,
 * privacy". None of those three is a real setting in this app today and a
 * row that does nothing is worse than an absent one:
 *
 *   - Language: the app ships one language. There is no i18n layer, so a
 *     picker would list English and change nothing.
 *   - Payments: cards are never stored by us. Paystack collects them per
 *     transaction at checkout, so there is no saved instrument to manage.
 *   - Notifications: the shop app does not register a push token at all —
 *     `expo-notifications` is not wired up here, and `users.notifications`
 *     is written by nothing and read by nothing. A toggle would be a switch
 *     connected to no wire. The notification INBOX is a separate screen and
 *     is linked from Profile.
 *
 * What is here is what actually takes effect.
 */
export default function SettingsScreen() {
  const { isSignedIn } = useAuth();
  const { point, denied, requesting, request } = useLocation();
  const geocoded = useReverseGeocode(point);
  const toast = useToast();

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

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Settings" />

      <ScrollView contentContainerClassName="px-screen gap-space-5 py-space-4 pb-space-10">
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
      </ScrollView>
    </SafeAreaView>
  );
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
