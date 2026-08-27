import { View } from "react-native";
import { MapPinOff, PackageSearch, SearchX } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";

/**
 * Empty and error states for the catalogue.
 *
 * ── Why "no products" is two different screens ────────────────────────────
 *
 * blink-ecommerce showed one message whenever the grid came back empty, which
 * meant a customer outside every delivery radius and a customer looking at a
 * genuinely bare aisle got the same unhelpful sentence. They are different
 * problems with different fixes:
 *
 *   - No vendor covers the customer's point at all. Nothing is wrong with the
 *     category; the address is the problem, and the action is to change it.
 *   - Vendors cover them, but this aisle has no stock nearby. The address is
 *     fine; the action is to look at a neighbouring aisle.
 *
 * The backend now reports these separately (`coverageEmpty`), so the UI can too.
 */

export function CoverageEmptyState({
  onChangeLocation,
}: {
  onChangeLocation: () => void;
}) {
  return (
    <View className="gap-space-4 px-screen py-space-10 items-center">
      <MapPinOff size={40} color="#818A99" />
      <View className="gap-space-2">
        <Text size="lg" weight="semibold" className="text-center">
          No shops deliver here yet
        </Text>
        <Text variant="muted" size="sm" className="text-center">
          We could not find any shop whose delivery area covers your location.
          Try a different address.
        </Text>
      </View>
      <Button
        variant="outline"
        label="Change location"
        onPress={onChangeLocation}
      />
    </View>
  );
}

export function NoProductsState({
  categoryName,
  onChangeLocation,
}: {
  categoryName: string;
  onChangeLocation: () => void;
}) {
  return (
    <View className="gap-space-4 px-screen py-space-10 items-center">
      <PackageSearch size={40} color="#818A99" />
      <View className="gap-space-2">
        <Text size="lg" weight="semibold" className="text-center">
          No {categoryName} available nearby
        </Text>
        <Text variant="muted" size="sm" className="text-center">
          Shops near you are not stocking this right now. Try another section,
          or a different address.
        </Text>
      </View>
      <Button
        variant="outline"
        label="Change location"
        onPress={onChangeLocation}
      />
    </View>
  );
}

export function NeedsLocationState({
  onRequest,
  denied,
}: {
  onRequest: () => void;
  denied: boolean;
}) {
  return (
    <View className="gap-space-4 px-screen py-space-10 items-center">
      <MapPinOff size={40} color="#818A99" />
      <View className="gap-space-2">
        <Text size="lg" weight="semibold" className="text-center">
          Where are we delivering?
        </Text>
        <Text variant="muted" size="sm" className="text-center">
          {denied
            ? // Distinguishes a refusal from "not asked yet". Telling someone to
              // grant a permission they already refused, without saying where,
              // is a dead end.
              "Location access is turned off, so we cannot tell which shops can reach you. Enable it in your device settings, or set an address manually."
            : "We need your location to show shops that deliver to you."}
        </Text>
      </View>
      <Button
        label={denied ? "Try again" : "Use my location"}
        onPress={onRequest}
      />
    </View>
  );
}

export function NotFoundState({
  what,
  onBack,
}: {
  what: string;
  onBack: () => void;
}) {
  return (
    <View className="gap-space-4 px-screen flex-1 items-center justify-center">
      <SearchX size={40} color="#818A99" />
      <View className="gap-space-2">
        <Text size="lg" weight="semibold" className="text-center">
          We could not find that {what}
        </Text>
        <Text variant="muted" size="sm" className="text-center">
          The link may be out of date, or it may have been removed.
        </Text>
      </View>
      {/*
        Always an escape route. A not-found screen that traps you is worse than
        the missing content.
      */}
      <Button variant="outline" label="Back to shop" onPress={onBack} />
    </View>
  );
}
