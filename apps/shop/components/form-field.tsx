import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import * as LabelPrimitive from "@rn-primitives/label";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";
import { Icon } from "./icon";

/**
 * Every text field in this app, and the label above it.
 *
 * ── Why this is not `@repo/mobile-ui`'s `Input` ───────────────────────────
 *
 * It used to be, and only the three auth screens deviated. The sign-in
 * handoff pinned that flow to a 52px capsule and said so explicitly — "this
 * flow is deliberately all-pill; 12px is the system's default control radius
 * elsewhere" — so the pill lived in `auth/pill-field.tsx` and the other ~20
 * screens kept the system default.
 *
 * That split is deliberately over: the shop app is now all-pill, everywhere,
 * because a customer who signs in through a capsule and then meets a
 * 12px-radius box on the address form reads two different apps. The handoff's
 * sentence was about a flow in isolation; uniformity across the app is the
 * stronger claim, and it is the one being made here.
 *
 * `@repo/mobile-ui`'s `Input` and `Label` are deliberately left alone: the
 * rider app renders them too, and nothing has been decided about its look.
 * This file is the shop's own, which is why the swap was an import path per
 * screen rather than an edit to the shared package.
 *
 * ── The spec, from the sign-in handoff ────────────────────────────────────
 *
 * `height: 52px`, `padding: 0 18px`, `border-radius: 999px`, `1px solid
 * #E4E7EC` (ink-200), white fill, 15px body text in ink-950, placeholder
 * ink-500, label 12px/600 ink-800 with a 7px gap above the input.
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
export function Input({
  label,
  error,
  icon,
  reveal = false,
  containerClassName,
  className,
  editable = true,
  ...props
}: TextInputProps & {
  /**
   * Optional, because most screens render a `Label` of their own above the
   * field and wire it up with `aria-labelledby` — the auth screens are the
   * ones that pass it here.
   */
  label?: string;
  error?: string | null;
  /** Rendered inside the field, before the text. */
  icon?: React.ReactNode;
  /**
   * Adds the eye / eye-off toggle and manages `secureTextEntry` itself. The
   * field owns that state rather than the screen because nothing outside
   * needs to know whether the characters are currently visible.
   */
  reveal?: boolean;
  containerClassName?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  return (
    <View className={cn("gap-[7px]", containerClassName)}>
      {label ? <Label>{label}</Label> : null}

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
          className={cn(
            "h-control-lg rounded-pill gap-space-3 flex-row items-center border bg-white px-[18px]",
            error
              ? "border-destructive"
              : focused
                ? "border-ink-950"
                : "border-ink-200",
            !editable && "opacity-60",
          )}
        >
          {icon}
          {/*
            `{...props}` goes FIRST, and everything this component owns comes
            after it.

            The other order is the one that looks right and silently loses:
            with the spread last, a screen passing its own `onFocus` replaces
            the handler that tracks focus — so the field keeps its halo after
            blurring — and a screen passing `secureTextEntry` alongside
            `reveal` overrides the eye toggle, which then does nothing. Both
            handlers below call the caller's own, so nothing is dropped by
            putting them here.
          */}
          <TextInput
            {...props}
            className={cn(
              "text-body text-ink-950 h-full flex-1 font-sans",
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
              // 40px round target inset 6px from the right edge of a 52px
              // field, exactly as the handoff draws it. `-mr-[12px]` pulls it
              // back out of the field's own 18px gutter to land on that 6px.
              className="rounded-pill active:bg-ink-50 -mr-[12px] size-[40px] items-center justify-center"
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

/**
 * The label above a field.
 *
 * Same primitive as `@repo/mobile-ui`'s, restyled to the auth screens' label
 * rather than the system's: 12px semibold in ink-800, and NOT uppercase. The
 * uppercase eyebrow is still the right treatment for a section heading — it
 * is what separates "SHIPPING" as a group from "Town or city" as a field —
 * and using it for both is what made the two indistinguishable.
 */
export function Label({
  className,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  ...props
}: LabelPrimitive.TextProps & {
  ref?: React.RefObject<LabelPrimitive.TextRef>;
}) {
  return (
    <LabelPrimitive.Root
      className="web:cursor-default"
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <LabelPrimitive.Text
        className={cn("text-label text-ink-800 font-semibold", className)}
        {...props}
      />
    </LabelPrimitive.Root>
  );
}
