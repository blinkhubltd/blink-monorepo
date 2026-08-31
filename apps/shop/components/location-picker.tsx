import { useRef } from "react";
import { View } from "react-native";
import MapView, { PROVIDER_DEFAULT, type Region } from "react-native-maps";
import { MapPin } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";

import type { Point } from "../lib/address";

/**
 * Pick a delivery point on a map.
 *
 * ── The pin does not move; the map does ──────────────────────────────────
 *
 * A draggable marker is the obvious design and the wrong one on a phone: the
 * finger covers the pin at the moment of placement, and a marker drag competes
 * with the map's own pan gesture. Every delivery app does it the other way — a
 * fixed crosshair at the centre, the map slides underneath — which keeps the
 * target visible and needs no hit-testing.
 *
 * `onRegionChangeComplete` fires when the gesture settles, so a pan reports one
 * point rather than sixty, and the coverage check behind it runs once.
 *
 * ── There is a `.web.tsx` beside this file ───────────────────────────────
 *
 * `react-native-maps` has no web implementation. Metro picks the platform file,
 * so the web build never imports this one — which is why the import here is
 * unconditional and there is no `Platform.OS` branch. The old app achieved the
 * same thing with a 0-byte `MapComponents.web.tsx` that exported nothing, so the
 * web build failed at render rather than at bundle.
 */
export function LocationPicker({
  point,
  onChange,
  height = 240,
}: {
  /** The current point. Also the initial camera position. */
  point: Point | null;
  onChange: (point: Point) => void;
  height?: number;
}) {
  // The initial region only: passing `region` would fight the user's pan on
  // every re-render, which reads as the map snapping back under their finger.
  const initial = useRef<Region>({
    latitude: point?.lat ?? NAIROBI.lat,
    longitude: point?.lng ?? NAIROBI.lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  return (
    <View
      className="border-hairline border-border overflow-hidden rounded-lg"
      style={{ height }}
    >
      <MapView
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={initial.current}
        onRegionChangeComplete={(region) =>
          onChange({ lat: region.latitude, lng: region.longitude })
        }
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      />

      {/*
        The crosshair, centred and non-interactive so it cannot swallow the pan.
        Offset up by half its own height so the pin's POINT is at the centre of
        the map rather than its middle — a 20px error is about 15 metres here,
        which is a different gate on a compound.
      */}
      <View
        pointerEvents="none"
        className="absolute inset-0 items-center justify-center"
      >
        <View style={{ marginTop: -20 }}>
          <MapPin size={40} color="#0A0E16" fill="#FFC50B" />
        </View>
      </View>

      <View
        pointerEvents="none"
        className="bg-inverse px-space-3 py-space-1 absolute bottom-2 left-2 right-2 rounded-md opacity-90"
      >
        <Text variant="onInverse" size="caption" className="text-center">
          Drag the map so the pin sits on your gate
        </Text>
      </View>
    </View>
  );
}

/**
 * Fallback camera position.
 *
 * Nairobi, explicitly. `react-native-maps` defaults to its own origin near
 * Singapore, and the app this replaces showed distances computed from it — every
 * figure wrong, every figure plausible.
 */
export const NAIROBI: Point = { lat: -1.2921, lng: 36.8219 };
