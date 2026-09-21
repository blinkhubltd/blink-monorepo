import { Pressable, View } from "react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon, type IconName } from "./icon";

/**
 * The grouped settings list: an uppercase section label, then a card of rows
 * separated by hairlines.
 *
 * Shared by Profile and Settings so the two cannot drift — they are the same
 * list, and the app this replaces had three near-identical hand-rolled
 * versions of it that had already diverged on row height and icon size.
 *
 * ── The divider is drawn by the row, not by a separator element ──────────
 *
 * A `<Separator />` between rows is a sibling of the pressables, so a press
 * highlight stops short of it and leaves a pale stripe across a row being
 * held. Each row after the first draws its own top border instead, inside
 * the pressable, so the highlight covers the full row.
 */
export function MenuSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-space-2">
      {title ? (
        <Text
          size="label"
          weight="semibold"
          variant="subtle"
          className="uppercase tracking-label pl-[2px]"
        >
          {title}
        </Text>
      ) : null}
      <View className="border-hairline border-border bg-card overflow-hidden rounded-lg">
        {children}
      </View>
    </View>
  );
}

export function MenuRow({
  icon,
  label,
  meta,
  badge,
  onPress,
  external = false,
  first = false,
  destructive = false,
  right,
}: {
  icon: IconName;
  label: string;
  /** The second line. Omit when there is nothing true to say — never filler. */
  meta?: string;
  /** A count. Rendered only above zero; a badge reading "0" is not news. */
  badge?: number | null;
  onPress?: () => void;
  /** Leaves the app: announced as a link, and marked with a different glyph. */
  external?: boolean;
  /** Suppresses the top divider. The first row in a card sets this. */
  first?: boolean;
  destructive?: boolean;
  /** Replaces the trailing chevron — a Switch, for instance. */
  right?: React.ReactNode;
}) {
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={external ? "link" : onPress ? "button" : undefined}
      accessibilityLabel={meta ? `${label}. ${meta}` : label}
      accessibilityHint={external ? "Opens in your browser" : undefined}
      className={`min-h-[56px] gap-space-3 px-space-4 py-space-3 flex-row items-center active:bg-muted ${
        first ? "" : "border-t-hairline border-border"
      }`}
    >
      <View className="bg-secondary size-[36px] rounded-pill items-center justify-center">
        <Icon name={icon} size={17} tone={destructive ? "destructive" : "strong"} />
      </View>

      {/*
        Title and helper are pulled apart by darkening the TITLE, not by
        lightening the helper.

        They were ink-800 over ink-600 — two greys one step apart, which read
        as one block rather than a title with a note under it. The obvious
        fix is to drop the helper to `subtle` (ink-500), and that is the one
        thing not done here: #818A99 on the card white is 3.48:1, which fails
        AA for 13px text. ink-600 is 6.07:1 and stays. Taking the title to
        ink-950 instead widens the same gap from the readable end.
      */}
      <View className="flex-1">
        <Text
          size="base"
          weight="medium"
          variant={destructive ? "destructive" : "default"}
          className={destructive ? undefined : "text-strong"}
        >
          {label}
        </Text>
        {meta ? (
          <Text size="sm" variant="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>

      {showBadge ? (
        <View className="bg-destructive rounded-pill px-space-2 h-[22px] min-w-[22px] items-center justify-center">
          <Text
            size="caption"
            weight="bold"
            className="text-destructive-foreground"
          >
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}

      {right ??
        (onPress ? (
          <Icon
            name={external ? "open-outline" : "chevron-forward"}
            size={17}
            tone="subtle"
          />
        ) : null)}
    </Pressable>
  );
}
