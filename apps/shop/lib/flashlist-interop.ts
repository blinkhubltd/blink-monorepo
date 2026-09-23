import { FlashList } from "@shopify/flash-list";
import { remapProps } from "nativewind";

/**
 * Teach NativeWind about FlashList.
 *
 * NativeWind only knows the components it registers itself:
 * `react-native-css-interop/dist/runtime/components.js` covers `ScrollView`,
 * `FlatList`, `VirtualizedList` and `KeyboardAvoidingView`, and its JSX wrapper
 * does `type = interopComponents.get(type) ?? type` — an unregistered component
 * gets its `className`-family props forwarded as raw STRINGS. FlashList
 * contains no reference to `className` at all, so every
 *
 *     contentContainerClassName="px-screen pb-space-10"
 *
 * in this app was silently doing nothing: ten list screens were rendering
 * edge-to-edge with no bottom padding, and nothing warned about it because a
 * dropped string is not an error anywhere in that chain.
 *
 * `remapProps` rather than `cssInterop`: the class string is compiled to a
 * style object and handed to the prop FlashList already understands, with no
 * per-element interop wrapper. FlashList does not read `contentContainerStyle`
 * itself — it falls through `...rest` to the underlying ScrollView — and its
 * width comes from measuring a child INSIDE that content container, so items
 * lay out at the padded width rather than overflowing it.
 *
 * One caveat that is worth knowing before adding classes here: `gap` does not
 * work in this content container. FlashList positions every item absolutely
 * inside its own `ViewHolderCollection` (`recyclerview/ViewHolder.tsx`), and
 * gap has no effect on absolutely positioned children. Use
 * `ItemSeparatorComponent`, which is what these screens already do.
 *
 * Imported for its side effect from `app/_layout.tsx`, so it runs before any
 * screen renders. Registration is keyed by component IDENTITY, so a wrapper —
 * `Animated.createAnimatedComponent(FlashList)`, for instance — is a different
 * component and needs its own call. See `app/(tabs)/(home)/index.tsx`.
 */
remapProps(FlashList, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});
