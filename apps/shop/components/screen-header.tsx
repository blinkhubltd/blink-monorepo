import { Pressable, View } from "react-native";
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
  subtitle,
  meta,
  showBack = true,
  right,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** Baseline-aligned beside the title — an item count, never both with `subtitle`. */
  meta?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View className="bg-card border-b-hairline border-hairline-soft px-screen h-control-lg flex-row items-center gap-space-3">
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="size-control-sm rounded-pill bg-secondary items-center justify-center active:opacity-90"
        >
          <Icon name="chevron-back" size={18} tone="strong" />
        </Pressable>
      ) : (
        // A spacer, so a root screen's title still starts at the same inset
        // a pushed screen's does, rather than jumping left with no back chip.
        <View className="size-control-sm" />
      )}

      <View className="gap-space-1 flex-1 shrink">
        {eyebrow ? (
          <Text
            size="caption"
            variant="muted"
            weight="semibold"
            className="uppercase tracking-label"
          >
            {eyebrow}
          </Text>
        ) : null}
        <View className="gap-space-3 flex-row items-baseline justify-between">
          <Text
            size="h3"
            weight="bold"
            numberOfLines={1}
            className="shrink text-strong"
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
