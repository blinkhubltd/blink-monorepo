import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Icon } from "../../components/icon";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { BrandHeader } from "../../components/brand-header";
import { MenuRow, MenuSection } from "../../components/menu-list";
import { useCart } from "../../providers/CartProvider";
import { useAddressLabel } from "../../lib/use-address-label";
import { initialsOf } from "../../lib/initials";
import {
  LEGAL_DOC_META,
  isLegalConfigured,
  legalUrl,
  type LegalDoc,
} from "../../lib/legal";
import { openExternal } from "../../lib/open-external";

/**
 * Profile.
 *
 * ── The side drawer's contents live here ─────────────────────────────────
 *
 * The app this replaces had a `SideDrawer` mounted as a sibling of the navigator
 * — global UI state invisible to the URL, so it could not be deep-linked or
 * restored on a reload, and it competed with the router as a second navigation
 * system. Its links are these rows, on a real route.
 *
 * ── Identity sits ON the brand band, not under it ────────────────────────
 *
 * Matching the design: the yellow band carries the title, the avatar, the
 * name and email, and the delivery pill; the grouped lists start below it on
 * the page background. That is why `BrandHeader` takes children — the block
 * belongs to the band, and rendering it underneath would read as the first
 * card of the list rather than as who you are signed in as.
 *
 * ── "Where you are now" is gone, deliberately ────────────────────────────
 *
 * It was a row that looked like navigation and went nowhere: it re-requested
 * GPS and printed raw coordinates. The delivery pill in the header answers
 * the same question in words and leads somewhere useful, and the location
 * permission itself now lives in Settings, where a permission belongs.
 *
 * ── Signing out is ordered deliberately ──────────────────────────────────
 *
 * The rider app documents the same lesson: deregister and clean up BEFORE
 * revoking the session, because after `signOut()` the calls that need a token
 * will fail. Here that means clearing the server basket reference first.
 */
export default function ProfileScreen() {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const cart = useCart();
  const { label: addressLabel } = useAddressLabel();

  const [linkFailed, setLinkFailed] = useState(false);
  const [linkUnconfigured, setLinkUnconfigured] = useState(false);

  async function openLegal(doc: LegalDoc) {
    // Checked before attempting to open, not after — a `.invalid` placeholder
    // URL still "succeeds" by openExternal's own contract (the browser tab
    // does launch), so waiting for the open to fail would never catch this.
    if (!isLegalConfigured()) {
      setLinkUnconfigured(true);
      setLinkFailed(false);
      return;
    }
    setLinkUnconfigured(false);
    setLinkFailed(!(await openExternal(legalUrl(doc))));
  }

  const access = useQuery(
    api.user.access.getMyAccess,
    isSignedIn ? {} : "skip",
  );
  const orders = useQuery(
    api.data.orders.getMyOrders,
    isSignedIn ? { limit: 1 } : "skip",
  );
  const addresses = useQuery(
    api.data.addresses.getMyAddresses,
    isSignedIn ? {} : "skip",
  );
  const wishlist = useQuery(api.data.wishlist.getMyWishlist, {});
  // Null while in flight, so the row shows nothing rather than "Nothing saved
  // yet" — which reads as an answer and is the same loading-vs-absent slip the
  // wishlist heart used to make.
  const savedCount = wishlist ? wishlist.productIds.length : null;
  const unread = useQuery(api.data.user_notifications.getMyUnreadCount, {});
  // Null for the great majority of customers, who are not agents. The row is
  // hidden rather than shown-and-empty: an "Agent" entry that explains it does
  // not apply to you is noise on every profile.
  const agent = useQuery(api.data.marketing.getMyAgentSummary, {});

  if (!isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <BrandHeader
          title="Profile"
          titleSize="h2"
          sweep
          showCart={false}
          showBack={false}
        />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Icon name="person-outline" size={40} tone="subtle" />
          <View className="gap-space-2">
            <Text size="lg" weight="semibold" className="text-center">
              Sign in to your account
            </Text>
            <Text variant="muted" size="sm" className="text-center">
              Browsing works without an account. Sign in to check out, track
              orders and save addresses.
            </Text>
          </View>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName ?? user?.firstName ?? "";
  const initials = initialsOf(name, email);

  const addressMeta =
    addresses === undefined
      ? undefined
      : addresses.length === 0
        ? "None saved yet"
        : addresses
            .slice(0, 3)
            .map((a) => a.label)
            .join(" · ");

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <BrandHeader
        title="Profile"
        titleSize="h2"
        inlineTitle
        sweep
        showBack={false}
        right={
          <HeaderPill
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push("/settings")}
          />
        }
      >
        <View className="gap-space-3 flex-row items-center">
          {user?.imageUrl ? (
            <OptimizedImage
              source={{ uri: user.imageUrl }}
              contentFit="cover"
              className="size-[56px] rounded-pill"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className="bg-on-brand-pill size-[56px] rounded-pill items-center justify-center">
              <Text size="h4" weight="bold" className="text-primary">
                {initials}
              </Text>
            </View>
          )}

          <View className="flex-1">
            <Text
              variant="onBrand"
              size="h4"
              weight="bold"
              numberOfLines={1}
            >
              {name || "Add your name"}
            </Text>
            <Text variant="onBrand" size="sm" numberOfLines={1}>
              {email}
            </Text>
          </View>

          <HeaderPill
            icon="pencil"
            label="Edit profile"
            onPress={() => router.push("/edit-profile")}
          />
        </View>

        <Pressable
          onPress={() => router.push("/addresses")}
          accessibilityRole="button"
          accessibilityLabel={`Delivering to ${addressLabel}. Change.`}
          className="bg-card gap-space-2 px-space-3 py-space-3 rounded-md flex-row items-center active:opacity-90"
        >
          <Icon name="location" size={16} tone="strong" />
          <Text size="sm" numberOfLines={1} className="flex-1">
            Delivering to{" "}
            <Text size="sm" weight="semibold">
              {addressLabel}
            </Text>
          </Text>
          <Text size="sm" weight="semibold">
            Change
          </Text>
        </Pressable>
      </BrandHeader>

      <ScrollView contentContainerClassName="px-screen gap-space-5 py-space-4 pb-space-10">
        {/*
          Surfaced rather than swallowed: a signed-in customer with no `users`
          row cannot check out, and the Clerk webhook is the only thing that
          creates one. The old app showed nothing and the basket simply read as
          empty.
        */}
        {cart.accountMissing ? (
          <View className="bg-warning-soft gap-space-1 p-space-4 rounded-lg">
            <Text size="sm" weight="semibold">
              Your account is still being set up
            </Text>
            <Text size="sm">
              You can browse, but checkout will not work until this finishes. If
              it persists, contact support.
            </Text>
          </View>
        ) : null}

        <MenuSection title="Your shopping">
          <MenuRow
            first
            icon="cube-outline"
            label="Your orders"
            meta={
              orders && orders.length > 0
                ? "Track and reorder"
                : "No orders yet"
            }
            onPress={() => router.push("/orders")}
          />
          <MenuRow
            icon="basket-outline"
            label="My cart"
            meta={
              cart.loading
                ? undefined
                : cart.count === 0
                  ? "Nothing in it yet"
                  : `${cart.count} ${cart.count === 1 ? "item" : "items"}`
            }
            onPress={() => router.push("/cart")}
          />
          <MenuRow
            icon="heart-outline"
            label="Wishlist"
            meta={
              savedCount === null
                ? undefined
                : savedCount === 0
                  ? "Nothing saved yet"
                  : `${savedCount} ${savedCount === 1 ? "item" : "items"}`
            }
            onPress={() => router.push("/wishlist")}
          />
          <MenuRow
            icon="location-outline"
            label="Delivery addresses"
            meta={addressMeta}
            onPress={() => router.push("/addresses")}
          />
        </MenuSection>

        <MenuSection title="Account">
          <MenuRow
            first
            icon="notifications-outline"
            label="Notifications"
            meta="Order updates and offers"
            badge={unread ?? null}
            onPress={() => router.push("/notifications")}
          />
          <MenuRow
            icon="settings-outline"
            label="Settings"
            meta="Appearance, location, about"
            onPress={() => router.push("/settings")}
          />
          {/*
            Agents only. The agent programme is by arrangement — a customer
            who is not in it has nothing to do on that screen, and a row
            leading to "you are not an agent" is a dead end on every other
            profile. `getMyAgentSummary` returns null for everyone else.
          */}
          {agent ? (
            <MenuRow
              icon="briefcase-outline"
              label="Agent dashboard"
              meta={`Code ${agent.code}`}
              onPress={() => router.push("/agent")}
            />
          ) : null}
        </MenuSection>

        {/*
          Legal documents open on the website rather than being duplicated in the
          app: one copy, edited without a store release, so what the app links to
          cannot drift behind what the customer actually agreed to.
        */}
        <MenuSection title="About Blink">
          <MenuRow
            first
            external
            icon="document-text-outline"
            label={LEGAL_DOC_META.terms.title}
            meta="Review our terms of service"
            onPress={() => void openLegal("terms")}
          />
          <MenuRow
            external
            icon="shield-checkmark-outline"
            label={LEGAL_DOC_META.privacy.title}
            meta="Review our privacy policy"
            onPress={() => void openLegal("privacy")}
          />
          <MenuRow
            external
            icon="reader-outline"
            label={LEGAL_DOC_META.eula.title}
            meta="Review our licence terms"
            onPress={() => void openLegal("eula")}
          />
        </MenuSection>

        {linkUnconfigured ? (
          <Text size="caption" variant="destructive">
            Legal documents aren&apos;t available in this build yet.
          </Text>
        ) : null}

        {linkFailed ? (
          <Text size="caption" variant="destructive">
            Could not open your browser.
          </Text>
        ) : null}

        <Pressable
          onPress={() => {
            // Clear local basket state before revoking the session: after
            // signOut the token is gone and anything needing it fails.
            cart.dismissWriteError();
            void signOut();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          className="gap-space-2 -ml-space-2 px-space-2 min-h-control flex-row items-center self-start active:opacity-70"
        >
          <Icon name="log-out-outline" size={17} tone="destructive" />
          <Text size="base" weight="semibold" variant="destructive">
            Sign out
          </Text>
        </Pressable>

        {/*
          The version, and the role when there is one. The design shows only
          the version; the role line is kept because it is what staff and
          support read back when an account behaves unexpectedly, and it
          costs one muted line on a screen nobody scrolls to twice.
        */}
        <View className="gap-space-1">
          <Text size="caption" variant="subtle">
            Blink v{Constants.expoConfig?.version ?? "—"}
          </Text>
          {access && "roleName" in access && access.roleName ? (
            <Text size="caption" variant="subtle">
              Signed in as {access.roleName}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * An ink circle on the brand band — the same control as the header's back
 * button, which is why the geometry matches it rather than the 36px chips in
 * the lists below.
 */
function HeaderPill({
  icon,
  label,
  onPress,
}: {
  icon: "settings-outline" | "pencil";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="size-control rounded-pill bg-on-brand-pill items-center justify-center active:opacity-90"
    >
      <Icon name={icon} size={18} tone="onBrandPill" />
    </Pressable>
  );
}
