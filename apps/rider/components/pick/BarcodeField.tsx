import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ScanLine, X } from "lucide-react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

interface BarcodeFieldProps {
  onScan: (barcode: string) => Promise<{ ok: boolean; message?: string }>;
  disabled?: boolean;
}

/**
 * Barcode entry for the pick list.
 *
 * This is a text field, not a camera. Hardware scanners in a warehouse act as
 * keyboard wedges — they type the code and send Enter — so a focused field is
 * the fastest path with the equipment a hub already has, and it works with a
 * thumb when there is no scanner.
 *
 * A camera scanner is a genuine addition on top of this and needs `expo-camera`,
 * which is not a dependency yet. Deliberately not faked: an inert camera button
 * is worse than an honest field.
 *
 * `blurOnSubmit={false}` and clearing in place are what make repeat scanning
 * work — a picker scans twelve eggs without touching the screen between them.
 */
export function BarcodeField({ onScan, disabled = false }: BarcodeFieldProps) {
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
        setFeedback({ ok: false, message: result.message ?? "Not on this order" });
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
        ) : null}
      </Pressable>

      {feedback && !feedback.ok ? (
        <Text variant="destructive" size="caption">
          {feedback.message}
        </Text>
      ) : null}
    </View>
  );
}
