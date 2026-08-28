import { useRef } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Text } from "./text";
import { cn } from "../../lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  /** Signals the boxes red without moving the layout. */
  invalid?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
}

/**
 * A real code field: one hidden TextInput behind the boxes.
 *
 * Per-box inputs are the usual approach and the usual mistake — they break
 * paste, break the SMS autofill suggestion, and make backspace-across-boxes
 * fiddly. A single input with `textContentType="oneTimeCode"` /
 * `autoComplete="sms-otp"` gets one-tap autofill on both platforms for free.
 *
 * The reference app rendered six static divs with hardcoded digits.
 *
 * Promoted here from apps/rider so the shop's sign-in uses the same control
 * rather than a third implementation. It is genuinely unopinionated — no
 * domain, no data, no navigation — which is the bar for living in this package.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  invalid = false,
  autoFocus = false,
  editable = true,
}: OtpInputProps) {
  const inputRef = useRef<TextInput>(null);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable
      accessibilityRole="none"
      onPress={() => inputRef.current?.focus()}
      className="relative"
    >
      <View className="flex-row justify-between gap-space-2">
        {digits.map((digit, i) => (
          <View
            key={i}
            className={cn(
              "h-[48px] flex-1 items-center justify-center rounded-md border-hairline bg-card",
              digit ? "border-strong" : "border-border",
              invalid && "border-destructive",
              editable && i === activeIndex && !digit && "border-primary",
            )}
          >
            <Text variant="heading" size="h2">
              {digit}
            </Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        // Positioned over the boxes rather than off-screen: an off-screen input
        // makes the OS autofill chip render in the wrong place on iOS.
        className="absolute left-0 top-0 h-full w-full opacity-0"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        editable={editable}
        accessibilityLabel={`${length}-digit code`}
        caretHidden
      />
    </Pressable>
  );
}
