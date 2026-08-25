import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Camera, ScanLine, X } from "lucide-react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";
import type { ScanOutcome } from "../../lib/data/types";

interface BarcodeFieldProps {
  onScan: (barcode: string) => Promise<ScanOutcome>;
  /** Opens the camera scanner. */
  onOpenCamera: () => void;
  disabled?: boolean;
}

/**
 * Typed barcode entry, with the camera one tap away.
 *
 * The field is not a fallback for the camera — it is the faster path with the
 * equipment a hub already has. Warehouse scanners act as keyboard wedges: they
 * type the code and send Enter, so a focused field consumes them at the speed
 * the picker can present items, with no camera to aim. It is also the only route
 * when a barcode is torn, wrapped round a curve, or on a frozen bag.
 *
 * `blurOnSubmit={false}` and clearing in place are what make repeat scanning
 * work — a picker scans twelve eggs without touching the screen between them.
 */
export function BarcodeField({
  onScan,
  onOpenCamera,
  disabled = false,
}: BarcodeFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    { ok: boolean; message: string } | null
  >(null);

  async function submit(code: string) {
    const trimmed = code.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await onScan(trimmed);
      void Haptics.notificationAsync(
        result.ok
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
      if (!result.ok) {
        setFeedback({ ok: false, message: result.message });
      }
      // Cleared either way, so a rejected scan does not block the next one.
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-space-2">
      <Pressable
        accessibilityRole="none"
        onPress={() => inputRef.current?.focus()}
        className={cn(
          "h-control-lg flex-row items-center gap-space-3 rounded-md border-hairline bg-card px-space-4",
          feedback && !feedback.ok ? "border-destructive" : "border-input",
          disabled && "opacity-50",
        )}
      >
        <ScanLine size={20} strokeWidth={2} className="text-strong" />
        <TextInput
          ref={inputRef}
          className="flex-1 font-sans text-body text-foreground"
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setFeedback(null);
          }}
          onSubmitEditing={() => void submit(value)}
          placeholder="Scan or type a barcode"
          placeholderTextColor="#818A99"
          editable={!disabled && !busy}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          // Keeps focus between scans so a hardware scanner can fire repeatedly.
          blurOnSubmit={false}
          accessibilityLabel="Barcode"
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear barcode"
            onPress={() => {
              setValue("");
              setFeedback(null);
            }}
            hitSlop={8}
            className="h-space-8 w-space-8 items-center justify-center rounded-pill active:opacity-70"
          >
            <X size={16} strokeWidth={2} className="text-subtle" />
          </Pressable>
        ) : (
          /*
            Inside the field rather than a separate row: the two are the same
            action by different means, and splitting them into competing buttons
            makes the picker choose before they know which is quicker.
          */
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan with the camera"
            onPress={onOpenCamera}
            disabled={disabled}
            hitSlop={8}
            className="h-space-9 w-space-9 items-center justify-center rounded-md bg-inverse active:scale-[0.96]"
          >
            <Camera
              size={18}
              strokeWidth={2}
              className="text-inverse-foreground"
            />
          </Pressable>
        )}
      </Pressable>

      {feedback && !feedback.ok ? (
        <Text variant="destructive" size="caption">
          {feedback.message}
        </Text>
      ) : null}
    </View>
  );
}
