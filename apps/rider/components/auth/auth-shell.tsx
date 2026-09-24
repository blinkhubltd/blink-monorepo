import type { ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";

/**
 * The frame every rider auth screen sits in — the shop's sign-in layout
 * (`apps/shop/components/auth/auth-form.tsx`), minus the SSO row: white
 * surface, `28px 16px 24px` padding, a centred logo/title/sub-line header,
 * and an optional footer pinned to the bottom of the viewport.
 *
 * `onBack` renders the chevron. Sign-in has nothing behind it, so it passes
 * none; the code and reset screens do.
 */
export function AuthShell({
  onBack,
  footer,
  children,
}: {
  onBack?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-white">
      {/*
        "padding" on Android too, not `undefined`. Expo 57 is edge-to-edge on
        Android, where the window no longer resizes for the keyboard — so
        leaving it to the OS let the number pad cover the password field and
        the button beneath the code boxes.
      */}
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="h-control flex-row items-center px-screen pt-space-2">
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              className="-ml-space-2 size-control items-center justify-center rounded-pill active:opacity-70"
            >
              <ChevronLeft size={24} strokeWidth={2} className="text-strong" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 28,
            paddingHorizontal: 16,
            paddingBottom: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          {/* `mt-auto` pins the footer to the bottom of the viewport. */}
          {footer ? <View className="mt-auto">{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
      {/* 3.806:1 is the wordmark's own aspect ratio, as the shop's Logo uses. */}
      <Image
        source={require("../../assets/images/logo-blink-ink.png")}
        style={{ height: 34, width: 34 * 3.806 }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Blink"
      />
      <Text size="h2" weight="bold" className="mt-[24px] text-center text-ink-950">
        {title}
      </Text>
      <Text size="sm" className="mt-[10px] text-center text-ink-500">
        {subtitle}
      </Text>
    </View>
  );
}

/** "Prompt? Action" — ink and underlined, never gold, as in the shop. */
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
    <View className="flex-row flex-wrap items-center justify-center pt-[28px]">
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
