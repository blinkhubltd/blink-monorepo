import { Pressable, View } from "react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Logo } from "../logo";

/**
 * The parts the sign-up and sign-in screens share.
 *
 * Both are the same page in the handoff — "identical shell and component specs
 * to sign up, with these differences" — so the shell is one component and the
 * differences are props, rather than two screens drifting apart the first time
 * one of them is edited.
 */

/** Ink logo, title, sub-line. Centred, 26px of air beneath it. */
export function AuthHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View className="mb-[26px] items-center">
      <Logo tone="ink" height={34} />
      {/*
        24px, not 14: the handoff's header is a flex column with `gap: 10px`
        AND `margin-top: 14px` on the title, and in flexbox those add rather
        than collapsing. The sub-line below takes the gap alone.
      */}
      <Text
        size="h2"
        weight="bold"
        className="text-ink-950 mt-[24px] text-center"
      >
        {title}
      </Text>
      <Text size="sm" className="text-ink-500 mt-[10px] text-center">
        {subtitle}
      </Text>
    </View>
  );
}

/** A hairline either side of "Or continue with". */
export function AuthDivider() {
  return (
    // `margin: 24px 0 18px`, written as two one-sided utilities so neither can
    // shadow the other depending on which rule Tailwind emits last.
    <View className="mb-[18px] mt-[24px] flex-row items-center gap-[12px]">
      <View className="bg-ink-200 h-[1px] flex-1" />
      <Text size="caption" className="text-ink-500">
        Or continue with
      </Text>
      <View className="bg-ink-200 h-[1px] flex-1" />
    </View>
  );
}

/**
 * "Already have an account? Sign in" and its opposite number.
 *
 * The link is ink, not gold, and underlined — the handoff calls this out
 * specifically: "note links are ink, not gold: gold is reserved for prices".
 */
export function AuthFooterLink({
  prompt,
  action,
  onPress,
}: {
  prompt: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View className="pt-[28px] flex-row items-center justify-center">
      <Text size="sm" className="text-ink-500">
        {prompt}{" "}
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        hitSlop={8}
        className="active:opacity-70"
      >
        <Text size="sm" weight="semibold" className="text-ink-950 underline">
          {action}
        </Text>
      </Pressable>
    </View>
  );
}
