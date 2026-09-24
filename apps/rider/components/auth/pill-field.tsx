import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

/**
 * The auth screens' text field — the shop's pill field
 * (`apps/shop/components/form-field.tsx`), so a crew member signing in sees
 * the same form a customer does.
 *
 * Kept local rather than promoted to `@repo/mobile-ui`: the shared `Input` is
 * the rider app's default control everywhere else (12px radius), and only
 * these screens follow the sign-in handoff's capsule. Same spec as the shop's:
 * 52px tall, full pill radius, ink-200 border, 12px/600 ink-800 label 7px
 * above, ink border plus a 3px blink-200 halo on focus, red border and a
 * message underneath on error.
 */
export function PillField({
  label,
  error,
  reveal = false,
  editable = true,
  className,
  ...props
}: TextInputProps & {
  label: string;
  error?: string | null;
  /** Eye / eye-off toggle; the field owns whether the characters show. */
  reveal?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  return (
    <View className="gap-[7px]">
      <Text className="text-label font-semibold text-ink-800">{label}</Text>

      <View className="justify-center">
        {/* The focus halo, behind the field — Android draws no box-shadow. */}
        {focused && !error ? (
          <View
            pointerEvents="none"
            className="absolute -inset-[3px] rounded-pill bg-blink-200"
          />
        ) : null}

        <View
          className={cn(
            "h-control-lg flex-row items-center gap-space-3 rounded-pill border bg-white px-[18px]",
            error
              ? "border-destructive"
              : focused
                ? "border-ink-950"
                : "border-ink-200",
            !editable && "opacity-60",
          )}
        >
          {/*
            Props first, owned handlers after — with the spread last, a caller's
            `onFocus` would replace the one tracking focus and the halo would
            stick. Both handlers below still call the caller's own.
          */}
          <TextInput
            {...props}
            className={cn(
              "h-full flex-1 font-sans text-body text-ink-950",
              className,
            )}
            placeholderTextColor="#818A99"
            secureTextEntry={reveal ? !shown : props.secureTextEntry}
            editable={editable}
            onFocus={(event) => {
              setFocused(true);
              props.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              props.onBlur?.(event);
            }}
          />

          {reveal ? (
            <Pressable
              onPress={() => setShown((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={shown ? "Hide password" : "Show password"}
              className="-mr-[12px] size-[40px] items-center justify-center rounded-pill active:bg-ink-50"
            >
              {shown ? (
                <Eye size={18} strokeWidth={2} className="text-subtle" />
              ) : (
                <EyeOff size={18} strokeWidth={2} className="text-subtle" />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      {error ? (
        <Text size="sm" variant="destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
