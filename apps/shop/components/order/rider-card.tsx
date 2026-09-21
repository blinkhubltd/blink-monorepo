import { Linking, Text as RNText, View } from "react-native";
import type { useQuery } from "convex/react";
import type { api } from "@repo/backend";

import { Button } from "@repo/mobile-ui/components/ui/button";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { Icon } from "../icon";
import { SectionCard } from "../checkout/sections";

/**
 * Shared by the order screen and the tracking screen, so a customer sees the
 * same rider, the same way, wherever they look.
 */

export type Tracking = NonNullable<
  ReturnType<typeof useQuery<typeof api.data.tracking.getMyOrderTracking>>
>;

/**
 * Who is bringing it.
 *
 * Shown once a rider is assigned, and as a plain note before that while the
 * order is still live. The phone and plate appear only while the parcel is on
 * its way — the query decides that, not this component.
 */
export function RiderCard({
  tracking,
  live,
}: {
  tracking: Tracking | null;
  live: boolean;
}) {
  if (!tracking) return null;

  if (!tracking.riderFirstName) {
    if (!live) return null;
    return (
      <SectionCard title="Your rider">
        <View className="flex-row items-center gap-[12px]">
          <View className="bg-muted size-[48px] items-center justify-center rounded-[999px]">
            <Icon name="bicycle" size={22} tone="body" />
          </View>
          <View className="flex-1">
            <Body muted>
              A rider is assigned once the shop has packed your order. Their
              details will appear here.
            </Body>
          </View>
        </View>
      </SectionCard>
    );
  }

  const vehicle = [tracking.vehicleType, tracking.vehiclePlate]
    .filter(Boolean)
    .join(" · ");

  return (
    <SectionCard title="Your rider">
      <View className="flex-row items-center gap-[12px]">
        {tracking.riderImage ? (
          <OptimizedImage
            source={{ uri: tracking.riderImage }}
            contentFit="cover"
            accessibilityLabel={`Photo of ${tracking.riderFirstName}`}
            className="size-[48px] rounded-[999px]"
          />
        ) : (
          <View className="bg-muted size-[48px] items-center justify-center rounded-[999px]">
            <RNText className="text-foreground text-[18px] leading-[22px] font-semibold">
              {tracking.riderFirstName.charAt(0).toUpperCase()}
            </RNText>
          </View>
        )}

        <View className="min-w-0 flex-1 gap-[2px]">
          <View className="flex-row items-center gap-[8px]">
            <RNText
              numberOfLines={1}
              className="text-foreground shrink text-[15px] leading-[22px] font-semibold"
            >
              {tracking.riderFirstName}
            </RNText>
            {tracking.riderRating ? (
              <View className="flex-row items-center gap-[2px]">
                <Icon name="star" size={12} tone="brand" />
                <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
                  {tracking.riderRating.toFixed(1)}
                </RNText>
              </View>
            ) : null}
          </View>
          {vehicle ? <Body muted>{vehicle}</Body> : null}
        </View>
      </View>

      {tracking.riderPhone ? (
        <Button
          variant="outline"
          size="ctaSm"
          full
          icon={<Icon name="call-outline" size={16} tone="strong" />}
          label={`Call ${tracking.riderFirstName}`}
          onPress={() => void Linking.openURL(`tel:${tracking.riderPhone}`)}
        />
      ) : live ? (
        <Body muted>
          You can call your rider once they have collected your order.
        </Body>
      ) : null}
    </SectionCard>
  );
}

function Body({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <RNText
      className={`font-sans text-[13px] leading-[19px] ${
        muted ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {children}
    </RNText>
  );
}
