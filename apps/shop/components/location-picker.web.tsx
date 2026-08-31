import { View } from "react-native";
import { MapPin } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";

import { formatPoint, isUsablePoint, type Point } from "../lib/address";

/**
 * The web stand-in for the map picker.
 *
 * `react-native-maps` has no web implementation, so this file exists purely so
 * Metro has something to resolve for `Platform.OS === "web"`. It is honest about
 * being a stand-in rather than pretending: the point comes from the browser's
 * geolocation via `LocationProvider`, and the customer is told the map is only
 * on the app.
 *
 * The alternative — a Google Maps JS embed — means a second maps SDK, a second
 * API key restricted to a web referrer, and a second set of pin-drag code to
 * keep in step with the native one, for a surface almost nobody places orders
 * from. Worth revisiting only if web checkout turns out to matter.
 *
 * The old app shipped a 0-byte `AddAddressModal.web.tsx`, so the web build
 * resolved the platform file, rendered nothing, and the modal silently did not
 * exist.
 */
export function LocationPicker({
  point,
  height = 240,
}: {
  point: Point | null;
  onChange: (point: Point) => void;
  height?: number;
}) {
  return (
    <View
      className="border-hairline border-border bg-muted gap-space-2 p-space-4 items-center justify-center rounded-lg"
      style={{ height }}
    >
      <MapPin size={28} color="#5A6372" />
      <Text size="sm" weight="semibold">
        {isUsablePoint(point) ? "Using your browser location" : "No location yet"}
      </Text>
      <Text size="caption" variant="subtle" className="text-center">
        {isUsablePoint(point)
          ? formatPoint(point)
          : "Allow location access, or add this address from the app to place the pin exactly."}
      </Text>
    </View>
  );
}

/** Kept in step with the native file: Nairobi, never the library's origin. */
export const NAIROBI: Point = { lat: -1.2921, lng: 36.8219 };
