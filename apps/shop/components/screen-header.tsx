import { Platform, Pressable, Text as RNText, View } from "react-native";
import { router } from "expo-router";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon } from "./icon";

/**
 * The plain header for every screen except Home and Profile.
 *
 * `BrandHeader`'s yellow band is the identity surface — reserved for the two
 * screens that are meant to feel like the app's "home base". Everywhere else
 * (order details, product pages, checkout, the address book, ...) gets a
 * standard back-arrow-and-title header instead: white/card surface, a
 * hairline instead of a shadow, no sweep. This is what most apps use for a
 * pushed screen, and it reads calmer across the ~20 screens that don't need
 * to reassert the brand every time.
 *
 * `right` is an open slot rather than a fixed `showCart` boolean: different
 * screens want different things there (a cart, a share button, nothing), and
 * a slot means a screen can pass exactly what it needs instead of the header
 * growing a new boolean prop per screen that wants something new.
 */
export function ScreenHeader({
  title,
  eyebrow,
  code,
  subtitle,
  meta,
  showBack = true,
  right,
}: {
  title: string;
  eyebrow?: string;
  /**
   * An identifier shown between the eyebrow and the title — an order
   * reference. Monospace and truncated in the middle, because both ends of a
   * reference are what a customer reads out to support.
   */
  code?: string;
  subtitle?: string;
  /** Baseline-aligned beside the title — an item count, never both with `subtitle`. */
  meta?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View
      className={`bg-card border-b-hairline border-hairline-soft px-screen gap-space-3 flex-row ${
        // Three lines do not fit the fixed 52px, so a header carrying a code
        // grows to its content. Every other header keeps its exact height.
        code
          ? "min-h-control-lg py-space-4 items-start"
          : "h-control-lg items-center"
      }`}
    >
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="size-control-sm rounded-pill items-center justify-center bg-gray-200 active:opacity-90"
        >
          <Icon name="chevron-back" size={18} tone="neutralIcon" />
        </Pressable>
      ) : null}

      <View className="gap-space-1 flex-1 shrink">
        {eyebrow ? (
          <Text
            size="caption"
            variant="muted"
            weight="semibold"
            className="tracking-label uppercase"
          >
            {eyebrow}
          </Text>
        ) : null}
        {code ? (
          <RNText
            numberOfLines={1}
            ellipsizeMode="middle"
            selectable
            className="text-muted-foreground text-[13px] leading-[18px] font-bold"
            style={{
              fontFamily: Platform.select({
                ios: "Menlo",
                android: "monospace",
                default: "monospace",
              }),
            }}
          >
            {code}
          </RNText>
        ) : null}
        <View className="gap-space-3 flex-row items-baseline justify-between">
          {/*
            h3 on a pushed screen, where the back chip already carries visual
            weight and a title beside it reads as a label. A root/tab screen
            (Wishlist, Orders — no back chip at all) has nothing else in the
            header to anchor it, so the same size reads small for what is
            meant to be the screen's own name; h2 matches the size Profile's
            BrandHeader already uses for the same "root screen title" role.
          */}
          <Text
            size={showBack ? "h3" : "h2"}
            weight="bold"
            numberOfLines={1}
            className="text-strong shrink"
          >
            {title}
          </Text>
          {meta ? (
            <Text size="caption" variant="subtle">
              {meta}
            </Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text size="sm" variant="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}
