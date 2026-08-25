import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Modal, Platform, Pressable, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from "react-native-reanimated";
import {
  Camera as CameraIcon,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  X,
  XCircle,
} from "lucide-react-native";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";
import type { ScanOutcome } from "../../lib/data/types";
import {
  evaluateScan,
  IDLE_GATE,
  releaseScan,
  type ScanGateState,
} from "../../lib/scan-gate";

interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => Promise<ScanOutcome>;
  /** Order-level progress, so the picker knows when to stop scanning. */
  unitsPicked: number;
  unitsTotal: number;
}

/**
 * Barcode types a grocery hub actually encounters. Narrowed on purpose: every
 * extra format is more work per frame, and QR/PDF417 on a shelf label is not a
 * product code — leaving them on mostly means misreads.
 */
const BARCODE_TYPES: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "itf14",
];

export function BarcodeScanner({
  visible,
  onClose,
  onScan,
  unitsPicked,
  unitsTotal,
}: BarcodeScannerProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);

  // A ref, not state: the gate is read inside the scan callback on every frame
  // and must be current, not whatever the last render closed over. Re-rendering
  // per frame would also be wasteful.
  const gate = useRef<ScanGateState>(IDLE_GATE);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Reset between openings so a stale confirmation is not the first thing shown.
  useEffect(() => {
    if (visible) {
      setOutcome(null);
      setBusy(false);
      gate.current = IDLE_GATE;
    } else {
      setTorch(false);
    }
  }, [visible]);

  const handleBarcode = useCallback(
    async ({ data }: { data: string }) => {
      const decision = evaluateScan(gate.current, data, Date.now());
      if (!decision.accept) return;

      // Applied before awaiting: frames keep arriving during the round trip, and
      // waiting for the response to start blocking is what lets the same code
      // through several times.
      gate.current = decision.next;
      setBusy(true);

      try {
        const result = await onScan(data);
        setOutcome(result);
        void Haptics.notificationAsync(
          result.ok
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error,
        );
        if (result.orderComplete) {
          // Let the confirmation land, then leave — there is nothing else to
          // scan, and keeping the camera open invites an accidental read.
          closeTimer.current = setTimeout(onClose, 900);
        }
      } finally {
        gate.current = releaseScan(gate.current);
        setBusy(false);
      }
    },
    [onScan, onClose],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-ink-950">
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={(r) => void handleBarcode(r)}
          />
        ) : (
          <PermissionGate
            status={permission}
            onRequest={requestPermission}
            onClose={onClose}
          />
        )}

        {permission?.granted ? (
          <>
            <Reticle active={!busy && outcome === null} />

            <View
              className="absolute left-0 right-0 flex-row items-center justify-between px-screen"
              style={{ top: insets.top + 8 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close scanner"
                onPress={onClose}
                hitSlop={8}
                className="h-control w-control items-center justify-center rounded-pill bg-ink-950/60 active:opacity-70"
              >
                <X size={22} strokeWidth={2} className="text-white" />
              </Pressable>

              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: torch }}
                accessibilityLabel={torch ? "Turn off the light" : "Turn on the light"}
                onPress={() => setTorch((t) => !t)}
                hitSlop={8}
                className={cn(
                  "h-control w-control items-center justify-center rounded-pill active:opacity-70",
                  torch ? "bg-primary" : "bg-ink-950/60",
                )}
              >
                {torch ? (
                  <Flashlight
                    size={20}
                    strokeWidth={2}
                    className="text-primary-foreground"
                  />
                ) : (
                  <FlashlightOff
                    size={20}
                    strokeWidth={2}
                    className="text-white"
                  />
                )}
              </Pressable>
            </View>

            <View
              className="absolute left-0 right-0 gap-space-4 px-screen"
              style={{ bottom: insets.bottom + 24 }}
            >
              {outcome ? <ScanFeedback outcome={outcome} /> : null}
              <ScanProgress picked={unitsPicked} total={unitsTotal} />
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

/** Dimmed surround with a clear aperture, so the picker knows where to aim. */
function Reticle({ active }: { active: boolean }) {
  const glow = useDerivedValue(() =>
    withSpring(active ? 1 : 0, { damping: 20, stiffness: 200 }),
  );
  const style = useAnimatedStyle(() => ({
    borderColor: active ? "#FFC50B" : "#159B62",
    opacity: 0.55 + glow.value * 0.45,
  }));

  return (
    <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
      <Animated.View
        style={style}
        className="h-[190px] w-[280px] rounded-xl border-2"
      />
      <Text size="caption" className="pt-space-5 text-ink-300">
        Point at the barcode
      </Text>
    </View>
  );
}

function ScanFeedback({ outcome }: { outcome: ScanOutcome }) {
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(160)}
      className={cn(
        "flex-row items-center gap-space-3 rounded-lg p-space-4",
        outcome.ok ? "bg-success" : "bg-destructive",
      )}
    >
      {outcome.ok ? (
        <CheckCircle2
          size={22}
          strokeWidth={2.5}
          className="text-success-foreground"
        />
      ) : (
        <XCircle
          size={22}
          strokeWidth={2.5}
          className="text-destructive-foreground"
        />
      )}
      <View className="flex-1">
        <Text
          weight="semibold"
          size="sm"
          numberOfLines={2}
          className={
            outcome.ok ? "text-success-foreground" : "text-destructive-foreground"
          }
        >
          {outcome.message}
        </Text>
        {outcome.ok && outcome.total !== undefined ? (
          <Text
            size="caption"
            className={cn(
              "opacity-90",
              outcome.ok
                ? "text-success-foreground"
                : "text-destructive-foreground",
            )}
          >
            {outcome.picked} of {outcome.total} picked
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Order progress, so the picker can stay in the camera until it is done. */
function ScanProgress({ picked, total }: { picked: number; total: number }) {
  const safeTotal = Math.max(1, total);
  const pct = useDerivedValue(() =>
    withSpring((Math.min(picked, safeTotal) / safeTotal) * 100, {
      damping: 22,
      stiffness: 170,
    }),
  );
  const fill = useAnimatedStyle(() => ({ width: `${pct.value}%` }));

  return (
    <View className="gap-space-2 rounded-lg bg-ink-950/70 p-space-4">
      <View className="flex-row items-baseline justify-between">
        <Text weight="bold" size="sm" className="text-white">
          {Math.min(picked, total)} of {total} units
        </Text>
        <Text size="caption" className="text-ink-300">
          Keep scanning
        </Text>
      </View>
      <View className="h-space-2 overflow-hidden rounded-pill bg-ink-700">
        <Animated.View style={fill} className="h-full rounded-pill bg-primary" />
      </View>
    </View>
  );
}

function PermissionGate({
  status,
  onRequest,
  onClose,
}: {
  status: ReturnType<typeof useCameraPermissions>[0];
  onRequest: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  // `canAskAgain === false` means the OS will no longer show the prompt, so
  // asking again does nothing and the only route is Settings. Offering "Allow
  // camera" there would be a button that visibly fails.
  const blocked = status !== null && !status.granted && !status.canAskAgain;

  return (
    <View
      className="flex-1 items-center justify-center gap-space-6 px-space-8"
      style={{ paddingTop: insets.top }}
    >
      <View className="h-[72px] w-[72px] items-center justify-center rounded-pill bg-ink-800">
        <CameraIcon size={32} strokeWidth={2} className="text-ink-300" />
      </View>
      <View className="gap-space-3">
        <Text variant="heading" size="h2" className="text-center text-white">
          {blocked ? "Camera access is off" : "Scan with the camera"}
        </Text>
        <Text size="base" className="max-w-[300px] text-center text-ink-300">
          {blocked
            ? "Turn the camera on for Blink in your device settings to scan barcodes."
            : "Blink needs the camera to read barcodes while you pick. You can always type a code instead."}
        </Text>
      </View>
      <View className="w-full gap-space-3">
        {blocked ? (
          <Button
            full
            size="lg"
            label="Open settings"
            onPress={() => {
              void Linking.openSettings();
            }}
          />
        ) : (
          <Button
            full
            size="lg"
            label="Allow camera"
            onPress={onRequest}
          />
        )}
        <Button
          full
          variant="ghost"
          label="Type a code instead"
          onPress={onClose}
          className="active:opacity-70"
        />
      </View>
      {Platform.OS === "web" ? (
        <Text size="caption" className="text-center text-ink-500">
          Scanning needs a device camera.
        </Text>
      ) : null}
    </View>
  );
}
