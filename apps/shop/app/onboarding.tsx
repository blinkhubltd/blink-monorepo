import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";

import { Logo } from "../components/logo";
import { markOnboardingSeen } from "../lib/onboarding";

/**
 * First launch: three photographs, three promises, one CTA.
 *
 * ── Everything is absolutely positioned over the photo ───────────────────
 *
 * Per the handoff, this is a single full-bleed stack rather than a column:
 * the photo layer fills the screen, a scrim sits over it, and the logo and
 * the bottom block float on top. Nothing here scrolls.
 *
 * ── The photo for slide three ────────────────────────────────────────────
 *
 * The handoff ships two photographs and marks the third an explicit
 * placeholder: "Onboarding slide 3 is an empty placeholder in the prototype —
 * supply a rider photo." None was supplied, so that slide renders the ink
 * surface the prototype's own placeholder uses. The scrim and the type read
 * correctly against it, so this is presentable rather than broken — but it is
 * a hole with a shape, and the moment a rider photo exists it goes in
 * `assets/images/onboarding/rider.jpg` and gets added to `SLIDES` below.
 *
 * ── Motion ───────────────────────────────────────────────────────────────
 *
 * Cross-fade at 380ms on the design system's own easing curve, auto-advance
 * every 5s, wrapping. Any manual interaction — a dot, a side tap, a swipe —
 * cancels the auto-advance for the rest of the session, which is the
 * handoff's rule and the right one: someone who has taken control should not
 * have the screen move under them a moment later.
 *
 * `prefers-reduced-motion` turns off both the auto-advance and the fade, per
 * the handoff. On a phone that setting is a real accessibility need (vestibular
 * disorders), not a preference to second-guess.
 */

const SLIDES = [
  {
    key: "essentials",
    image: require("../assets/images/onboarding/essentials.jpg"),
    alt: "Shelves of everyday essentials",
    title: "Your shopping at the gate in 10 minutes.",
    body: "Groceries, fresh produce and household basics from the hub down the road.",
  },
  {
    key: "pharmacy",
    image: require("../assets/images/onboarding/pharmacy.jpg"),
    alt: "Pharmacy shelf",
    title: "Painkillers before the pain wins.",
    body: "Pharmacy shelf included — the same 10 minutes, no queue at the chemist.",
  },
  {
    key: "rider",
    // Awaiting the rider photograph; see the note in this file's header.
    image: null,
    alt: "A Blink rider on the way",
    title: "A rider is already on the way.",
    body: "Track them street by street, and pay with M-Pesa when they reach you.",
  },
] as const;

const FADE_MS = 380;
const AUTOPLAY_MS = 5000;
/** The design system's `--ease-out`. */
const EASING = Easing.bezier(0.2, 0.8, 0.3, 1);

/** The scrim over the photography, verbatim from the handoff. */
const SCRIM = [
  "rgba(10,14,22,0.55)",
  "rgba(10,14,22,0)",
  "rgba(10,14,22,0.72)",
  "rgba(10,14,22,0.94)",
] as const;
const SCRIM_STOPS = [0, 0.32, 0.62, 1] as const;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Once true, stays true for the session. A ref rather than state: nothing
  // renders differently because of it, and a re-render would restart the
  // effect that owns the timer.
  const interacted = useRef(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => alive && setReduceMotion(enabled))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || interacted.current) return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      AUTOPLAY_MS,
    );
    return () => clearTimeout(timer);
  }, [index, reduceMotion]);

  /** Every manual path goes through here, so the cancel cannot be forgotten. */
  const jump = useCallback((next: number) => {
    interacted.current = true;
    setIndex((current) => {
      const count = SLIDES.length;
      return ((next % count) + count) % count;
    });
  }, []);

  const leave = useCallback((to: "/(auth)/sign-up" | "/(auth)/sign-in") => {
    // Marked on the way out rather than on mount: a cold start that crashes
    // before anyone saw this should still show it next time.
    markOnboardingSeen();
    router.replace(to);
  }, []);

  // Horizontal swipe, which the handoff asks for and the HTML could not show.
  //
  // `activeOffsetX` keeps a vertical drag or a plain tap from registering as
  // a swipe; the 40px threshold then ignores the small horizontal wobble of a
  // tap that did cross it. `runOnJS(true)` is required, not optional: without
  // it `onEnd` is a worklet on the UI thread and calling `jump` — a React
  // setState closure — from there crashes rather than advancing the slide.
  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .runOnJS(true)
    .onEnd((event) => {
      if (Math.abs(event.translationX) < 40) return;
      jump(index + (event.translationX < 0 ? 1 : -1));
    });

  return (
    <View className="bg-ink-950 flex-1">
      <StatusBar style="light" />

      <GestureDetector gesture={swipe}>
        <View className="flex-1">
          {/* Photo layer. Every slide is mounted; only opacity changes. */}
          <View className="absolute inset-0">
            {SLIDES.map((slide, i) => (
              <Slide
                key={slide.key}
                slide={slide}
                active={i === index}
                instant={reduceMotion}
              />
            ))}
          </View>

          <LinearGradient
            colors={[...SCRIM]}
            locations={[...SCRIM_STOPS]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            pointerEvents="none"
          />

          {/*
            Invisible prev / next targets: 35% wide, 64% tall, pinned to the
            top corners. They sit under the bottom block, so they cannot
            swallow a tap meant for the CTA or the dots.
          */}
          <Pressable
            onPress={() => jump(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            className="absolute left-0 top-0 h-[64%] w-[35%]"
          />
          <Pressable
            onPress={() => jump(index + 1)}
            accessibilityRole="button"
            accessibilityLabel="Next"
            className="absolute right-0 top-0 h-[64%] w-[35%]"
          />

          {/*
            56px from the top on the design canvas, which has no notch. On a
            real device that measurement starts below the status bar, so the
            safe-area inset is added rather than replacing it.
          */}
          <View
            pointerEvents="none"
            className="absolute left-0 right-0 items-center"
            style={{ top: insets.top + 24 }}
          >
            <Logo tone="white" height={28} />
          </View>

          <View
            className="px-screen absolute bottom-0 left-0 right-0 gap-[20px]"
            style={{ paddingBottom: Math.max(insets.bottom, 34) }}
          >
            <Text
              className="text-[34px] font-bold leading-[36px] tracking-[-0.68px] text-white"
              // 800 is not in the app's four loaded faces (see tailwind.config's
              // fontFamily note); Bold is the closest real weight, and a
              // synthesised 800 would smear the glyphs rather than thicken them.
              weight="bold"
            >
              {SLIDES[index]!.title}
            </Text>

            <Text
              className="text-[15px] leading-[22px]"
              // `max-width: 30ch` has no React Native equivalent, so it is
              // resolved against the face actually shipping: Inter's "0"
              // advance is ~0.6em, so 30ch at 15px is ~270px. Keeping the
              // measure short is the point of the rule — the body copy is not
              // meant to run the full width under the headline.
              style={{ color: "rgba(255,255,255,0.88)", maxWidth: 270 }}
            >
              {SLIDES[index]!.body}
            </Text>

            <View className="flex-row gap-[7px]">
              {SLIDES.map((slide, i) => (
                <Pressable
                  key={slide.key}
                  onPress={() => jump(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Slide ${i + 1}`}
                  accessibilityState={{ selected: i === index }}
                  // The 7px dot is far under the 44px minimum target, so the
                  // hit area is extended rather than the dot being drawn
                  // bigger than the design says.
                  hitSlop={{ top: 18, bottom: 18, left: 6, right: 6 }}
                  className={`h-[7px] rounded-pill ${
                    i === index ? "bg-blink-400 w-[26px]" : "w-[7px]"
                  }`}
                  style={
                    i === index
                      ? undefined
                      : { backgroundColor: "rgba(255,255,255,0.45)" }
                  }
                />
              ))}
            </View>

            <View className="mt-[4px] gap-[14px]">
              <Button
                label="Get started"
                size="ctaLg"
                full
                onPress={() => leave("/(auth)/sign-up")}
              />

              <View className="flex-row items-center justify-center">
                <Text
                  className="text-[13px]"
                  style={{ color: "rgba(255,255,255,0.82)" }}
                >
                  Already have an account?{" "}
                </Text>
                <Pressable
                  onPress={() => leave("/(auth)/sign-in")}
                  accessibilityRole="link"
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Text
                    weight="semibold"
                    className="text-[13px] text-white underline"
                  >
                    Sign in
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

function Slide({
  slide,
  active,
  instant,
}: {
  slide: (typeof SLIDES)[number];
  active: boolean;
  instant: boolean;
}) {
  const opacity = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    opacity.value = instant
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, { duration: FADE_MS, easing: EASING });
  }, [active, instant, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    // `Animated.View` carries ONLY `style`, never `className`: NativeWind
    // resolves classes through a registration map keyed by component identity,
    // and nothing registers Reanimated's view — a class on it is silently
    // nothing at all. The classes live on the plain `View` inside, which is
    // registered. Same rule as `components/banner-carousel.tsx`.
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    >
      <View className="bg-ink-900 h-full w-full">
        {slide.image ? (
          <Image
            source={slide.image}
            resizeMode="cover"
            className="h-full w-full"
            accessibilityRole="image"
            accessibilityLabel={slide.alt}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}
