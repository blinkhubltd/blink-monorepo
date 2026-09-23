import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon } from "../icon";

/**
 * The auth flow's text field: a 52px capsule with its label above it.
 *
 * ── Why this is not `@repo/mobile-ui`'s `Input` ───────────────────────────
 *
 * That component is the system default — 44px tall, 12px radius — and it is
 * correct for the ~20 screens that use it. The sign-in handoff pins this flow
 * to something different on purpose and says so: "this flow is deliberately
 * all-pill; 12px is the system's default control radius elsewhere". Changing
 * `Input` to match would drag the pill into checkout, the address book and
 * every other form, which is the opposite of what the design asks for. So the
 * deviation lives here, in the three screens it belongs to.
 *
 * Spec, from the handoff: `height: 52px`, `padding: 0 18px`, `border-radius:
 * 999px`, `1px solid #E4E7EC` (ink-200), white fill, 15px body text in ink-950,
 * placeholder ink-500, label 12px/600 ink-800 with a 7px gap above the input.
 *
 * ── Focus ────────────────────────────────────────────────────────────────
 *
 * Ink border plus a 3px `#FFE68F` halo (blink-200) — "never the browser
 * default blue". React Native has no `box-shadow` on Android, so the halo is a
 * real ring: an absolutely positioned view inset by -3px behind the field,
 * which paints identically on both platforms. It sits behind rather than
 * around so it cannot change the field's own 52px box.
 *
 * ── Errors ───────────────────────────────────────────────────────────────
 *
 * Border goes `#E23B33` and the message renders under the field at 13px in the
 * same red, per the handoff. A field in error that is also focused keeps the
 * red border: the error is the more urgent of the two states to communicate.
 */
export function PillField({
  label,
  error,
  reveal = false,
  ...props
}: TextInputProps & {
  label: string;
  error?: string | null;
  /**
   * Adds the eye / eye-off toggle and manages `secureTextEntry` itself. The
   * field owns that state rather than the screen because nothing outside
   * needs to know whether the characters are currently visible.
   */
  reveal?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  return (
    <View className="gap-[7px]">
      <Text size="label" weight="semibold" className="text-ink-800">
        {label}
      </Text>

      <View className="justify-center">
        {/*
          The focus halo. Behind the field and inset by -3px, so it reads as
          the handoff's `box-shadow: 0 0 0 3px` without RN needing shadows —
          which Android does not render on a bordered box anyway.
        */}
        {focused && !error ? (
          <View
            pointerEvents="none"
            className="bg-blink-200 rounded-pill absolute -inset-[3px]"
          />
        ) : null}

        <View
          className={`h-control-lg rounded-pill flex-row items-center border bg-white px-[18px] ${
            error
              ? "border-destructive"
              : focused
                ? "border-ink-950"
                : "border-ink-200"
          }`}
        >
          <TextInput
            className="text-body text-ink-950 h-full flex-1 font-sans"
            placeholderTextColor="#818A99"
            secureTextEntry={reveal && !shown}
            onFocus={(event) => {
              setFocused(true);
              props.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              props.onBlur?.(event);
            }}
            {...props}
          />

          {reveal ? (
            <Pressable
              onPress={() => setShown((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={shown ? "Hide password" : "Show password"}
              // 40px round target inset 6px from the right edge of a 52px
              // field, exactly as the handoff draws it. `-mr-[12px]` pulls it
              // back out of the field's own 18px gutter to land on that 6px.
              className="-mr-[12px] size-[40px] items-center justify-center rounded-pill active:bg-ink-50"
            >
              <Icon
                name={shown ? "eye-outline" : "eye-off-outline"}
                size={18}
                tone="subtle"
              />
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
