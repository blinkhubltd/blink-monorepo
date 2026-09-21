import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

/** How long a slide rests before the carousel advances itself. */
const AUTOPLAY_MS = 4000;

/**
 * How long the carousel keeps its hands off after the customer touches it.
 *
 * This is the whole answer to "autoscroll must not collide with a manual
 * swipe". Three things together make that true:
 *
 *   1. Advancing is a `setTimeout` CHAIN, not a `setInterval`. Each advance
 *      schedules the next one, so there is never a tick already in flight
 *      that lands mid-gesture — pausing is simply not scheduling.
 *   2. A touch cancels the pending timeout outright (`onTouchStart`, which
 *      fires before any scroll begins, rather than `onScrollBeginDrag`, which
 *      does not fire at all on a tap that never becomes a drag).
 *   3. The timer only restarts this long AFTER the gesture settles, so a
 *      customer reading a slide they swiped to is not yanked onward a few
 *      hundred milliseconds later.
 */
const RESUME_AFTER_TOUCH_MS = 6000;

/** 2:1 — promo artwork is wide, and this leaves the header band shallow. */
const ASPECT = 2;

type Banner = NonNullable<
  ReturnType<typeof useHomeBanners>
>[number];

function useHomeBanners() {
  return useQuery(api.data.banners.getHomeCarouselBanners);
}

/**
 * The home banner carousel, inside the yellow header band.
 *
 * ── The loop is seamless, and that is why the slides are cloned ───────────
 *
 * Wrapping from the last slide to the first by animating back through every
 * slide in between reads as the carousel rewinding itself, which is the
 * cheapest possible tell that nothing here is really infinite. So the
 * rendered list is `[last, ...banners, first]` and the scroll position is
 * silently corrected — without animation, while no gesture is in flight —
 * whenever it lands on one of those two clones. Forward motion is therefore
 * always forward, for an automatic advance and a manual swipe alike.
 *
 * With fewer than two banners there is nothing to loop, so the clones, the
 * timer and the dots are all skipped rather than special-cased downstream.
 */
export function BannerCarousel({ scrollY }: { scrollY?: SharedValue<number> }) {
  const banners = useHomeBanners();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  // The block's natural height, measured once from the content inside the
  // collapsing container. Measured rather than computed so the dots row and
  // the spacing above are included without having to keep three numbers in
  // agreement with the stylesheet.
  const [blockHeight, setBlockHeight] = useState(0);

  const count = banners?.length ?? 0;
  const looping = count > 1;

  // `[last, ...banners, first]`, so a swipe off either end has somewhere to
  // land that looks like the other end.
  const slides = useMemo(() => {
    if (!banners || banners.length === 0) return [];
    if (!looping) return banners;
    return [banners[banners.length - 1]!, ...banners, banners[0]!];
  }, [banners, looping]);

  /** Where slide `i` of `slides` sits, in pixels. */
  const offsetOf = useCallback((i: number) => i * width, [width]);

  /** The real banner index a `slides` position maps to. */
  const realIndexOf = useCallback(
    (slideIndex: number) => {
      if (!looping) return slideIndex;
      if (slideIndex === 0) return count - 1;
      if (slideIndex === count + 1) return 0;
      return slideIndex - 1;
    },
    [count, looping],
  );

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interacting = useRef(false);
  const focused = useRef(true);
  // The live scroll position, in slide units. Kept in a ref as well as state
  // because the timer callback must read the CURRENT position, and a closure
  // over state would advance from wherever the slide was when it was
  // scheduled — which is exactly how an autoplaying carousel jumps backwards
  // after a manual swipe.
  const slidePos = useRef(looping ? 1 : 0);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const scheduleNext = useCallback(
    (delay: number = AUTOPLAY_MS) => {
      clearTimer();
      if (!looping || width === 0 || interacting.current || !focused.current) {
        return;
      }
      timer.current = setTimeout(() => {
        const next = slidePos.current + 1;
        scrollRef.current?.scrollTo({ x: offsetOf(next), animated: true });
        // No state update here: `onMomentumScrollEnd` owns that, so an
        // automatic advance and a manual swipe settle through the same path
        // and cannot disagree about where the carousel is.
      }, delay);
    },
    [clearTimer, looping, offsetOf, width],
  );

  // Park on the first real slide once the width is known. Without animation:
  // this is the initial position, not a movement.
  useEffect(() => {
    if (width === 0 || !looping) return;
    scrollRef.current?.scrollTo({ x: offsetOf(1), animated: false });
    slidePos.current = 1;
    setIndex(0);
    scheduleNext();
    return clearTimer;
  }, [width, looping, offsetOf, scheduleNext, clearTimer]);

  // A carousel that keeps advancing on a screen nobody is looking at wakes
  // the render loop for nothing, and lands the customer on a different slide
  // than the one they left.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      scheduleNext();
      return () => {
        focused.current = false;
        clearTimer();
      };
    }, [scheduleNext, clearTimer]),
  );

  /**
   * The carousel scrolls away with the page; the wordmark and delivery badge
   * above it do not.
   *
   * Driven straight off the list's scroll offset on the UI thread, so it
   * tracks the finger exactly rather than chasing it a frame later. Three
   * things move at once, which is what stops it reading as a box being
   * clipped:
   *
   *   - height shrinks 1:1 with the scroll, so the yellow band closes up
   *     behind it and the list never floats over a gap;
   *   - the artwork drifts up faster than the band closes (the 0.3 factor),
   *     the usual parallax that makes a collapse feel like depth rather than
   *     a crop;
   *   - it fades and eases down to 96% well before the height reaches zero,
   *     so the last thing to happen is empty space closing, not content
   *     disappearing at full opacity.
   *
   * Reversed exactly on the way back up — every interpolation is clamped and
   * stateless, so there is no "expanded/collapsed" flag to get stuck.
   */
  const collapse = useAnimatedStyle(() => {
    if (!scrollY || blockHeight === 0) return {};
    const t = interpolate(
      scrollY.value,
      [0, blockHeight],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      height: blockHeight * (1 - t),
      opacity: interpolate(t, [0, 0.7], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: -t * blockHeight * 0.3 },
        { scale: 1 - t * 0.04 },
      ],
    };
  }, [blockHeight]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const handleTouchStart = () => {
    interacting.current = true;
    clearTimer();
  };

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    const position = Math.round(event.nativeEvent.contentOffset.x / width);
    slidePos.current = position;
    setIndex(realIndexOf(position));

    // The silent correction: having come to rest on a clone, jump to the real
    // slide it is a copy of. Same pixels on screen, so there is nothing to
    // see; the only difference is that there is now room to keep going.
    if (looping && (position === 0 || position === count + 1)) {
      const corrected = position === 0 ? count : 1;
      scrollRef.current?.scrollTo({ x: offsetOf(corrected), animated: false });
      slidePos.current = corrected;
    }

    interacting.current = false;
    scheduleNext(RESUME_AFTER_TOUCH_MS);
  };

  if (!banners || banners.length === 0) return null;

  return (
    <Animated.View style={[{ overflow: "hidden" }, collapse]}>
      <View
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.height);
          if (next > 0 && next !== blockHeight) setBlockHeight(next);
        }}
        className="pt-space-5 gap-space-3"
      >
        <View onLayout={handleLayout} className="overflow-hidden rounded-lg">
          {width > 0 ? (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onTouchStart={handleTouchStart}
              onMomentumScrollEnd={settle}
              // A slow drag that never gains momentum ends here instead, and
              // would otherwise leave the timer parked forever.
              onScrollEndDrag={settle}
              scrollEventThrottle={16}
              style={{ width, height: width / ASPECT }}
            >
              {slides.map((banner, position) => (
                <BannerSlide
                  key={`${banner._id}-${position}`}
                  banner={banner}
                  width={width}
                  height={width / ASPECT}
                />
              ))}
            </ScrollView>
          ) : (
            // Reserves the height on the first frame, so the header does not
            // visibly grow once the width is measured.
            <View style={{ width: "100%", aspectRatio: ASPECT }} />
          )}
        </View>

        {looping ? (
          <View className="gap-space-1 flex-row items-center justify-center">
            {banners.map((banner, i) => (
              <View
                key={banner._id}
                className={
                  i === index
                    ? "bg-on-brand-pill h-[6px] w-[16px] rounded-pill"
                    : "bg-on-brand-pill h-[6px] w-[6px] rounded-pill opacity-30"
                }
              />
            ))}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function BannerSlide({
  banner,
  width,
  height,
}: {
  banner: Banner;
  width: number;
  height: number;
}) {
  // A banner with nowhere to go is rendered as artwork rather than as a
  // control that does nothing when tapped.
  //
  // The object form rather than a template string: `/brand/[slug]` is a
  // dynamic route, and this is the form Expo Router types independently of
  // whether its generated route union has been rebuilt yet.
  const target =
    banner.promo_type === "product" && banner.product
      ? ({
          pathname: "/product/[productId]" as const,
          params: { productId: banner.product._id },
        })
      : banner.promo_type === "brand" && banner.brand
        ? ({
            pathname: "/brand/[slug]" as const,
            params: { slug: banner.brand.slug },
          })
        : null;

  const overlay = banner.header || banner.sub_header || banner.cta_text;

  const body = (
    <View style={{ width, height }}>
      <OptimizedImage
        source={{ uri: banner.imageUrl }}
        contentFit="cover"
        className="h-full w-full rounded-lg"
        accessibilityLabel={banner.header ?? "Promotion"}
      />

      {overlay ? (
        <View
          pointerEvents="none"
          className={`absolute inset-x-0 p-space-4 gap-space-1 ${
            banner.textOverlayPos?.startsWith("top")
              ? "top-0 rounded-t-lg"
              : "bottom-0 rounded-b-lg"
          } ${
            banner.textOverlayPos?.endsWith("right") ? "items-end" : "items-start"
          }`}
          style={{ backgroundColor: "rgba(10, 14, 22, 0.42)" }}
        >
          {banner.header ? (
            <Text variant="onInverse" size="base" weight="bold" numberOfLines={1}>
              {banner.header}
            </Text>
          ) : null}
          {banner.sub_header ? (
            <Text variant="onInverse" size="caption" numberOfLines={1}>
              {banner.sub_header}
            </Text>
          ) : null}
          {banner.cta_text ? (
            <View className="bg-primary px-space-3 py-[3px] mt-[2px] rounded-pill">
              <Text size="caption" weight="bold" variant="onBrand">
                {banner.cta_text}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (!target) return body;

  return (
    <Pressable
      onPress={() => router.push(target)}
      accessibilityRole="button"
      accessibilityLabel={
        banner.promo_type === "brand"
          ? `${banner.brand?.name ?? "Brand"} promotion`
          : `${banner.product?.name ?? "Product"} promotion`
      }
      className="active:opacity-90"
    >
      {body}
    </Pressable>
  );
}
