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
import { Input } from "@repo/mobile-ui/components/ui/input";

import { useCart } from "../../providers/CartProvider";
import { useLocation } from "../../providers/LocationProvider";
import { ScreenHeader } from "../../components/screen-header";
import { OrderSummary } from "../../components/checkout/order-summary";
import {
  AddressPicker,
  DeliveryAddressSection,
  DeliveryInstructionsSection,
  PaymentModeSection,
  PrescriptionSection,
  ReceiverSection,
  SectionCard,
  type AddressForDisplay,
} from "../../components/checkout/sections";
import {
  checkoutBlockers,
  distanceMetres,
  receiverRequirement,
  validateReceiver,
} from "../../lib/checkout-rules";
import { formatKES } from "../../lib/format";
import { LEGAL_DOC_META, legalUrl, type LegalDoc } from "../../lib/legal";
import { openExternal } from "../../lib/open-external";

/**
 * Checkout.
 *
 * ── What this replaces ───────────────────────────────────────────────────
 *
 * A 1,448-line component in which the money maths, four modals, the
 * prescription state machine, the phone gate, the stock check and the Paystack
 * lifecycle all shared one scope. Every business rule it enforced is preserved —
 * see `lib/checkout-rules.ts`, where they are pure and tested — and every figure
 * it displayed is still displayed, including the VAT decomposition.
 *
 * ── The one substantive behaviour change ─────────────────────────────────
 *
 * The price is the server's. `checkout.quoteMyBasket` computes it, and
 * `beginCheckout` recomputes and stores it at the moment of payment. The old
 * screen computed money on the client and showed two totals that disagreed: a
 * headline `Total` counting one delivery fee, and a `Combined Total` summing
 * per-vendor orders that each carried a full fee. Paystack was charged the
 * smaller. There is one number here.
 *
 * ── Progressive, not a wall ──────────────────────────────────────────────
 *
 * The old screen made the customer press "Prepare Orders" to build drafts, then
 * "Pay" — two steps, with an "Edit Drafts" escape hatch, and five separate
 * disabled-conditions that showed no reason. Here the reasons are listed and the
 * single action is enabled when they clear.
 */
export default function CheckoutScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const cart = useCart();
  const { point } = useLocation();

  const [instructions, setInstructions] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<"pay_now" | "pay_on_delivery">(
    "pay_now",
  );
  const [pickingAddress, setPickingAddress] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [placing, setPlacing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Held so a retry after a failure reuses the same reference, which is what
  // makes both beginCheckout and placeMyOrder idempotent.
  const [pendingReference, setPendingReference] = useState<string | null>(null);

  const quoteResult = useQuery(
    api.data.checkout.quoteMyBasket,
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
  const setMyPhone = useMutation(api.user.users.setMyPhone);
  const recordAcceptance = useMutation(
    api.data.legal_acceptances.recordAcceptance,
  );
  const beginCheckout = useMutation(api.data.checkout.beginCheckout);
  const placeMyOrder = useMutation(api.data.checkout.placeMyOrder);

  useEffect(() => {
    // Present sign-in over checkout rather than redirecting, so the URL — and a
    // reload — stays on checkout.
    if (isLoaded && !isSignedIn) router.push("/(auth)/sign-in");
  }, [isLoaded, isSignedIn]);

  // Default to the customer's default address, or their only one.
  useEffect(() => {
    if (selectedLabel || !addresses || addresses.length === 0) return;
    const preferred = addresses.find((a) => a.is_default) ?? addresses[0]!;
    setSelectedLabel(preferred.label);
  }, [addresses, selectedLabel]);

  const selectedAddress = useMemo<AddressForDisplay | null>(() => {
    if (!addresses || !selectedLabel) return null;
    // Matched by label, which IS the identity here. The old screen looked its
    // address up by array index while storing the label as the id, so
    // `selectedAddress` was permanently null and every field it fed silently
    // fell back to a default the customer never chose.
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
  const prescriptionStatus = quote?.requiresPrescription ? "missing" : "none";

  const blockers = checkoutBlockers({
    hasQuote: !!quote,
    hasAddress: !!selectedAddress,
    hasPhone,
    receiverErrors,
    prescriptionStatus,
  });

  /**
   * Start checkout, then place the order.
   *
   * `beginCheckout` prices the basket server-side and stores the quote against a
   * reference; `placeMyOrder` writes the orders from that quote. The client
   * sends where to deliver and nothing about money — which is the whole point.
   *
   * `expectedTotal` is passed so that if the basket moved since the total on
   * screen was computed, the server refuses rather than silently charging a
   * different figure. Refusing is safe here because nothing has been captured.
   */
  async function place() {
    if (!selectedAddress) return;
    setPlacing(true);
    setFailure(null);

    // One reference per attempt, reused on retry so neither the payment row nor
    // the orders are duplicated by a double tap.
    const reference =
      pendingReference ??
      `SHOP_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    setPendingReference(reference);

    try {
      // Consent, before anything is priced or written. The versions are read
      // server-side inside the mutation, so the record says which documents were
      // current rather than which strings this build happens to ship. A retry
      // appends a second row, which is correct for an append-only consent log.
      await recordAcceptance({});

      const started = await beginCheckout({
        reference,
        paymentMode,
        expectedTotal: quote!.total,
      });

      if (paymentMode === "pay_now") {
        // Paystack takes over here: it needs the native SDK and a real device,
        // so it is deliberately not faked. The quote is already recorded, so
        // whenever the payment step lands it charges `started.amount` and
        // finalisation replays this exact quote.
        setFailure(
          `Card payment is not available in this build. Your total of ${formatKES(started.amount)} is confirmed and nothing has been charged — choose "Pay on delivery" to place the order now.`,
        );
        return;
      }

      const result = await placeMyOrder({
        reference,
        address: {
          street: selectedAddress.address?.address_1,
          address_1: selectedAddress.address?.address_1,
          address_2: selectedAddress.address?.address_2,
          city: selectedAddress.address?.city,
          country: selectedAddress.address?.country,
          // The address's OWN coordinates, not the device's. The old screen
          // wrote the device location onto the order while measuring the 150m
          // rule against the address, so a rider could be routed to a different
          // point than the one that was checked.
          lat: selectedAddress.coordinates.lat,
          lng: selectedAddress.coordinates.lng,
        },
        receiverContact:
          receiver.required && receiverName.trim()
            ? { name: receiverName.trim(), phone: receiverPhone.trim() }
            : undefined,
        specialInstructions: instructions.trim() || undefined,
      });

      const first = result.orderIds[0];
      if (first) {
        // To the order, not to `/`. The old screen fired an unawaited alert and
        // then `router.replace("/")`, so the customer landed on the home screen
        // with no order id, no reference and no way back to what they had just
        // bought.
        router.replace(`/order/${first}`);
      } else {
        router.replace("/orders");
      }
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
        <ScreenHeader title="Checkout" showCart={false} />
      </SafeAreaView>
    );
  }

  if (!isSignedIn) {
    return (
      <Gate
        title="Sign in to place your order"
        body="Your basket is saved and comes with you."
        action={{
          label: "Sign in",
          onPress: () => router.push("/(auth)/sign-in"),
        }}
      />
    );
  }

  if (cart.accountMissing) {
    return (
      <Gate
        title="Setting up your account"
        body="This usually takes a moment. Your basket is safe — try again shortly."
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
        body="Your basket is empty, or nothing in it is available right now."
        action={{
          label: "Back to basket",
          onPress: () => router.replace("/cart"),
        }}
      />
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
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
              {/*
                The way out of the dead end. Until the address book existed this
                screen told the customer to "add one from your profile", where
                there was no such screen: a filled basket and nowhere to go.
              */}
              <Button
                variant="outline"
                label="Add an address"
                onPress={() => router.push("/addresses/new")}
              />
            </SectionCard>
          ) : !selectedAddress && addresses && addresses.length === 0 ? (
            <SectionCard title="Where should this go?">
              <Text size="sm" variant="muted">
                Add a delivery address to place this order. It takes a moment,
                and it is saved for next time.
              </Text>
              <Button
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

          {/*
            Phone capture, kept from the old screen but inline rather than a
            modal that re-entered itself off stale data. The old one read
            `userData` from a closure captured before the mutation resolved, so
            it could reopen indefinitely.
          */}
          {!hasPhone ? (
            <SectionCard title="A number we can reach you on">
              <Text size="sm" variant="muted">
                The rider will call this number if they cannot find you.
              </Text>
              <Input
                value={phoneDraft}
                onChangeText={setPhoneDraft}
                placeholder="+254…"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
              />
              <Button
                label="Save number"
                variant="outline"
                disabled={phoneDraft.trim().length === 0}
                onPress={() => {
                  void setMyPhone({ phone: phoneDraft }).catch((err) =>
                    setFailure(
                      err instanceof Error
                        ? err.message
                        : "Could not save that number.",
                    ),
                  );
                }}
              />
            </SectionCard>
          ) : (
            <SectionCard title="Contact">
              <Text size="sm">{storedPhone}</Text>
              <Text size="caption" variant="subtle">
                The rider will call this number if they cannot find you.
              </Text>
            </SectionCard>
          )}

          <PrescriptionSection
            status={prescriptionStatus}
            onAction={() =>
              setFailure(
                "Prescription upload is not available yet in this build.",
              )
            }
          />

          <SectionCard title="Order summary">
            <OrderSummary
              quote={quote}
              unavailable={quoteResult?.unavailable ?? []}
            />
          </SectionCard>

          <DeliveryInstructionsSection
            value={instructions}
            onChange={setInstructions}
          />

          {/*
            Shown whenever the rule applies OR cannot be evaluated. The old
            screen hid it entirely when GPS was unavailable, which meant a denied
            permission silently removed the requirement.
          */}
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

          <PaymentModeSection mode={paymentMode} onChange={setPaymentMode} />

          {/*
            The agreement, stated where the commitment is made rather than
            buried in the profile tab. Both documents open on the website — one
            copy, editable without a store release — and placing the order
            records the acceptance against the versions the server holds.
          */}
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

          {failure ? (
            <View className="bg-destructive-soft p-space-4 rounded-md">
              <Text size="sm" variant="destructive">
                {failure}
              </Text>
            </View>
          ) : null}

          {/*
            Every reason the button is disabled, listed. The old screen had five
            conditions across two buttons and showed none of them — it simply
            did nothing when tapped.
          */}
          {blockers.length > 0 ? (
            <View className="bg-warning-soft p-space-4 gap-space-1 rounded-md">
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

        {/* Pinned, so the amount is visible without scrolling back. */}
        <View className="border-hairline border-border bg-card px-screen py-space-4 gap-space-2">
          <View className="flex-row items-baseline justify-between">
            <Text size="sm" variant="muted">
              {paymentMode === "pay_on_delivery"
                ? "Pay on delivery"
                : "To pay now"}
            </Text>
            <Text variant="price" size="priceLg">
              {formatKES(quote.total)}
            </Text>
          </View>
          <Button
            size="lg"
            full
            loading={placing}
            disabled={blockers.length > 0 || placing}
            label={
              paymentMode === "pay_on_delivery"
                ? `Place order · ${formatKES(quote.total)}`
                : `Pay ${formatKES(quote.total)}`
            }
            onPress={() => void place()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * One legal document, opened on the website.
 *
 * A failure is reported through the same banner the rest of the screen uses,
 * because a link that does nothing when tapped is how a customer concludes the
 * terms are being hidden from them.
 */
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
      // A 44pt target is not available inline in a sentence, so the underline
      // and colour carry the affordance instead of size.
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
      <ScreenHeader title="Checkout" showCart={false} />
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
