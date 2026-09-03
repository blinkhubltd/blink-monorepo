import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Crosshair, Store } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Label } from "@repo/mobile-ui/components/ui/label";
import { Switch } from "@repo/mobile-ui/components/ui/switch";

import { ScreenHeader } from "../../components/screen-header";
import { SectionCard } from "../../components/checkout/sections";
import { LocationPicker, NAIROBI } from "../../components/location-picker";
import { useLocation } from "../../providers/LocationProvider";
import {
  DEFAULT_COUNTRY,
  SUGGESTED_LABELS,
  addressBlockers,
  cleanLines,
  formatPoint,
  isUsablePoint,
  replacementFor,
  type Point,
} from "../../lib/address";

/**
 * Add or replace one delivery address.
 *
 * ── Coverage is answered while they type, not on submit ──────────────────
 *
 * The server refuses a point no shop can reach, and so did the old modal — but
 * only when Save was pressed, after the whole form had been filled in. Here the
 * chosen point is checked live and the answer is shown next to the map: how many
 * shops reach this spot, or that none do. Same rule, discovered at the moment it
 * is decided rather than at the end.
 *
 * ── Replacement is stated before it happens ──────────────────────────────
 *
 * The label is the address's identity server-side, so saving "Home" over an
 * existing "Home" replaces it. The old modal said "Save" and did it silently.
 * Here the button says "Replace Home" and a note explains, matched
 * case-insensitively — "home" and "Home" are the same place to a person.
 *
 * ── `?label=` edits ──────────────────────────────────────────────────────
 *
 * Editing is the same screen with the entry prefilled. One form, so the two
 * cannot drift, and the URL carries which address is being edited — so a reload
 * lands back on the same edit rather than a blank Add.
 */
export default function EditAddressScreen() {
  const { label: editingLabel } = useLocalSearchParams<{ label?: string }>();
  const { isSignedIn } = useAuth();
  const { point: devicePoint, request, requesting, denied } = useLocation();

  const addresses = useQuery(
    api.data.addresses.getMyAddresses,
    isSignedIn ? {} : "skip",
  );
  const saveMyAddress = useMutation(api.data.addresses.saveMyAddress);

  const [label, setLabel] = useState(editingLabel ?? "");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill once, when editing and the book has loaded. Guarded by a flag rather
  // than by dependency array luck: re-running would overwrite what the customer
  // has typed every time the subscription updates.
  useEffect(() => {
    if (prefilled || !editingLabel || !addresses) return;
    const existing = addresses.find((a) => a.label === editingLabel);
    if (!existing) {
      setPrefilled(true);
      return;
    }
    setLabel(existing.label);
    setLine1(existing.address?.address_1 ?? "");
    setLine2(existing.address?.address_2 ?? "");
    setCity(existing.address?.city ?? "");
    setMakeDefault(existing.is_default);
    setPoint(existing.coordinates);
    setPrefilled(true);
  }, [addresses, editingLabel, prefilled]);

  // Seed a new address from the device's location when there is one and the
  // customer has not moved the pin. Never overwrites a chosen point.
  useEffect(() => {
    if (editingLabel || point !== null) return;
    if (isUsablePoint(devicePoint)) setPoint(devicePoint);
  }, [devicePoint, editingLabel, point]);

  const effectivePoint = point ?? (isUsablePoint(devicePoint) ? devicePoint : null);

  const covering = useQuery(
    api.data.coverage.vendorsCoveringPoint,
    isUsablePoint(effectivePoint)
      ? { lat: effectivePoint.lat, lng: effectivePoint.lng }
      : "skip",
  );

  // `undefined` is "still asking" and must not read as "not covered", or every
  // pan would flash "we do not deliver here".
  const covered = covering === undefined ? null : covering.length > 0;

  const replacing = useMemo(() => {
    if (!addresses) return null;
    const match = replacementFor(label, addresses);
    // Editing "Home" and saving as "Home" is not a surprise worth warning about.
    return match && match !== editingLabel ? match : null;
  }, [addresses, label, editingLabel]);

  const blockers = addressBlockers({
    label,
    point: effectivePoint,
    covered,
  });

  async function save() {
    if (!isUsablePoint(effectivePoint)) return;
    setSaving(true);
    setError(null);
    try {
      await saveMyAddress({
        label,
        address: cleanLines({
          address_1: line1,
          address_2: line2,
          city,
          country: DEFAULT_COUNTRY,
        }),
        coordinates: { lat: effectivePoint.lat, lng: effectivePoint.lng },
        is_default: makeDefault,
      });
      // Back to the book, replaced rather than pushed: an address just saved
      // should not be reachable again by a back gesture as a stale form.
      router.replace("/addresses");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save that address.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow={editingLabel ? "Editing" : undefined}
        title={editingLabel ? editingLabel : "Add an address"}
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
          <LocationPicker
            point={effectivePoint ?? NAIROBI}
            onChange={setPoint}
          />

          <View className="gap-space-3 flex-row items-center">
            <Button
              size="sm"
              variant="outline"
              label={requesting ? "Locating…" : "Use my location"}
              icon={<Crosshair size={16} color="#0A0E16" />}
              loading={requesting}
              onPress={() => void request()}
            />
            <Text size="caption" variant="subtle" className="flex-1">
              {formatPoint(effectivePoint)}
            </Text>
          </View>

          {denied ? (
            <Text size="caption" variant="subtle">
              Location permission is off, so the map starts on Nairobi — drag it
              to your spot.
            </Text>
          ) : null}

          {/*
            The coverage answer, next to the decision it affects. Three states,
            all distinct: still checking, covered by N shops, covered by none.
          */}
          <View className="gap-space-2 flex-row items-center">
            <Store size={16} color="#5A6372" />
            <Text size="caption" variant={covered === false ? "destructive" : "subtle"}>
              {covered === null
                ? "Checking which shops reach this spot…"
                : covered
                  ? `${covering!.length} ${covering!.length === 1 ? "shop delivers" : "shops deliver"} here`
                  : "No shop delivers to this spot yet"}
            </Text>
          </View>

          <SectionCard title="What should we call it?">
            <View className="gap-space-2 flex-row">
              {SUGGESTED_LABELS.map((suggestion) => {
                const active =
                  label.trim().toLowerCase() === suggestion.toLowerCase();
                return (
                  <Pressable
                    key={suggestion}
                    onPress={() => setLabel(suggestion)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`h-control-sm px-space-4 rounded-pill items-center justify-center ${
                      active ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <Text
                      size="label"
                      weight="semibold"
                      variant={active ? "onBrand" : "muted"}
                    >
                      {suggestion}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Input
              value={label}
              onChangeText={setLabel}
              placeholder="Home"
              autoCapitalize="words"
              maxLength={60}
            />
            {replacing ? (
              <View className="bg-warning-soft p-space-3 gap-space-1 rounded-md">
                <Text size="sm" weight="semibold">
                  This replaces “{replacing}”
                </Text>
                <Text size="caption">
                  Addresses are identified by their name, so saving this
                  overwrites the one you already have. Use a different name to
                  keep both.
                </Text>
              </View>
            ) : null}
          </SectionCard>

          <SectionCard title="Details for the rider">
            <View className="gap-space-2">
              <Label nativeID="line1">Building, street or estate</Label>
              <Input
                aria-labelledby="line1"
                value={line1}
                onChangeText={setLine1}
                placeholder="Kilimani Court, Ngong Road"
              />
            </View>
            <View className="gap-space-2">
              <Label nativeID="line2">House or flat, and landmarks</Label>
              <Input
                aria-labelledby="line2"
                value={line2}
                onChangeText={setLine2}
                placeholder="Flat 4B, gate opposite the pharmacy"
              />
            </View>
            <View className="gap-space-2">
              <Label nativeID="city">Town or city</Label>
              <Input
                aria-labelledby="city"
                value={city}
                onChangeText={setCity}
                placeholder="Nairobi"
                autoCapitalize="words"
              />
            </View>
            <Text size="caption" variant="subtle">
              The pin decides where the rider goes. These details help them find
              the door once they are there.
            </Text>
          </SectionCard>

          <View className="border-hairline border-border bg-card gap-space-3 p-space-4 flex-row items-center rounded-lg">
            <View className="gap-space-1 flex-1">
              <Text size="sm" weight="medium">
                Use this by default
              </Text>
              <Text size="caption" variant="subtle">
                Checkout will pick it unless you choose another.
              </Text>
            </View>
            <Switch
              checked={makeDefault}
              onCheckedChange={setMakeDefault}
              nativeID="make-default"
            />
          </View>

          {error ? (
            <View className="bg-destructive-soft p-space-4 rounded-md">
              <Text size="sm" variant="destructive">
                {error}
              </Text>
            </View>
          ) : null}

          {blockers.length > 0 ? (
            <View className="bg-warning-soft gap-space-1 p-space-4 rounded-md">
              {blockers.map((blocker) => (
                <Text key={blocker} size="sm">
                  • {blocker}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View className="border-hairline border-border bg-card px-screen py-space-4">
          <Button
            full
            size="lg"
            loading={saving}
            disabled={blockers.length > 0 || saving}
            label={replacing ? `Replace ${replacing}` : "Save address"}
            onPress={() => void save()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
