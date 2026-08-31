import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import {
  ChevronRight,
  Crosshair,
  ExternalLink,
  FileText,
  Heart,
  MapPin,
  Package,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Avatar } from "@repo/mobile-ui/components/ui/avatar";

import { ScreenHeader } from "../../components/screen-header";
import { useCart } from "../../providers/CartProvider";
import { useLocation } from "../../providers/LocationProvider";
import {
  LEGAL_DOC_META,
  legalBaseUrl,
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
  const { point, request } = useLocation();

  const [linkFailed, setLinkFailed] = useState(false);

  async function openLegal(doc: LegalDoc) {
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

  if (!isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Profile" showCart={false} />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <UserIcon size={40} color="#818A99" />
          <Text size="lg" weight="semibold" className="text-center">
            Sign in to your account
          </Text>
          <Text variant="muted" size="sm" className="text-center">
            Browsing works without an account. Sign in to check out, track
            orders and save addresses.
          </Text>
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
  const initial = (name || email || "?").charAt(0).toUpperCase();

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Profile" showCart={false} />

      <ScrollView contentContainerClassName="px-screen gap-space-5 pb-space-10">
        <View className="gap-space-3 flex-row items-center">
          {/* The primitive renders the initial itself; no children needed. */}
          <Avatar uri={user?.imageUrl} fallback={initial} />
          <View className="gap-space-1 flex-1">
            {name ? (
              <Text size="base" weight="semibold">
                {name}
              </Text>
            ) : null}
            <Text size="sm" variant="muted" numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>

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

        <View className="border-hairline border-border bg-card rounded-lg">
          <Row
            icon={<Package size={20} color="#5A6372" />}
            label="Your orders"
            detail={
              orders && orders.length > 0
                ? "Track and review past orders"
                : "No orders yet"
            }
            onPress={() => router.push("/orders")}
          />
          <Separator />
          <Row
            icon={<MapPin size={20} color="#5A6372" />}
            label="Delivery addresses"
            detail={
              addresses === undefined
                ? undefined
                : addresses.length === 0
                  ? "None saved yet"
                  : (addresses.find((a) => a.is_default)?.label ??
                    `${addresses.length} saved`)
            }
            onPress={() => router.push("/addresses")}
          />
          <Separator />
          <Row
            icon={<Crosshair size={20} color="#5A6372" />}
            label="Where you are now"
            detail={
              point
                ? `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`
                : "Not set — used to pick which shops to show"
            }
            onPress={() => void request()}
          />
          <Separator />
          <Row
            icon={<Heart size={20} color="#5A6372" />}
            label="Saved items"
            detail={
              savedCount === null
                ? undefined
                : savedCount === 0
                  ? "Nothing saved yet"
                  : `${savedCount} ${savedCount === 1 ? "item" : "items"}`
            }
            onPress={() => router.push("/saved")}
          />
        </View>

        {/*
          Legal documents open on the website rather than being duplicated in the
          app: one copy, edited without a store release, so what the app links to
          cannot drift behind what the customer actually agreed to.
        */}
        <View className="border-hairline border-border bg-card rounded-lg">
          <Row
            icon={<FileText size={20} color="#5A6372" />}
            label={LEGAL_DOC_META.terms.title}
            detail="Opens the website"
            external
            onPress={() => void openLegal("terms")}
          />
          <Separator />
          <Row
            icon={<ShieldCheck size={20} color="#5A6372" />}
            label={LEGAL_DOC_META.privacy.title}
            detail="Opens the website"
            external
            onPress={() => void openLegal("privacy")}
          />
        </View>

        {linkFailed ? (
          <Text size="caption" variant="destructive">
            Could not open your browser. The documents are at {legalBaseUrl()}.
          </Text>
        ) : null}

        {access && "roleName" in access && access.roleName ? (
          <Text size="caption" variant="subtle">
            Signed in as {access.roleName}
          </Text>
        ) : null}

        <Button
          variant="outline"
          label="Sign out"
          onPress={() => {
            // Clear local basket state before revoking the session: after
            // signOut the token is gone and anything needing it fails.
            cart.dismissWriteError();
            void signOut();
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  detail,
  onPress,
  muted = false,
  external = false,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  onPress: () => void;
  muted?: boolean;
  /** Leaves the app. Announced, and marked with a different affordance. */
  external?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? "link" : "button"}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityHint={external ? "Opens in your browser" : undefined}
      className="min-h-control gap-space-3 px-space-4 py-space-4 active:bg-muted flex-row items-center"
    >
      {icon}
      <View className="gap-space-1 flex-1">
        <Text size="sm" weight="medium" variant={muted ? "subtle" : "default"}>
          {label}
        </Text>
        {detail ? (
          <Text size="caption" variant="subtle" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {external ? (
        <ExternalLink size={16} color="#818A99" />
      ) : (
        <ChevronRight size={18} color="#818A99" />
      )}
    </Pressable>
  );
}
