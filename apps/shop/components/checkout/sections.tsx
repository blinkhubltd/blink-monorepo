import { useEffect, useState } from "react";
import {
  Pressable,
  Text as RNText,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";

import { Icon } from "../icon";
import { useTokenColors } from "../../lib/token-colors";
import {
  DEFAULT_DIAL_CODE,
  DIAL_CODES,
  formatPhone,
  joinPhone,
  splitPhone,
} from "../../lib/phone";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";

/*
  Re-exported so the screens that already import these from here keep
  working. They live in `lib/phone.ts` now because this file is JSX and a
  unit test cannot import it — and the split/join round trip needed covering
  once `/edit-profile` started deciding "has anything changed?" with it.
*/
export { formatPhone, joinPhone, splitPhone } from "../../lib/phone";

/**
 * The individual sections of checkout.
 *
 * Split out so the screen reads as a sequence of decisions rather than the
 * 1,448-line single component this replaces, where the money maths, four modals,
 * the prescription state machine and the Paystack lifecycle all shared one
 * scope.
 */

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  // Sizes are the checkout design's own px values (card 20px radius / 20px
  // padding / 12px gap; label 12px, 500, 0.06em), not the app's type scale.
  return (
    <View className="bg-card gap-[12px] rounded-[20px] p-[20px]">
      <View className="flex-row items-center justify-between">
        <RNText className="tracking-label text-muted-foreground text-[12px] leading-[17px] font-medium uppercase">
          {title}
        </RNText>
        {action}
      </View>
      {children}
    </View>
  );
}

/**
 * The checkout design's field: 1.5px border, 14px radius, 13/14px padding. No
 * fixed height and no wrapper, so the placeholder is the same size as the text.
 */
export function FieldInput({
  multiline,
  className = "",
  ...props
}: TextInputProps & { className?: string }) {
  const colors = useTokenColors();
  return (
    <TextInput
      placeholderTextColor={colors.subtle}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      className={`border-border bg-card text-foreground rounded-[14px] border-[1.5px] px-[14px] py-[13px] font-sans ${
        multiline ? "min-h-[96px] text-[14px] leading-[21px]" : "text-[16px]"
      } ${className}`}
      {...props}
    />
  );
}

/**
 * A dialling code beside a number, rather than one field holding both.
 *
 * The single field asked every customer to retype `+254` — and a number typed
 * without it, or with a leading `0` left in front of it, is a number the rider
 * cannot dial. The code is now picked once and the leading zero is stripped on
 * save, so `0741…` and `741…` store the same thing.
 */
export function PhoneField({
  dial,
  national,
  onDialChange,
  onNationalChange,
}: {
  dial: string;
  national: string;
  onDialChange: (next: string) => void;
  onNationalChange: (next: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const selected =
    DIAL_CODES.find((entry) => entry.code === dial) ?? DIAL_CODES[0];

  return (
    <View className="gap-[8px]">
      <View className="flex-row gap-[8px]">
        <Pressable
          onPress={() => setPicking((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={`Country code, ${selected.name} ${selected.code}`}
          accessibilityState={{ expanded: picking }}
          className="border-border bg-card flex-row items-center gap-[6px] rounded-[14px] border-[1.5px] px-[12px] py-[13px] active:opacity-70"
        >
          <RNText className="text-[15px]">{selected.flag}</RNText>
          <RNText className="text-foreground font-sans text-[15px] leading-[20px]">
            {selected.code}
          </RNText>
          <Icon
            name={picking ? "chevron-up" : "chevron-down"}
            size={14}
            tone="body"
          />
        </Pressable>

        <FieldInput
          value={national}
          onChangeText={onNationalChange}
          placeholder="741 773 276"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          accessibilityLabel="Phone number"
          className="flex-1"
        />
      </View>

      {/*
        Inline rather than a modal: this sits inside a ScrollView, and a sheet
        over a nine-row list is more machinery than the choice deserves.
      */}
      {picking ? (
        <View className="border-border overflow-hidden rounded-[14px] border-[1.5px]">
          {DIAL_CODES.map((entry) => (
            <Pressable
              key={entry.code}
              onPress={() => {
                onDialChange(entry.code);
                setPicking(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: entry.code === dial }}
              className={`flex-row items-center gap-[10px] px-[14px] py-[11px] active:opacity-70 ${
                entry.code === dial ? "bg-accent" : "bg-card"
              }`}
            >
              <RNText className="text-[15px]">{entry.flag}</RNText>
              <RNText className="text-foreground flex-1 font-sans text-[14px] leading-[20px]">
                {entry.name}
              </RNText>
              <RNText className="text-muted-foreground font-sans text-[14px] leading-[20px]">
                {entry.code}
              </RNText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The caller's phone number: shown when saved, edited in place, written to the
 * user record.
 *
 * One component for checkout and edit-profile, because the two had drifted —
 * different fields, different save handling, and both reading the number off a
 * query that never returned it.
 *
 * `stored` is the raw `users.getMyPhone` result: `undefined` while loading,
 * `null` when nothing is on file. Loading renders no form at all, so a customer
 * with a saved number never sees the empty field flash up first.
 *
 * A saved number is a line of text with an Edit action, not a live input: it
 * is a fact about the account, and a field invites an accidental edit of the
 * one number a rider will call.
 */
export function PhoneSection({
  stored,
  title = "A number we can reach you on",
  helper = "The rider will call this number if they cannot find you.",
  missingHelper = "Save a number before placing this order — the rider will call it if they cannot find you.",
}: {
  stored: string | null | undefined;
  title?: string;
  helper?: string;
  /** Shown in red when nothing is saved. */
  missingHelper?: string;
}) {
  const setMyPhone = useMutation(api.user.users.setMyPhone);

  const loading = stored === undefined;
  const saved = stored ?? "";
  const hasPhone = saved.length > 0;

  const [editing, setEditing] = useState(false);
  const [dial, setDial] = useState(DEFAULT_DIAL_CODE);
  const [national, setNational] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Seeded from the record, so Edit starts from the saved number rather than an
    empty field. Keyed on the stored value: it re-seeds when a save lands and
    does not fight the customer while they are typing.
  */
  useEffect(() => {
    if (!saved) return;
    const split = splitPhone(saved);
    setDial(split.dial);
    setNational(split.national);
  }, [saved]);

  const next = joinPhone(dial, national);
  const showForm = !loading && (!hasPhone || editing);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Auth-derived and revalidated server-side, so this is the number every
      // later order and every rider call reads. The query above updates on its
      // own once the write lands.
      await setMyPhone({ phone: next });
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save that number.",
      );
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    const split = splitPhone(saved);
    setDial(split.dial);
    setNational(split.national);
    setError(null);
    setEditing(false);
  }

  return (
    <SectionCard
      title={title}
      action={
        hasPhone && !editing ? (
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit your phone number"
            hitSlop={8}
            className="gap-space-1 flex-row items-center active:opacity-70"
          >
            <Icon name="pencil" size={14} tone="brand" />
            <RNText className="text-primary text-[13px] leading-[19px] font-semibold">
              Edit
            </RNText>
          </Pressable>
        ) : null
      }
    >
      <RNText
        className={`font-sans text-[13px] leading-[19px] ${
          loading || hasPhone ? "text-muted-foreground" : "text-destructive"
        }`}
      >
        {loading || hasPhone ? helper : missingHelper}
      </RNText>

      {hasPhone && !editing ? (
        <RNText className="text-foreground font-sans text-[15px] leading-[22px]">
          {formatPhone(saved)}
        </RNText>
      ) : null}

      {showForm ? (
        <>
          <PhoneField
            dial={dial}
            national={national}
            onDialChange={setDial}
            onNationalChange={setNational}
          />
          {error ? (
            <RNText className="text-destructive font-sans text-[13px] leading-[19px]">
              {error}
            </RNText>
          ) : null}
          <View className="gap-space-3 flex-row">
            <Button
              label="Save number"
              variant="outline"
              size="ctaSm"
              loading={saving}
              disabled={national.trim().length === 0 || next === saved}
              onPress={() => void save()}
            />
            {hasPhone ? (
              <Button
                label="Cancel"
                variant="ghost"
                size="ctaSm"
                onPress={cancel}
              />
            ) : null}
          </View>
        </>
      ) : null}
    </SectionCard>
  );
}

export interface AddressForDisplay {
  label: string;
  address?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    country?: string;
  };
  coordinates: { lat: number; lng: number };
  is_default: boolean;
}

export function DeliveryAddressSection({
  address,
  onChange,
}: {
  address: AddressForDisplay | null;
  onChange: () => void;
}) {
  return (
    <SectionCard
      title="Delivering to"
      action={
        <Pressable
          onPress={onChange}
          accessibilityRole="button"
          hitSlop={8}
          className="gap-space-1 flex-row items-center active:opacity-70"
        >
          <RNText className="text-foreground text-[13px] leading-[19px] font-semibold">
            Change
          </RNText>
          <Icon name="chevron-forward" size={16} tone="strong" />
        </Pressable>
      }
    >
      {address ? (
        <View className="flex-row items-start gap-[10px]">
          <Icon name="location-outline" size={18} tone="body" />
          <View className="flex-1 gap-[2px]">
            <RNText className="text-foreground text-[15px] leading-[22px] font-semibold">
              {address.label}
            </RNText>
            <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
              {address.address?.address_1 ?? "Address details not available"}
            </RNText>
            {/*
              City and country, kept from the old screen. It defaulted these to
              "Nairobi" and "KE" on the order while AddAddressModal wrote
              "Kenya" — displayed here only when actually present, rather than
              showing a default the customer never chose.
            */}
            {address.address?.city ? (
              <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
                {address.address.city}
                {address.address.country ? `, ${address.address.country}` : ""}
              </RNText>
            ) : null}
          </View>
        </View>
      ) : (
        <View className="gap-space-3">
          <Text size="sm" variant="muted">
            Choose where this order should go.
          </Text>
          <Button
            variant="outline"
            label="Choose an address"
            onPress={onChange}
          />
        </View>
      )}
    </SectionCard>
  );
}

export function AddressPicker({
  addresses,
  selectedLabel,
  onSelect,
}: {
  addresses: AddressForDisplay[];
  selectedLabel: string | null;
  onSelect: (address: AddressForDisplay) => void;
}) {
  return (
    <View className="gap-space-2">
      {addresses.map((address) => {
        const selected = address.label === selectedLabel;
        return (
          <Pressable
            key={address.label}
            onPress={() => onSelect(address)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={`border-hairline gap-space-2 p-space-4 flex-row items-start rounded-lg active:opacity-80 ${
              selected ? "border-primary bg-accent" : "border-border bg-card"
            }`}
          >
            <View className="gap-space-1 flex-1">
              <View className="gap-space-2 flex-row items-center">
                <Text size="sm" weight="semibold">
                  {address.label}
                </Text>
                {address.is_default ? (
                  <Text size="caption" variant="subtle">
                    Default
                  </Text>
                ) : null}
              </View>
              <Text size="sm" variant="muted" numberOfLines={2}>
                {address.address?.address_1 ?? "No street details"}
              </Text>
            </View>
            {selected ? (
              <Icon name="checkmark" size={18} tone="strong" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function DeliveryInstructionsSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <SectionCard title="Delivery instructions">
      <FieldInput
        value={value}
        onChangeText={onChange}
        placeholder="Anything the rider should know — a gate code, a landmark, who to ask for."
        multiline
        numberOfLines={3}
      />
    </SectionCard>
  );
}

/**
 * Receiver details, required when the delivery point is far from the customer.
 *
 * ── The rule, and the honest version of it ───────────────────────────────
 *
 * The old screen required a receiver name and phone when the delivery address
 * was more than 150 m from the device's GPS — the reasoning being that someone
 * ordering to an address they are not standing at is ordering for someone else.
 *
 * It failed OPEN in two ways worth naming, both preserved as explicit states
 * here rather than silently skipped:
 *
 *   - No GPS fix, or permission denied, meant `distance === null`, so the rule
 *     simply did not apply and checkout continued with no receiver details.
 *   - Location was acquired at `Accuracy.Balanced` — roughly 100 m of error
 *     against a 150 m threshold — once, with no staleness check.
 *
 * So the distance is shown, and when it cannot be computed the section says so
 * and offers the fields anyway rather than pretending the question does not
 * exist.
 */
export function ReceiverSection({
  distanceMetres,
  required,
  name,
  phone,
  errors,
  onNameChange,
  onPhoneChange,
}: {
  distanceMetres: number | null;
  required: boolean;
  name: string;
  phone: string;
  errors: { name?: string; phone?: string };
  onNameChange: (next: string) => void;
  onPhoneChange: (next: string) => void;
}) {
  return (
    <SectionCard
      title={required ? "Who is receiving this?" : "Receiver (optional)"}
    >
      <Text size="sm" variant="muted">
        {distanceMetres === null
          ? "We could not check your current location, so tell us who will take delivery if it is not you."
          : required
            ? `This address is about ${Math.round(distanceMetres)}m from where you are now, so we need the contact of whoever is receiving the order.`
            : "Add a contact if someone else will take delivery."}
      </Text>

      <FieldInput
        value={name}
        onChangeText={onNameChange}
        placeholder="Receiver name"
        autoCapitalize="words"
        textContentType="name"
      />
      {errors.name ? (
        <Text size="caption" variant="destructive">
          {errors.name}
        </Text>
      ) : null}

      <FieldInput
        value={phone}
        onChangeText={onPhoneChange}
        placeholder="Receiver phone (+254…)"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      {errors.phone ? (
        <Text size="caption" variant="destructive">
          {errors.phone}
        </Text>
      ) : null}
    </SectionCard>
  );
}

export function PaymentModeSection({
  mode,
  onChange,
  allowPayNow = true,
}: {
  mode: "pay_now" | "pay_on_delivery";
  onChange: (next: "pay_now" | "pay_on_delivery") => void;
  /**
   * False when this build has no Paystack publishable key.
   *
   * The option is removed rather than shown-and-refused. The old app offered
   * it always and answered a tap with "Configuration Error · Paystack public
   * key is missing" — a developer's message, to a shopper, after they had
   * committed to paying.
   */
  allowPayNow?: boolean;
}) {
  if (!allowPayNow) {
    return (
      <SectionCard title="Payment">
        <ModeOption
          label="Pay on delivery"
          helper="Pay the rider when your order arrives. Nothing is charged now."
          selected
          onPress={() => onChange("pay_on_delivery")}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Payment">
      <View className="gap-[10px]">
        <ModeOption
          label="Pay now"
          helper="Card, M-Pesa or bank. Your order is confirmed immediately."
          selected={mode === "pay_now"}
          onPress={() => onChange("pay_now")}
        />
        <ModeOption
          label="Pay on delivery"
          helper="Pay the rider when your order arrives. Nothing is charged now."
          selected={mode === "pay_on_delivery"}
          onPress={() => onChange("pay_on_delivery")}
        />
      </View>
    </SectionCard>
  );
}

function ModeOption({
  label,
  helper,
  selected,
  onPress,
}: {
  label: string;
  helper: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-row items-start gap-[12px] rounded-[14px] border-[1.5px] p-[14px] active:opacity-80 ${
        selected ? "border-primary bg-accent" : "border-border bg-transparent"
      }`}
    >
      <View
        className={`mt-[2px] size-[20px] items-center justify-center rounded-[999px] border-2 ${
          selected ? "border-primary" : "border-input"
        }`}
      >
        {selected ? (
          <View className="bg-primary size-[10px] rounded-[999px]" />
        ) : null}
      </View>
      <View className="flex-1 gap-[2px]">
        <RNText className="text-foreground text-[15px] leading-[22px] font-semibold">
          {label}
        </RNText>
        <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
          {helper}
        </RNText>
      </View>
    </Pressable>
  );
}

/**
 * Prescription state, with a distinct message per status.
 *
 * The old screen's button carried four different labels off one state machine
 * (`Upload Prescription` / `View Prescription Status` / `Upload New
 * Prescription` / `Check Prescription Status`) but rendered no explanation of
 * what any of them meant, and its computed `prescriptionErrorMessage` was never
 * displayed at all.
 */
export function PrescriptionSection({
  status,
  reason,
  onAction,
}: {
  status: "none" | "missing" | "pending" | "rejected" | "approved" | "loading";
  reason?: string;
  onAction: () => void;
}) {
  if (status === "none") return null;

  const copy = {
    loading: {
      title: "Checking your prescription",
      body: "One moment.",
      action: null,
    },
    missing: {
      title: "Prescription needed",
      body: "Some items need a valid prescription before they can be dispatched.",
      action: "Upload prescription",
    },
    pending: {
      title: "Prescription under review",
      body: "A pharmacist is checking your document. You can still place the order — it will be dispatched once approved.",
      action: "View status",
    },
    rejected: {
      title: "Prescription not accepted",
      body: reason ?? "Upload a clearer or more recent document to continue.",
      action: "Upload a new one",
    },
    approved: {
      title: "Prescription approved",
      body: "Your prescription items are cleared for dispatch.",
      action: null,
    },
  }[status];

  const tone =
    status === "approved"
      ? "bg-success-soft"
      : status === "rejected"
        ? "bg-destructive-soft"
        : "bg-warning-soft";

  return (
    <View className={`${tone} gap-space-3 p-space-4 rounded-lg`}>
      <View className="gap-space-1">
        <Text size="sm" weight="semibold">
          {copy.title}
        </Text>
        <Text size="sm">{copy.body}</Text>
      </View>
      {copy.action ? (
        <Button variant="outline" label={copy.action} onPress={onAction} />
      ) : null}
    </View>
  );
}
