import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@repo/mobile-ui/components/ui/text";
import type { SocialProvider } from "../../lib/auth/use-social-sign-in";

/**
 * "Or continue with" — Google and Apple, side by side.
 *
 * Two equal-width 52px capsules, `1px solid #E4E7EC`, white, 13px/600 ink
 * label beside an 18×18 mark, 12px between them. Straight from the handoff.
 *
 * ── The marks are the vendors' own artwork ────────────────────────────────
 *
 * Both are the exact paths the handoff ships, which are in turn each vendor's
 * published mark. The handoff is explicit — "do not re-draw or restyle them"
 * — and both companies' sign-in branding guidelines say the same thing, so
 * the four-colour Google G keeps its four colours and the Apple mark stays
 * ink on white.
 *
 * ── Apple is iOS-only ────────────────────────────────────────────────────
 *
 * Not a layout preference: Sign in with Apple does not exist on Android, and
 * on iOS it is an App Store requirement (guideline 4.8) once any other social
 * option is offered. On Android the Google button takes the full width rather
 * than sitting half-width beside a gap.
 */
export function SsoRow({
  onPress,
  pending,
  disabled,
}: {
  onPress: (provider: SocialProvider) => void;
  /** The provider currently mid-flow, or null. */
  pending: SocialProvider | null;
  disabled?: boolean;
}) {
  const showApple = Platform.OS === "ios";

  return (
    <View className="flex-row gap-[12px]">
      <SsoButton
        provider="google"
        label="Google"
        mark={<GoogleMark />}
        onPress={onPress}
        loading={pending === "google"}
        disabled={disabled}
      />
      {showApple ? (
        <SsoButton
          provider="apple"
          label="Apple"
          mark={<AppleMark />}
          onPress={onPress}
          loading={pending === "apple"}
          disabled={disabled}
        />
      ) : null}
    </View>
  );
}

function SsoButton({
  provider,
  label,
  mark,
  onPress,
  loading,
  disabled,
}: {
  provider: SocialProvider;
  label: string;
  mark: React.ReactNode;
  onPress: (provider: SocialProvider) => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onPress(provider)}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      accessibilityState={{ disabled: !!disabled || loading, busy: loading }}
      className={`h-control-lg border-ink-200 rounded-pill flex-1 flex-row items-center justify-center gap-[10px] border bg-white active:scale-[0.96] active:bg-ink-50 ${
        disabled || loading ? "opacity-50" : ""
      }`}
    >
      {loading ? (
        <ActivityIndicator size="small" />
      ) : (
        <>
          {mark}
          <Text size="sm" weight="semibold" className="text-ink-950">
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Google's own four-colour "G". Never recoloured. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z"
      />
      <Path
        fill="#FBBC05"
        d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.7-3.7-13.6-8.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </Svg>
  );
}

/** Apple's mark, ink on white — the pairing Apple's own guidelines specify. */
function AppleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#0A0E16"
        d="M16.3 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6zM14.1 5.3c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z"
      />
    </Svg>
  );
}
