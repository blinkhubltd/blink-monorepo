import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon } from "./icon";
import { CartIconButton } from "./cart-icon-button";
import { SearchIconButton } from "./search-icon-button";
import { Logo } from "./logo";
import { DeliveryBadge } from "./delivery-badge";
import { useLocation } from "../providers/LocationProvider";

/**
 * The header on every screen: the yellow band from the app this replaces.
 *
 * Replaces three components that had drifted apart — `ShopHeader` (location
 * pill, bell, cart, search), `ScreenHeader` (back, optional cart, eyebrow, h1)
 * and `ProductsHeader` (back, cart, required eyebrow, h3, a count) — which all
 * rendered the same skeleton (a left affordance, a title block, a right cluster
 * of controls) and differed only in props. `ProductsHeader` had already lost its
 * cart badge through that drift; converging onto one component is what stops
 * the next one from doing the same.
 *
 * ── Why every screen is the brand surface, not just Home/Wishlist/Orders ───
 *
 * `global.css` already commits to this: "the yellow header sweep is a
 * component, not a page mode." The app this replaces used the yellow band on
 * every header its own research turned up bar one exception — a plain header
 * on Profile — and even that one is a single row with no back affordance, which
 * this component does not attempt to special-case. Rather than guess which of
 * twenty-odd pushed screens deserve an exception with no further evidence of
 * which, this applies uniformly, which is also what keeps `check-types` able to
 * catch every missed prop across the migration in one pass.
 *
 * ── The left slot has three states, not two ───────────────────────────────
 *
 * `showLocation` (Home only) beats `showBack`, which beats neither (an empty
 * spacer, for the three other tabs, where there is nothing to go back to and no
 * location concept). This is deliberately three named booleans rather than a
 * `variant: "root" | "pushed"` enum: only Home has a location pill, while
 * Wishlist/Orders/Profile are equally "root" screens with no back button and no
 * location pill — an enum with two values cannot express that third case
 * without smuggling a fourth back in.
 *
 * ── Every header renders its own StatusBar override ────────────────────────
 *
 * `app/_layout.tsx` sets the bar from the active colour scheme, but light glyphs
 * on `#ffc50b` are unreadable regardless of scheme. Doing it here means it
 * cannot be forgotten on any one of the twenty-odd call sites.
 *
 * ── `title` is optional, and `logoRow` is what Home uses instead ───────────
 *
 * Matching the Home screen design (Claude Design canvas, `AppHome.dc.html`):
 * its header carries no title at all — the "What are you shopping for today?"
 * heading lives in the body, on the plain background, not on the yellow band.
 * In its place, Home's header shows the real Blink wordmark and a "10 minutes
 * delivery" badge. `logoRow` is that second row; it and the title block are
 * mutually exclusive in practice, but not enforced as such structurally,
 * since nothing stops a future screen from wanting neither.
 *
 * There is no header bell any more, either — the design's own header has none
 * in any mode, only search and cart. Notifications stay reachable from
 * Profile's own row, which already exists.
 */
export function BrandHeader({
  title,
  eyebrow,
  subtitle,
  meta,
  titleSize = "h1",
  sweep = false,
  showBack = true,
  showLocation = false,
  showSearchButton = false,
  showCart = true,
  logoRow = false,
}: {
  /** Omit entirely on a screen using `logoRow` instead. */
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  /** Baseline-aligned beside the title — an item count, never both with `subtitle`. */
  meta?: string;
  titleSize?: "h1" | "h3";
  /** The rounded bottom sweep — Home only, the signature shape. */
  sweep?: boolean;
  showBack?: boolean;
  /** The delivery-location pill, in the left slot instead of a back button. Home only. */
  showLocation?: boolean;
  /** The search icon button, beside cart. Home only, for now. */
  showSearchButton?: boolean;
  showCart?: boolean;
  /** The wordmark + delivery-time badge row, in place of the title block. Home only. */
  logoRow?: boolean;
}) {
  const { point, denied, requesting, request } = useLocation();

  const locationLabel = point
    ? // Coordinates until reverse geocoding lands. Deliberately not faked as a
      // street name: showing a plausible wrong address is worse than showing a
      // precise unfriendly one.
      `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`
    : denied
      ? "Set your location"
      : requesting
        ? "Finding you…"
        : "Set your location";

  return (
    <View
      className={`bg-brand-surface px-screen pt-space-3 gap-space-3 ${
        sweep ? "rounded-b-2xl pb-space-6" : "pb-space-4"
      }`}
    >
      <StatusBar style="dark" />

      <View className="min-h-control flex-row items-center justify-between">
        {showLocation ? (
          <Pressable
            onPress={() => void request()}
            accessibilityRole="button"
            accessibilityLabel={`Delivery location: ${locationLabel}. Tap to change.`}
            className="min-h-control gap-space-2 rounded-pill bg-on-brand-pill px-space-4 shrink flex-row items-center active:opacity-90"
          >
            <Icon name="location-outline" size={16} tone="onBrandPill" />
            <Text
              size="sm"
              weight="medium"
              numberOfLines={1}
              className="text-on-brand-pill-foreground shrink"
            >
              {locationLabel}
            </Text>
            <Icon name="chevron-down" size={16} tone="onBrandPill" />
          </Pressable>
        ) : showBack ? (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="size-control rounded-pill bg-on-brand-pill items-center justify-center active:opacity-90"
          >
            <Icon name="chevron-back" size={22} tone="onBrandPill" />
          </Pressable>
        ) : (
          // A spacer, so `justify-between` still pins the right cluster to the
          // edge rather than pulling it across to the left.
          <View />
        )}

        <View className="gap-space-2 flex-row items-center">
          {showSearchButton ? <SearchIconButton /> : null}
          {showCart ? <CartIconButton /> : null}
        </View>
      </View>

      {title ? (
        <View className="gap-space-1">
          {eyebrow ? (
            <Text
              variant="onBrand"
              size="caption"
              weight="semibold"
              className="uppercase tracking-label opacity-70"
            >
              {eyebrow}
            </Text>
          ) : null}
          <View className="gap-space-3 flex-row items-baseline justify-between">
            <Text
              variant="onBrand"
              size={titleSize}
              weight="bold"
              numberOfLines={1}
              className="shrink"
            >
              {title}
            </Text>
            {meta ? (
              <Text variant="onBrand" size="caption" className="opacity-70">
                {meta}
              </Text>
            ) : null}
          </View>
          {subtitle ? (
            <Text variant="onBrand" size="sm" className="opacity-80">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}

      {logoRow ? (
        <View className="flex-row items-center justify-between px-[2px] py-[2px]">
          <Logo height={30} />
          <DeliveryBadge />
        </View>
      ) : null}
    </View>
  );
}
