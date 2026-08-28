import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";

import { useCart } from "../../providers/CartProvider";
import { ScreenHeader } from "../../components/screen-header";

/**
 * Checkout — and the one auth gate in the whole app.
 *
 * ── The gate is a modal, not a redirect ──────────────────────────────────
 *
 * `/checkout` stays the current route while `(auth)/sign-in` is presented over
 * it. So a reload mid-sign-in returns here rather than to the home screen, and
 * no route in this app has "send unauthenticated users elsewhere" as its job.
 * That is what removes two of the eight refresh-to-home causes structurally.
 *
 * ── One gate, at the last possible moment ────────────────────────────────
 *
 * Not at add-to-cart. A gate there loses the basket AND the customer at the
 * exact moment they decided to buy something; here the basket already exists
 * and merges into the account on sign-in.
 *
 * Placing the order is the next slice, and it is genuinely blocked: the pricing
 * questions are settled, but order placement needs the payments-quote work so
 * the amount charged and the orders written cannot disagree.
 */
export default function CheckoutScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const cart = useCart();

  useEffect(() => {
    // Present sign-in as soon as we know they are signed out. Waiting for a tap
    // would show a checkout they cannot use.
    if (isLoaded && !isSignedIn) {
      router.push("/(auth)/sign-in");
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    // Deliberately not a redirect: `isLoaded === false` means "we do not know
    // yet", and navigating on it is the same loading-vs-absent mistake that
    // caused the refresh bug.
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Checkout" showCart={false} />
      </SafeAreaView>
    );
  }

  if (!isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Checkout" showCart={false} />
        <View className="gap-space-4 px-screen py-space-8 items-center">
          <Text size="lg" weight="semibold" className="text-center">
            Sign in to place your order
          </Text>
          <Text variant="muted" size="sm" className="text-center">
            Your basket is saved and comes with you.
          </Text>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Signed in, but the backend has no row for them. The Clerk webhook is the
  // ONLY thing that creates a customer's `users` row — there is no
  // self-provisioning mutation anywhere in the backend — so this is a real
  // state, and without this branch it presents as an empty basket and failing
  // taps with no explanation at all.
  if (cart.accountMissing) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Checkout" showCart={false} />
        <View className="gap-space-4 px-screen py-space-8 items-center">
          <Text size="lg" weight="semibold" className="text-center">
            Setting up your account
          </Text>
          <Text variant="muted" size="sm" className="text-center">
            This usually takes a moment. If it persists, contact support — your
            basket is safe.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Checkout" showCart={false} />
      <View className="gap-space-4 px-screen py-space-8 items-center">
        <Text size="lg" weight="semibold" className="text-center">
          Almost there
        </Text>
        <Text variant="muted" size="sm" className="text-center">
          Placing orders is the next slice. It needs the payment-quote work
          first, so the amount charged and the order written can never disagree.
        </Text>
        <Button
          variant="outline"
          label="Back to basket"
          onPress={() => router.replace("/cart")}
        />
      </View>
    </SafeAreaView>
  );
}
