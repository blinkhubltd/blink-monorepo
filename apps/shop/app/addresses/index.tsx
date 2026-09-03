import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Check, MapPin, Plus, Trash2 } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../../components/screen-header";
import { summariseAddress } from "../../lib/address";

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
 * ── Deleting asks, in place ──────────────────────────────────────────────
 *
 * `Alert.alert` is a no-op on web and this app runs there, so the confirmation
 * is a row state rather than a dialog: tapping Delete swaps the row for
 * "Remove this address?" with two buttons. It also keeps the thing being deleted
 * on screen while the question is asked, which a modal covers up.
 */
export default function AddressBookScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const addresses = useQuery(
    api.data.addresses.getMyAddresses,
    isSignedIn ? {} : "skip",
  );
  const setDefault = useMutation(api.data.addresses.setMyDefaultAddress);
  const remove = useMutation(api.data.addresses.deleteMyAddress);

  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Delivery addresses" showCart={false} />
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

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      setConfirming(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That did not work. Try again.",
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
        showCart={false}
      />

      <ScrollView contentContainerClassName="px-screen gap-space-4 pb-space-10">
        {error ? (
          <View className="bg-destructive-soft p-space-4 rounded-md">
            <Text size="sm" variant="destructive">
              {error}
            </Text>
          </View>
        ) : null}

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
            <MapPin size={36} color="#818A99" />
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
            const isConfirming = confirming === address.label;
            const isBusy = busy === address.label;

            return (
              <View
                key={address.label}
                className="border-hairline border-border bg-card gap-space-3 p-space-4 rounded-lg"
              >
                <View className="gap-space-3 flex-row items-start">
                  <MapPin size={18} color="#5A6372" />
                  <View className="gap-space-1 flex-1">
                    <View className="gap-space-2 flex-row items-center">
                      <Text size="base" weight="semibold">
                        {address.label}
                      </Text>
                      {address.is_default ? (
                        <Badge variant="success" label="Default" />
                      ) : null}
                    </View>
                    <Text size="sm" variant="muted">
                      {summariseAddress(address.address)}
                    </Text>
                  </View>
                </View>

                {isConfirming ? (
                  <View className="bg-warning-soft gap-space-3 p-space-3 rounded-md">
                    <Text size="sm" weight="semibold">
                      Remove this address?
                    </Text>
                    <Text size="caption">
                      Past orders keep it, so your delivery history stays
                      intact. You can add it again later.
                    </Text>
                    <View className="gap-space-2 flex-row">
                      <Button
                        size="sm"
                        variant="destructive"
                        label="Remove"
                        loading={isBusy}
                        onPress={() =>
                          void run(address.label, () =>
                            remove({ label: address.label }),
                          )
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        label="Keep it"
                        onPress={() => setConfirming(null)}
                      />
                    </View>
                  </View>
                ) : (
                  <View className="gap-space-2 flex-row items-center">
                    {!address.is_default ? (
                      <Button
                        size="sm"
                        variant="outline"
                        label="Make default"
                        loading={isBusy}
                        onPress={() =>
                          void run(address.label, () =>
                            setDefault({ label: address.label }),
                          )
                        }
                      />
                    ) : (
                      <View className="gap-space-1 flex-row items-center">
                        <Check size={14} color="#5A6372" />
                        <Text size="caption" variant="subtle">
                          Used unless you choose otherwise
                        </Text>
                      </View>
                    )}
                    <View className="flex-1" />
                    <Pressable
                      onPress={() => setConfirming(address.label)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${address.label}`}
                      hitSlop={8}
                      className="size-control-sm items-center justify-center rounded-md active:opacity-70"
                    >
                      <Trash2 size={18} color="#818A99" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <View className="border-hairline border-border bg-card px-screen py-space-4">
        <Button
          full
          size="lg"
          label="Add an address"
          icon={<Plus size={18} color="#0A0E16" />}
          onPress={() => router.push("/addresses/new")}
        />
      </View>
    </SafeAreaView>
  );
}
