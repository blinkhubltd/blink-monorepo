import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Icon, type IconName } from "../../components/icon";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button, buttonVariants } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  buttonTextVariants,
} from "@repo/mobile-ui/components/ui/alert-dialog";

import { ScreenHeader } from "../../components/screen-header";
import { summariseAddress } from "../../lib/address";
import { useToast } from "../../providers/ToastProvider";

/**
 * A pill icon for the row, by what the label suggests — "Home"/"Work" get
 * their own glyph, anything else (an estate name, a friend's place) falls
 * back to a plain pin rather than guessing.
 */
function iconForLabel(label: string): IconName {
  const normalised = label.trim().toLowerCase();
  if (normalised === "home") return "home-outline";
  if (normalised === "work") return "briefcase-outline";
  return "location-outline";
}

/**
 * The address book.
 *
 * ── Why this screen had to exist before anything else remaining ──────────
 *
 * Checkout requires a saved address and, until this screen, offered "add one
 * from your profile" — where there was no such screen. A new customer could
 * browse, fill a basket, sign in, and then dead-end. The backend surface it
 * needed did not exist either: every address mutation took `clerkId` as an
 * argument, so shipping the screen against them would have handed every customer
 * the ability to edit every other customer's delivery address.
 *
 * ── Deleting asks, with an actual dialog ──────────────────────────────────
 *
 * Used to be a row state (swap the row for "Remove this address?" in place)
 * because `Alert.alert` is a no-op on web and this app runs there too. That
 * traded a real interruption for a subtle one — easy to misread as just
 * another row. `AlertDialog` (packages/mobile-ui, built on
 * `@rn-primitives/alert-dialog` through the app's `PortalHost`) is a genuine
 * centered, dimmed overlay and IS web-safe, so there is no reason left to
 * avoid it. One dialog instance below the list, controlled by `confirming`,
 * rather than one per row.
 */
export default function AddressBookScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const addresses = useQuery(
    api.data.addresses.getMyAddresses,
    isSignedIn ? {} : "skip",
  );
  const setDefault = useMutation(api.data.addresses.setMyDefaultAddress);
  const remove = useMutation(api.data.addresses.deleteMyAddress);
  const toast = useToast();

  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Delivery addresses" />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Text size="lg" weight="semibold" className="text-center">
            Sign in to save addresses
          </Text>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  async function run(
    label: string,
    action: () => Promise<unknown>,
    successMessage?: string,
  ) {
    setBusy(label);
    try {
      await action();
      setConfirming(null);
      if (successMessage) toast(successMessage);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "That did not work. Try again.",
        "destructive",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        title="Delivery addresses"
        subtitle={
          addresses
            ? `${addresses.length} saved`
            : undefined /* not "0 saved" while loading */
        }
      />

      <ScrollView contentContainerClassName="px-screen gap-space-4 pb-space-10">
        {addresses === undefined ? (
          <View className="gap-space-3">
            {Array.from({ length: 3 }, (_, i) => (
              <View
                key={i}
                className="border-hairline border-border gap-space-2 p-space-4 rounded-lg"
              >
                <Skeleton className="h-[15px] w-1/3 rounded-sm" />
                <Skeleton className="h-[13px] w-2/3 rounded-sm" />
              </View>
            ))}
          </View>
        ) : addresses.length === 0 ? (
          <View className="gap-space-4 py-space-8 items-center">
            <Icon name="location-outline" size={36} tone="subtle" />
            <Text size="lg" weight="semibold">
              No addresses yet
            </Text>
            <Text size="sm" variant="muted" className="text-center">
              Add where you would like your orders delivered. You can save
              several and choose at checkout.
            </Text>
          </View>
        ) : (
          addresses.map((address) => {
            const isBusy = busy === address.label;

            return (
              <View
                key={address.label}
                className="border-hairline border-border bg-card gap-space-3 p-space-4 rounded-lg"
              >
                <View className="gap-space-3 flex-row items-start">
                  <View className="bg-accent size-[40px] rounded-pill items-center justify-center">
                    <Icon name={iconForLabel(address.label)} size={18} tone="brand" />
                  </View>
                  <View className="gap-space-1 flex-1">
                    <View className="gap-space-2 flex-row items-center">
                      <Text size="base" weight="semibold">
                        {address.label}
                      </Text>
                      {address.is_default ? (
                        <Badge size="sm" variant="success" label="Default" />
                      ) : null}
                    </View>
                    <Text size="sm" variant="muted">
                      {summariseAddress(address.address)}
                    </Text>
                  </View>
                </View>

                <View className="border-t-hairline border-border gap-space-2 pt-space-3 flex-row items-center">
                  {!address.is_default ? (
                    <Button
                      size="sm"
                      variant="outline"
                      label="Make default"
                      loading={isBusy}
                      onPress={() =>
                        void run(
                          address.label,
                          () => setDefault({ label: address.label }),
                          "Default address updated",
                        )
                      }
                    />
                  ) : (
                    <View className="gap-space-1 flex-row items-center">
                      <Icon name="checkmark-circle" size={16} tone="success" />
                      <Text size="caption" variant="subtle">
                        Used unless you choose otherwise
                      </Text>
                    </View>
                  )}
                  <View className="flex-1" />
                  <Pressable
                    onPress={() => setConfirming(address.label)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${address.label}`}
                    hitSlop={8}
                    className="size-control-sm items-center justify-center rounded-md active:opacity-70"
                  >
                    <Icon name="trash-outline" size={18} tone="destructive" />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View className="border-hairline border-border bg-card px-screen py-space-4">
        <Button
          full
          size="cta"
          label="Add an address"
          onPress={() => router.push("/addresses/new")}
        />
      </View>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <View className="flex-row items-start justify-between">
              <AlertDialogTitle className="flex-1 pr-space-3">
                Delete this address?
              </AlertDialogTitle>
              <Pressable
                onPress={() => setConfirming(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <Icon name="close" size={20} tone="subtle" />
              </Pressable>
            </View>
            <AlertDialogDescription>
              “{confirming}” will be removed from your saved addresses. This
              can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={buttonVariants({ variant: "outline" })}>
              <Text className={buttonTextVariants({ variant: "outline" })}>
                Cancel
              </Text>
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onPress={() => {
                if (!confirming) return;
                void run(
                  confirming,
                  () => remove({ label: confirming }),
                  "Address removed",
                );
              }}
            >
              <Text className={buttonTextVariants({ variant: "destructive" })}>
                {busy === confirming ? "Deleting…" : "Delete"}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SafeAreaView>
  );
}
