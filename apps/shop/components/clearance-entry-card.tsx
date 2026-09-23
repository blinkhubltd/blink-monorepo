import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import {
  CLEARANCE_CARD_IMAGE_KEY,
  CLEARANCE_CARD_TITLE_KEY,
  CLEARANCE_CARD_DETAIL_KEY,
  clearanceCardTitle,
  clearanceCardDetail,
} from "@repo/lib/utils";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";
import { Icon } from "./icon";

/**
 * The way into clearance, from the Home screen.
 *
 * Title and detail sentence are `platform_settings` rows an admin can set
 * from the Settings page (`CLEARANCE_CARD_TITLE_KEY` /
 * `CLEARANCE_CARD_DETAIL_KEY`, in `@repo/lib`); blank falls back to the
 * built-in defaults, so a tenant that never touches the setting sees the
 * same copy this card always had.
 *
 * The image is optional in the same way, and its absence is the ordinary
 * case, not a broken one: with none set, this renders exactly the bordered
 * icon-and-text card it always has. With one set, the card becomes the
 * image with a bottom scrim and the same text over it — and a small
 * "CLEARANCE" pill stays on regardless, because an arbitrary admin-chosen
 * photo does not read as "clearance" on its own the way the pricetag icon
 * does. Losing that legibility was the one thing worth guarding against in
 * adding the image at all.
 */
export function ClearanceEntryCard() {
  const imageSetting = useQuery(api.data.platform_settings.get, {
    key: CLEARANCE_CARD_IMAGE_KEY,
  });
  const titleSetting = useQuery(api.data.platform_settings.get, {
    key: CLEARANCE_CARD_TITLE_KEY,
  });
  const detailSetting = useQuery(api.data.platform_settings.get, {
    key: CLEARANCE_CARD_DETAIL_KEY,
  });

  const storageId = (imageSetting?.value || undefined) as
    | Id<"_storage">
    | undefined;
  const imageUrl = useQuery(
    api.data.files.getImageUrl,
    storageId ? { storageId } : "skip",
  );

  const title = clearanceCardTitle(titleSetting?.value);
  const detail = clearanceCardDetail(detailSetting?.value);

  if (imageUrl) {
    return (
      <Pressable
        onPress={() => router.push("/clearance")}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${detail}`}
        className="mb-space-4 overflow-hidden rounded-lg active:opacity-90"
      >
        <View className="h-[120px] w-full">
          <OptimizedImage
            source={{ uri: imageUrl }}
            contentFit="cover"
            className="h-full w-full"
            accessibilityLabel={title}
          />
          <View
            pointerEvents="none"
            className="absolute inset-x-0 bottom-0 gap-space-1 p-space-4"
            style={{ backgroundColor: "rgba(10, 14, 22, 0.55)" }}
          >
            <View className="bg-primary self-start rounded-pill px-space-3 py-[3px]">
              <Text
                size="caption"
                weight="bold"
                variant="onBrand"
                className="uppercase tracking-label"
              >
                Clearance
              </Text>
            </View>
            <Text variant="onInverse" size="base" weight="bold">
              {title}
            </Text>
            <Text variant="onInverse" size="caption">
              {detail}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push("/clearance")}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      className="border-hairline border-border bg-card mb-space-4 gap-space-3 p-space-4 flex-row items-center rounded-lg active:opacity-90"
    >
      <View className="bg-primary size-control rounded-pill items-center justify-center">
        <Icon name="pricetag-outline" size={20} tone="onBrand" />
      </View>
      <View className="gap-space-1 flex-1">
        <Text size="base" weight="semibold">
          {title}
        </Text>
        <Text size="caption" variant="subtle">
          {detail}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} tone="subtle" />
    </Pressable>
  );
}
