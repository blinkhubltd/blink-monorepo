import { FlatList, Pressable } from "react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon, type IconName } from "./icon";
import type { ProductTag, TagFacet } from "../lib/use-paged-products";
import type { TokenColor } from "../lib/token-colors";

/**
 * The merchandising filter row on the products screen.
 *
 * ── Why this is not a third `category-pills` row ──────────────────────────
 *
 * The two rows above it are the category tree — level 2 in the path, level 3
 * in `?t=`. Those are places in the catalogue. These are not: "Offer" and
 * "Hot" are things an admin has said ABOUT a product, and they cut across
 * every category. Rendering them in the same neutral grey pill as a
 * subcategory would say they are the same kind of choice, and the first
 * question a customer would then ask is which subcategory "Hot" is.
 *
 * So each one carries its own icon and colour. That is the whole point of the
 * row: a customer should be able to find the deals without reading the words,
 * which is also what makes it work for anyone skimming rather than reading.
 *
 * ── The row only shows tags that exist here ───────────────────────────────
 *
 * The facets come from the listing query, counted over the products it
 * actually scanned for this category. A pill that leads to an empty grid is
 * worse than no pill: it reads as a broken filter rather than as an empty
 * category. With nothing tagged and no clearance, the row renders nothing at
 * all and costs no vertical space.
 *
 * ── Clearance is a link, not a filter ─────────────────────────────────────
 *
 * It sits in this row because that is where a customer looks for deals, but
 * it does not filter the grid and cannot: clearance stock is a separate
 * catalogue (`clearance_products`) with its own basket, its own checkout and
 * its own delivery radius. Mixing those rows into this grid would put items
 * in a basket that cannot check them out. So the pill navigates to the
 * clearance screen, and it is drawn with a chevron to say so before it is
 * tapped rather than after.
 */

type TagStyle = {
  icon: IconName;
  tone: TokenColor;
  /** The soft surface behind the pill, and the border when it is selected. */
  surface: string;
  border: string;
  text: string;
};

/**
 * One look per tag, fixed here rather than derived.
 *
 * The pairings are meant to be read, not to be pretty: red is the colour this
 * app already uses for a price reduction, amber is heat, and blue is the
 * neutral "we picked this" that is deliberately NOT a discount claim —
 * "Featured" is an editorial choice and must not look like money off.
 */
const TAG_STYLES: Record<ProductTag, TagStyle> = {
  Offer: {
    icon: "pricetag",
    tone: "destructive",
    surface: "bg-destructive-soft",
    border: "border-destructive",
    text: "text-destructive",
  },
  Hot: {
    icon: "flame",
    tone: "warning",
    surface: "bg-warning-soft",
    border: "border-warning",
    text: "text-warning-foreground",
  },
  Featured: {
    icon: "star",
    tone: "info",
    surface: "bg-info-soft",
    border: "border-info",
    text: "text-info",
  },
};

const CLEARANCE_STYLE: TagStyle = {
  icon: "pricetags",
  tone: "success",
  surface: "bg-success-soft",
  border: "border-success",
  text: "text-success",
};

type Chip =
  | { key: string; kind: "tag"; tag: ProductTag; label: string }
  | { key: string; kind: "clearance"; label: string };

export function TagPillRow({
  facets,
  activeTag,
  onSelectTag,
  showClearance,
  onOpenClearance,
}: {
  facets: TagFacet[];
  /** Undefined means no tag filter is applied. */
  activeTag?: ProductTag;
  /** Called with `undefined` when the active pill is tapped again, to clear it. */
  onSelectTag: (tag: ProductTag | undefined) => void;
  /** True only when this category actually has clearance deals nearby. */
  showClearance: boolean;
  onOpenClearance: () => void;
}) {
  const chips: Chip[] = [
    ...facets.map((f) => ({
      key: f.tag,
      kind: "tag" as const,
      tag: f.tag,
      label: f.tag,
    })),
    ...(showClearance
      ? [{ key: "__clearance", kind: "clearance" as const, label: "Clearance" }]
      : []),
  ];

  if (chips.length === 0) return null;

  return (
    <FlatList
      horizontal
      data={chips}
      keyExtractor={(item) => item.key}
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-space-2 px-screen"
      className="h-control-sm grow-0"
      renderItem={({ item }) => {
        const style =
          item.kind === "tag" ? TAG_STYLES[item.tag] : CLEARANCE_STYLE;
        const active = item.kind === "tag" && item.tag === activeTag;

        return (
          <Pressable
            onPress={() =>
              item.kind === "clearance"
                ? onOpenClearance()
                : // Tapping the selected pill clears it. Without this the only
                  // way out of a filter is to find the one you started from,
                  // and there is no "All" chip in this row — the row is not a
                  // complete partition of the category the way the level-3 row
                  // is, so an "All" here would be claiming otherwise.
                  onSelectTag(active ? undefined : item.tag)
            }
            accessibilityRole={item.kind === "clearance" ? "link" : "tab"}
            accessibilityState={
              item.kind === "clearance" ? undefined : { selected: active }
            }
            accessibilityLabel={
              item.kind === "clearance"
                ? "Clearance deals"
                : active
                  ? `${item.label}, selected. Tap to clear.`
                  : item.label
            }
            className={`h-control-sm gap-space-2 rounded-pill px-space-3 flex-row items-center border active:opacity-80 ${
              style.surface
            } ${active ? style.border : "border-transparent"}`}
          >
            <Icon name={style.icon} size={14} tone={style.tone} />
            <Text
              size="label"
              weight={active ? "bold" : "semibold"}
              className={style.text}
            >
              {item.label}
            </Text>
            {item.kind === "clearance" ? (
              <Icon name="chevron-forward" size={12} tone={style.tone} />
            ) : active ? (
              <Icon name="close" size={12} tone={style.tone} />
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}
