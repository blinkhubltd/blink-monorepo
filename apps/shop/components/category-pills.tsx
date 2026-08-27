import { useEffect, useRef } from "react";
import { FlatList, Pressable, View } from "react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import type { CategoryNodeForShop } from "../lib/catalogue";

/**
 * The two pill rows on the products screen.
 *
 * ── Why two rows, and why they look different ─────────────────────────────
 *
 * Row 1 switches the level-2 category — it changes the product set *and* the
 * contents of row 2, so it is a navigation. Row 2 filters level 3 within the
 * current set.
 *
 * They are shaped differently on purpose. Row 1 is a filled pill
 * (`rounded-pill`, solid brand when active); row 2 is a squarer outlined chip
 * (`rounded-md`, underlined when active). Two rows of identical chips would make
 * the customer guess which one navigates and which one filters. The subordinate
 * styling also reads as "inside" row 1, matching the hierarchy.
 *
 * ── The viewport budget ───────────────────────────────────────────────────
 *
 * Both rows are `control-sm` (34px). With the 6px gaps that is 80px, and with
 * the title bar above, 124px sticky after collapse — about 15% of an 812pt
 * screen, which still leaves two full product rows plus a peek.
 *
 * Two further reductions, both free from the tree already in cache:
 * row 2 is hidden when the active level-2 has one or fewer level-3 children,
 * and row 1 is hidden when the level-1 has only one child. A pill row offering
 * a single choice is pure overhead.
 */

export function Level2PillRow({
  categories,
  activeId,
  onSelect,
}: {
  categories: CategoryNodeForShop[];
  activeId: string;
  onSelect: (category: CategoryNodeForShop) => void;
}) {
  const listRef = useRef<FlatList<CategoryNodeForShop>>(null);
  const activeIndex = categories.findIndex((c) => c._id === activeId);

  useEffect(() => {
    // Scroll the active pill into view on mount. Essential rather than polish:
    // arriving here from a deep link or a reload, the customer must see WHERE
    // they are. Showing the first pill while the grid shows the eighth
    // category's products is actively misleading.
    if (activeIndex > 0) {
      listRef.current?.scrollToIndex({
        index: activeIndex,
        viewPosition: 0.5,
        animated: false,
      });
    }
  }, [activeIndex]);

  if (categories.length <= 1) return null;

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={categories}
      keyExtractor={(item) => item._id}
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-space-2 px-screen"
      className="h-control-sm grow-0"
      // scrollToIndex throws on an unmeasured index; this is the documented
      // recovery, and without it a deep link to a far-right pill crashes.
      onScrollToIndexFailed={() => {}}
      renderItem={({ item }) => {
        const active = item._id === activeId;
        return (
          <Pressable
            onPress={() => onSelect(item)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.name}
            className={`h-control-sm rounded-pill px-space-4 justify-center active:opacity-80 ${
              active ? "bg-primary" : "bg-muted"
            }`}
          >
            <Text
              size="label"
              weight={active ? "semibold" : "medium"}
              variant={active ? "onBrand" : "muted"}
            >
              {item.name}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

export function Level3PillRow({
  categories,
  activeSlug,
  onSelect,
}: {
  categories: CategoryNodeForShop[];
  /** Undefined means the "All" chip. */
  activeSlug?: string;
  onSelect: (slug: string | undefined) => void;
}) {
  // One choice is not a choice. Hiding the row reclaims 40px of a phone screen.
  if (categories.length <= 1) return null;

  const chips: Array<{ key: string; label: string; slug?: string }> = [
    { key: "__all", label: "All" },
    ...categories.map((c) => ({ key: c._id, label: c.name, slug: c.slug })),
  ];

  return (
    <FlatList
      horizontal
      data={chips}
      keyExtractor={(item) => item.key}
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-space-2 px-screen"
      className="h-control-sm grow-0"
      renderItem={({ item }) => {
        const active = item.slug === activeSlug;
        return (
          <Pressable
            onPress={() => onSelect(item.slug)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            className="h-control-sm justify-center active:opacity-80"
          >
            <View
              className={`border-hairline px-space-3 h-[28px] justify-center rounded-md ${
                active
                  ? "border-strong bg-background"
                  : "border-border bg-transparent"
              }`}
            >
              <Text
                size="label"
                weight={active ? "semibold" : "regular"}
                variant={active ? "default" : "muted"}
              >
                {item.label}
              </Text>
            </View>
            {/* The 2px brand underline is what marks the active filter. */}
            <View
              className={`rounded-pill mt-[4px] h-[2px] ${
                active ? "bg-primary" : "bg-transparent"
              }`}
            />
          </Pressable>
        );
      }}
    />
  );
}
