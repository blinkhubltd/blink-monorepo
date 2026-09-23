import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon } from "./icon";
import { CartIconButton } from "./cart-icon-button";
import { SearchIconButton } from "./search-icon-button";
import { Logo } from "./logo";
import { DeliveryBadge } from "./delivery-badge";
import { useAddressLabel } from "../lib/use-address-label";

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
  right,
  children,
  inlineTitle = false,
  fillStatusBar = false,
}: {
  /** Omit entirely on a screen using `logoRow` instead. */
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  /** Baseline-aligned beside the title — an item count, never both with `subtitle`. */
  meta?: string;
  titleSize?: "h1" | "h2" | "h3";
  /**
   * The rounded bottom sweep — the signature shape.
   *
   * Off on Home, and deliberately: the banner rail sits directly below the
   * band there and carries the sweep itself, so the two read as one yellow
   * shape at rest. A rounded corner is transparent, so leaving it here would
   * cut two notches of page background into that join.
   */
  sweep?: boolean;
  showBack?: boolean;
  /** The delivery-location pill, in the left slot instead of a back button. Home only. */
  showLocation?: boolean;
  /** The search icon button, beside cart. Home only, for now. */
  showSearchButton?: boolean;
  showCart?: boolean;
  /** The wordmark + delivery-time badge row, in place of the title block. Home only. */
  logoRow?: boolean;
  /**
   * Replaces the default right-hand cluster (search, cart) on a screen whose
   * header control is something else — Profile puts Settings there.
   */
  right?: React.ReactNode;
  /**
   * Extra rows inside the yellow band, below the title. Profile's identity
   * block and delivery pill ride here so they sit on the brand surface,
   * rather than reading as the first rows of the page beneath it.
   */
  children?: React.ReactNode;
  /**
   * Put the title in the top row, beside the right-hand control, instead of
   * on its own line beneath it.
   *
   * Profile's design does this: "Profile" and the Settings pill share a
   * baseline. It only makes sense on a screen with nothing in the left slot
   * — with a back button or a location pill there, the title would be a
   * third thing competing for the same row — so it is ignored unless both
   * are off.
   */
  inlineTitle?: boolean;
  /**
   * Run the yellow up behind the status bar instead of stopping below it.
   *
   * Home and Profile only. They are the two screens whose header IS the
   * screen's top — a white strip of inset above the band cuts the brand
   * surface off from the edge of the display and reads as a seam. Everywhere
   * else the band belongs to a pushed screen, where the inset above it is
   * the page, and filling it would be wrong.
   *
   * The screen must stop claiming the top inset itself when this is on
   * (`edges={["left","right"]}` rather than `["top"]}`), or the inset is
   * applied twice: once as white padding above, and again here.
   */
  fillStatusBar?: boolean;
}) {
  const { label: locationLabel, state: locationState } = useAddressLabel();
  const insets = useSafeAreaInsets();

  // Only when the left slot is genuinely empty; see the prop's own note.
  const titleInRow = inlineTitle && !!title && !showBack && !showLocation;

  return (
    <View
      className={`bg-brand-surface px-screen ${
        fillStatusBar ? "" : "pt-[14px]"
      } ${sweep ? "rounded-b-2xl pb-[18px]" : "pb-space-4"}`}
      style={fillStatusBar ? { paddingTop: insets.top + 14 } : undefined}
    >
      <StatusBar style="dark" />

      {/*
        The rows that always stay. `gap` lives here rather than on the outer
        band so that the collapsing carousel below is not a gap sibling: a
        gap applies to a zero-height child too, which would leave a strip of
        empty yellow once the carousel has scrolled away.
      */}
      <View className="gap-space-5">
        <View
          className={`flex-row items-center ${showLocation ? "h-control-sm" : "h-control justify-between"}`}
        >
          {showLocation ? (
            <Pressable
              onPress={() => router.push("/addresses")}
              accessibilityRole="button"
              accessibilityLabel={`Delivery location: ${locationLabel}. Tap to change.`}
              className="h-control-sm gap-space-2 rounded-pill bg-card mr-space-4 flex-1 shrink flex-row items-center pr-[6px] pl-[10px] shadow-xs active:opacity-90"
            >
              <Icon
                name={locationState === "denied" ? "alert-circle" : "location"}
                size={locationState === "denied" ? 16 : 14}
                tone={locationState === "denied" ? "destructive" : "price"}
              />
              <Text size="sm" numberOfLines={1} className="shrink">
                {locationLabel}
              </Text>
              <View className="rounded-pill size-[20px] items-center justify-center bg-gray-200">
                <Icon name="chevron-down" size={12} tone="neutralIcon" />
              </View>
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
          ) : titleInRow ? (
            <Text
              variant="onBrand"
              size={titleSize}
              weight="bold"
              numberOfLines={1}
              className="shrink"
            >
              {title}
            </Text>
          ) : (
            // A spacer, so `justify-between` still pins the right cluster to the
            // edge rather than pulling it across to the left.
            <View />
          )}

          <View className="gap-space-2 flex-row items-center">
            {right ?? (
              <>
                {showSearchButton ? <SearchIconButton /> : null}
                {showCart ? <CartIconButton /> : null}
              </>
            )}
          </View>
        </View>

        {title && !titleInRow ? (
          <View className="gap-space-1">
            {eyebrow ? (
              <Text
                variant="onBrand"
                size="caption"
                weight="semibold"
                className="tracking-label uppercase opacity-70"
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
          <View className="flex-row items-center justify-between px-[2px] pt-[4px] pb-[2px]">
            <View className="shrink">
              <Logo />
            </View>
            <View className="shrink">
              <DeliveryBadge />
            </View>
          </View>
        ) : null}

        {children}
      </View>
    </View>
  );
}
