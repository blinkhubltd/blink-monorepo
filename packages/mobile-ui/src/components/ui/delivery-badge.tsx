import { View } from "react-native";
import { Text } from "./text";
import { BlinkRiderMark } from "./blink-rider-mark";

/**
 * The "10 minutes delivery" pill — Blink's core promise, in both apps.
 *
 * Two sizes. `xs` is the shop header's compact badge and the default, so the
 * shop's call sites render exactly as they did before this was shared. `md` is
 * the design system's standard badge (38px, 13px type, 21px mark), which the
 * rider app's home screen uses under its duty card.
 *
 * Ink pill, gold mark, white bold text — and none of those three colours vary
 * with the scheme. `bg-on-brand-pill` is reused rather than `bg-inverse`
 * deliberately: `inverse` flips to white in dark mode, which would turn an
 * ink pill into a white one — the same trap the yellow header's own icon
 * buttons were built to avoid. The text is a literal `#FFFFFF`, not a
 * semantic class, because nothing in the token set names "always white
 * regardless of scheme" and this is the one place that specific fixed colour
 * is wanted.
 *
 * ── Why the type is set in a style prop, not by className ────────────────
 *
 * The lean is a real face — Inter Bold Italic, loaded in app/_layout.tsx —
 * rather than the `skewX` transform this badge first used or NativeWind's
 * `italic` utility. A synthesised slant shears the upright glyphs; the true
 * italic redraws them, and at this size that is the difference between a
 * typeface and a squashed one.
 *
 * It is named here instead of through a `font-*` class because every font
 * slot in tailwind.config.js compiles to a `fontFamily`, `bold` included —
 * so a class would put two competing family declarations on one element and
 * let stylesheet order pick the winner. A style prop simply wins. The size
 * is set alongside it for the same reason the cart badge does: the type
 * scale stops at 11px (`caption`) and this label wants 10.
 *
 * No explicit font family: blink-ecommerce never actually applies its
 * configured fonts to any text (`font-body` resolves to `fontFamily.body:
 * undefined` there, including on this badge's nearest analogue,
 * `AddToCartBadge`) — the whole app renders in the platform system font. Our
 * own `font-sans` (Inter) is this app's equivalent stand-in for that same
 * system-font intent, so this badge just inherits it like everything else.
 * Uppercase is a deliberate departure from the old app (which has no
 * uppercase/tracked-letter-spacing precedent for this copy) — requested to
 * read more like a badge/label than a sentence.
 */
const SIZES = {
  xs: { height: 18, padX: 6, gap: 3, mark: 13, fontSize: 10, lineHeight: 12 },
  md: { height: 38, padX: 15, gap: 7, mark: 21, fontSize: 13, lineHeight: 16 },
} as const;

export function DeliveryBadge({
  minutes = 10,
  size = "xs",
}: {
  minutes?: number;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <View
      className="bg-on-brand-pill rounded-pill flex-row items-center"
      style={{ height: s.height, paddingHorizontal: s.padX, gap: s.gap }}
    >
      <BlinkRiderMark height={s.mark} />
      {/*
        Uppercased in JS, not through the `uppercase` class. `textTransform`
        is a paint-time style on native: Yoga measures the RAW string, and
        with `numberOfLines={1}` that measurement is also the clip box. Real
        uppercase glyphs run wider than the lowercase string that was
        measured — this italic face more so, since the slant pushes the last
        glyph's ink further right again — so the trailing letter (the "Y")
        was being clipped by a box sized for text that was never actually
        drawn. Uppercasing the string itself makes the measured and painted
        text identical, which is the only way for `numberOfLines` to size a
        box the rendered glyphs actually fit in.
      */}
      <Text
        numberOfLines={1}
        className="tracking-label text-[#FFFFFF]"
        style={{
          fontFamily: "Inter_700Bold_Italic",
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
        }}
      >
        {`${minutes} minutes delivery`.toUpperCase()}
      </Text>
    </View>
  );
}
