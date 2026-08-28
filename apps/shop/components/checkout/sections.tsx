import { Pressable, TextInput, View } from "react-native";
import { Check, ChevronRight, MapPin } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Button } from "@repo/mobile-ui/components/ui/button";

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
  return (
    <View className="border-hairline border-border bg-card gap-space-3 p-space-5 rounded-lg">
      <View className="gap-space-3 flex-row items-center justify-between">
        <Text size="base" weight="semibold">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
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
          <Text size="sm" weight="semibold">
            Change
          </Text>
          <ChevronRight size={16} color="#0A0E16" />
        </Pressable>
      }
    >
      {address ? (
        <View className="gap-space-2 flex-row items-start">
          <MapPin size={18} color="#5A6372" />
          <View className="gap-space-1 flex-1">
            <Text size="sm" weight="medium">
              {address.label}
            </Text>
            <Text size="sm" variant="muted">
              {address.address?.address_1 ?? "Address details not available"}
            </Text>
            {/*
              City and country, kept from the old screen. It defaulted these to
              "Nairobi" and "KE" on the order while AddAddressModal wrote
              "Kenya" — displayed here only when actually present, rather than
              showing a default the customer never chose.
            */}
            {address.address?.city ? (
              <Text size="caption" variant="subtle">
                {address.address.city}
                {address.address.country ? `, ${address.address.country}` : ""}
              </Text>
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
            {selected ? <Check size={18} color="#0A0E16" /> : null}
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
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Anything the rider should know — a gate code, a landmark, who to ask for."
        placeholderTextColor="#818A99"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        className="border-hairline border-input bg-background p-space-4 text-body text-foreground min-h-[96px] rounded-md font-sans"
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

      <Input
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

      <Input
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
}: {
  mode: "pay_now" | "pay_on_delivery";
  onChange: (next: "pay_now" | "pay_on_delivery") => void;
}) {
  return (
    <SectionCard title="Payment">
      <View className="gap-space-2">
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
      className={`border-hairline gap-space-3 p-space-4 flex-row items-start rounded-md active:opacity-80 ${
        selected ? "border-primary bg-accent" : "border-border bg-background"
      }`}
    >
      <View
        className={`rounded-pill mt-[2px] size-[18px] items-center justify-center border-2 ${
          selected ? "border-primary" : "border-border"
        }`}
      >
        {selected ? (
          <View className="bg-primary rounded-pill size-[10px]" />
        ) : null}
      </View>
      <View className="gap-space-1 flex-1">
        <Text size="sm" weight="semibold">
          {label}
        </Text>
        <Text size="caption" variant="subtle">
          {helper}
        </Text>
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
