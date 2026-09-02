import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Separator } from "@repo/mobile-ui/components/ui/separator";

import { ScreenHeader } from "../../components/screen-header";
import {
  AddressPicker,
  DeliveryAddressSection,
  DeliveryInstructionsSection,
  ReceiverSection,
  SectionCard,
  type AddressForDisplay,
} from "../../components/checkout/sections";
import { useLocation } from "../../providers/LocationProvider";
import {
  checkoutBlockers,
  distanceMetres,
  receiverRequirement,
  validateReceiver,
} from "../../lib/checkout-rules";
import { formatKES } from "../../lib/format";
import { isCardPaymentConfigured } from "../../lib/paystack-config";
import { useCardPayment } from "../../lib/use-card-payment";
import { LEGAL_DOC_META, legalUrl, type LegalDoc } from "../../lib/legal";
import { openExternal } from "../../lib/open-external";

/**
 * Clearance checkout. URL `/clearance/checkout`.
 *
 * ── The same spine as the regular checkout, deliberately ─────────────────
 *
 * Server quote, stored at initiation, replayed at order time; the 150m receiver
 * rule from the same pure module; the same address picker and the same phone
 * requirement. The old app had `clearance-checkout.tsx` as a separate 1,000-line
 * screen that computed its own prices and re-implemented its own address logic —
 * which is how the two flows came to disagree about what a delivery costs.
 *
 * ── The three real differences ───────────────────────────────────────────
 *
 *  1. Free delivery never applies. Clearance stock is already discounted, so
 *     waiving delivery on top erodes the margin twice. `buildClearanceQuote`
 *     takes no threshold, so this is structural rather than a condition.
 *  2. The basket is finite and short-dated, so a line can become unbuyable
 *     between the basket screen and this one. Those are listed, not hidden.
 *  3. No prescriptions: clearance listings carry no `requires_prescription`
 *     flag, so that gate is absent rather than always-passing.
 */
export default function ClearanceCheckoutScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { point } = useLocation();

  const [instructions, setInstructions] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [pickingAddress, setPickingAddress] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pendingReference, setPendingReference] = useState<string | null>(null);

  /*
    Clearance is paid up front, so this screen has no payment mode and no
    pay-on-delivery path at all — see `beginClearanceCheckout`, whose
    `paymentMode` is a single literal so the alternative is not expressible.
  */
  const cardConfigured = isCardPaymentConfigured();
  const card = useCardPayment({
    onSettled: (orderIds) => {
      const first = orderIds[0];
      router.replace(first ? `/order/${first}` : "/orders");
    },
  });

  const quoteResult = useQuery(
    api.data.clearance_checkout.quoteMyClearanceBasket,
    isSignedIn ? {} : "skip",
  );
  const addresses = useQuery(
    api.data.addresses.getMyAddresses,
    isSignedIn ? {} : "skip",
  );
  const access = useQuery(
    api.user.access.getMyAccess,
    isSignedIn ? {} : "skip",
  );
  const beginClearanceCheckout = useMutation(
    api.data.clearance_checkout.beginClearanceCheckout,
  );
  const recordAcceptance = useMutation(
    api.data.legal_acceptances.recordAcceptance,
  );

  useEffect(() => {
    // Presented over this URL rather than redirecting, so a reload stays here.
    if (isLoaded && !isSignedIn) router.push("/(auth)/sign-in");
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (selectedLabel || !addresses || addresses.length === 0) return;
    const preferred = addresses.find((a) => a.is_default) ?? addresses[0]!;
    setSelectedLabel(preferred.label);
  }, [addresses, selectedLabel]);

  const selectedAddress = useMemo<AddressForDisplay | null>(() => {
    if (!addresses || !selectedLabel) return null;
    return (
      (addresses.find((a) => a.label === selectedLabel) as
        AddressForDisplay | undefined) ?? null
    );
  }, [addresses, selectedLabel]);

  const receiver = receiverRequirement(
    distanceMetres(point, selectedAddress?.coordinates ?? null),
  );
  const receiverErrors = validateReceiver(
    receiverName,
    receiverPhone,
    receiver.required,
  );

  const storedPhone =
    access && "hasUser" in access && access.hasUser
      ? ((access as { phone?: string }).phone ?? "")
      : "";
  const hasPhone = storedPhone.trim().length > 0;

  const quote = quoteResult?.quote ?? null;

  const blockers = checkoutBlockers({
    hasQuote: !!quote,
    hasAddress: !!selectedAddress,
    hasPhone,
    receiverErrors,
    // Clearance listings have no prescription concept, so the gate is absent
    // rather than a condition that always passes.
    prescriptionStatus: "none",
  });

  async function place() {
    if (!selectedAddress || !quote) return;
    setPlacing(true);
    setFailure(null);

    const reference =
      pendingReference ??
      `CLR_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    setPendingReference(reference);

    try {
      await recordAcceptance({});

      const started = await beginClearanceCheckout({
        reference,
        paymentMode: "pay_now",
        expectedTotal: quote.total,
        fulfilment: {
          address: {
            street: selectedAddress.address?.address_1,
            address_1: selectedAddress.address?.address_1,
            address_2: selectedAddress.address?.address_2,
            city: selectedAddress.address?.city,
            country: selectedAddress.address?.country,
            // The address's own coordinates, not the device's.
            lat: selectedAddress.coordinates.lat,
            lng: selectedAddress.coordinates.lng,
          },
          receiverContact:
            receiver.required && receiverName.trim()
              ? { name: receiverName.trim(), phone: receiverPhone.trim() }
              : undefined,
          specialInstructions: instructions.trim() || undefined,
        },
      });

      /*
        The only path. Orders are written server-side once verification
        confirms the charge, and the hook's `onSettled` navigates; if this app
        never comes back the webhook settles it anyway. Stock is decremented
        there too, through the same shared writer the catalogue basket uses.
      */
      card.start({
        reference: started.reference,
        amount: started.amount,
        email: started.customerEmail,
      });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Could not place your order. Nothing has been charged.",
      );
    } finally {
      setPlacing(false);
    }
  }

  if (!isLoaded) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader eyebrow="Clearance" title="Checkout" showCart={false} />
      </SafeAreaView>
    );
  }

  if (!isSignedIn) {
    return (
      <Gate
        title="Sign in to place your order"
        body="Clearance stock is held against your account."
        action={{
          label: "Sign in",
          onPress: () => router.push("/(auth)/sign-in"),
        }}
      />
    );
  }

  if (quoteResult === undefined) {
    return <Gate title="Working out your total" body="One moment." />;
  }

  if (!quote) {
    return (
      <Gate
        title="Nothing to check out"
        body="Your clearance basket is empty, or nothing in it is still available."
        action={{
          label: "Back to deals",
          onPress: () => router.replace("/clearance"),
        }}
      />
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow="Clearance"
        title="Checkout"
        subtitle={`${quote.itemCount} ${quote.itemCount === 1 ? "item" : "items"}${
          quote.vendorCount > 1 ? ` · ${quote.vendorCount} deliveries` : ""
        }`}
        showCart={false}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="px-screen gap-space-4 pb-space-10"
          keyboardShouldPersistTaps="handled"
        >
          {pickingAddress ? (
            <SectionCard title="Choose an address">
              {addresses && addresses.length > 0 ? (
                <AddressPicker
                  addresses={addresses as AddressForDisplay[]}
                  selectedLabel={selectedLabel}
                  onSelect={(a) => {
                    setSelectedLabel(a.label);
                    setPickingAddress(false);
                  }}
                />
              ) : (
                <Text size="sm" variant="muted">
                  You have no saved addresses yet.
                </Text>
              )}
              <Button
                variant="outline"
                label="Add an address"
                onPress={() => router.push("/addresses/new")}
              />
            </SectionCard>
          ) : (
            <DeliveryAddressSection
              address={selectedAddress}
              onChange={() => setPickingAddress(true)}
            />
          )}

          {!hasPhone ? (
            <SectionCard title="A number we can reach you on">
              <Text size="sm" variant="muted">
                Add one from your profile — the rider will call it if they
                cannot find you.
              </Text>
              <Button
                variant="outline"
                label="Add your number"
                onPress={() => router.push("/edit-profile")}
              />
            </SectionCard>
          ) : null}

          <SectionCard title="Your deals">
            {quote.legs.map((leg, index) => (
              <View key={leg.vendorId} className="gap-space-2">
                {index > 0 ? <Separator /> : null}
                {quote.legs.length > 1 ? (
                  <Text size="caption" variant="eyebrow">
                    Delivery {index + 1}
                  </Text>
                ) : null}
                {leg.lines.map((line) => (
                  <View
                    key={line.productId}
                    className="gap-space-2 flex-row items-baseline justify-between"
                  >
                    <Text size="sm" numberOfLines={1} className="flex-1">
                      {line.quantity} × {line.name}
                    </Text>
                    <Text size="sm">{formatKES(line.lineTotal)}</Text>
                  </View>
                ))}
              </View>
            ))}

            <Separator />

            <Row label="Items" value={formatKES(quote.subtotal)} />
            <Row label="Delivery" value={formatKES(quote.deliveryFee)} />
            <View className="flex-row items-baseline justify-between">
              <Text size="base" weight="semibold">
                Total
              </Text>
              <Text variant="price" size="price">
                {formatKES(quote.total)}
              </Text>
            </View>
            {/*
              Stated, because a customer who has just seen free delivery on the
              catalogue basket will otherwise read this as a mistake.
            */}
            <Text size="caption" variant="subtle">
              Free delivery does not apply to clearance stock — these items are
              already discounted.
            </Text>
          </SectionCard>

          {/* Lines that became unbuyable since the basket screen. */}
          {quoteResult && quoteResult.unavailable.length > 0 ? (
            <View className="bg-warning-soft gap-space-1 p-space-4 rounded-md">
              <Text size="sm" weight="semibold">
                Not included
              </Text>
              {quoteResult.unavailable.map((reason) => (
                <Text key={reason} size="sm">
                  • {reason}
                </Text>
              ))}
            </View>
          ) : null}

          <DeliveryInstructionsSection
            value={instructions}
            onChange={setInstructions}
          />

          {receiver.required || receiver.kind === "unknown" ? (
            <ReceiverSection
              distanceMetres={receiver.distanceMetres}
              required={receiver.required}
              name={receiverName}
              phone={receiverPhone}
              errors={receiverErrors}
              onNameChange={setReceiverName}
              onPhoneChange={setReceiverPhone}
            />
          ) : null}

          {/*
            No payment-mode choice: clearance is paid up front. Stated rather
            than silently absent, because a customer who has used the
            catalogue checkout has seen the option and will look for it.
          */}
          <SectionCard title="Payment">
            <Text size="sm">
              Clearance deals are paid now, by card, M-Pesa or bank. Stock is
              limited and short-dated, so it is held for you only once payment
              clears.
            </Text>
          </SectionCard>

          <View className="gap-space-2 flex-row flex-wrap items-baseline">
            <Text size="caption" variant="subtle">
              Placing this order accepts our
            </Text>
            <LegalLink doc="terms" onFail={setFailure} />
            <Text size="caption" variant="subtle">
              and
            </Text>
            <LegalLink doc="privacy" onFail={setFailure} />
          </View>

          {/*
            With no publishable key there is no way to pay for a clearance
            basket at all, since there is no cash fallback. Said plainly
            instead of failing on the button.
          */}
          {!cardConfigured ? (
            <View className="bg-warning-soft p-space-4 rounded-md">
              <Text size="sm">
                Payments are not configured in this build, so a clearance order
                cannot be placed. Nothing in your basket has been lost.
              </Text>
            </View>
          ) : null}

          {card.message ? (
            <View
              className={`p-space-4 rounded-md ${
                card.state.kind === "failed"
                  ? "bg-destructive-soft"
                  : "bg-accent"
              }`}
            >
              <Text
                size="sm"
                variant={
                  card.state.kind === "failed" ? "destructive" : "default"
                }
              >
                {card.message}
              </Text>
            </View>
          ) : null}

          {failure ? (
            <View className="bg-destructive-soft p-space-4 rounded-md">
              <Text size="sm" variant="destructive">
                {failure}
              </Text>
            </View>
          ) : null}

          {blockers.length > 0 ? (
            <View className="bg-warning-soft gap-space-1 p-space-4 rounded-md">
              <Text size="sm" weight="semibold">
                Before you can place this order
              </Text>
              {blockers.map((blocker) => (
                <Text key={blocker} size="sm">
                  • {blocker}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View className="border-hairline border-border bg-card px-screen py-space-4 gap-space-2">
          <View className="flex-row items-baseline justify-between">
            <Text size="sm" variant="muted">
              To pay now
            </Text>
            <Text variant="price" size="priceLg">
              {formatKES(quote.total)}
            </Text>
          </View>
          <Button
            size="lg"
            full
            loading={placing || card.busy}
            disabled={
              blockers.length > 0 || placing || card.busy || !card.canPay
            }
            label={`Pay ${formatKES(quote.total)}`}
            onPress={() => void place()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text size="sm" variant="muted">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </View>
  );
}

function LegalLink({
  doc,
  onFail,
}: {
  doc: LegalDoc;
  onFail: (message: string) => void;
}) {
  const url = legalUrl(doc);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={LEGAL_DOC_META[doc].title}
      accessibilityHint="Opens in your browser"
      onPress={() => {
        void openExternal(url).then((ok) => {
          if (!ok) onFail(`Could not open your browser. Read them at ${url}`);
        });
      }}
      hitSlop={8}
    >
      <Text size="caption" weight="semibold" className="underline">
        {LEGAL_DOC_META[doc].title}
      </Text>
    </Pressable>
  );
}

function Gate({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader eyebrow="Clearance" title="Checkout" showCart={false} />
      <View className="gap-space-4 px-screen py-space-8 items-center">
        <Text size="lg" weight="semibold" className="text-center">
          {title}
        </Text>
        <Text variant="muted" size="sm" className="text-center">
          {body}
        </Text>
        {action ? (
          <Button label={action.label} onPress={action.onPress} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
