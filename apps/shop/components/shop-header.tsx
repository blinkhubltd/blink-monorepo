import { Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  Bell,
  ChevronDown,
  MapPin,
  Search,
  ShoppingBag,
} from "lucide-react-native";

import { useQuery } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { useLocation } from "../providers/LocationProvider";
import { useCart } from "../providers/CartProvider";

/**
 * The catalogue header: where you are, what you're looking at, and the cart.
 *
 * Row 1 (`h-nav-h`, 72px) holds the location pill and the cart — both persistent,
 * because "which shops can reach me" is the single most consequential piece of
 * state in the app and the customer should never have to hunt for it.
 *
 * Row 2 is the screen title and scrolls away. Row 3 is the search entry point.
 *
 * The location pill is a real control, not a label. blink-ecommerce buried
 * location changes behind a drawer item and a "Change Categories" flow, which
 * is why a customer in the wrong area had no obvious way out of an empty grid.
 */
export function ShopHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { point, denied, requesting, request } = useLocation();
  const { count } = useCart();
  // Args-free and unconditional: it returns 0 when signed out rather than
  // needing an isSignedIn gate, which is how guest browsing gets broken.
  const unread = useQuery(api.data.user_notifications.getMyUnreadCount, {}) ?? 0;

  const locationLabel = point
    ? // Coordinates until reverse geocoding lands. Deliberately not faked as a
      // street name: showing a plausible wrong address is worse than showing a
      // precise unfriendly one.
      `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`
    : denied
      ? "Set your location"
      : requesting
        ? "Finding you…"
        : "Set your location";

  return (
    <View className="gap-space-3 px-screen pb-space-3">
      <View className="h-nav-h gap-space-3 flex-row items-center justify-between">
        <Pressable
          onPress={() => void request()}
          accessibilityRole="button"
          accessibilityLabel={`Delivery location: ${locationLabel}. Tap to change.`}
          className="min-h-control gap-space-2 rounded-pill bg-muted px-space-4 shrink flex-row items-center active:opacity-80"
        >
          <MapPin size={16} color="#5A6372" />
          <Text size="sm" weight="medium" numberOfLines={1} className="shrink">
            {locationLabel}
          </Text>
          <ChevronDown size={16} color="#5A6372" />
        </Pressable>

        <View className="flex-row items-center">
          {/*
            The bell, with a dot rather than a number: the exact count of unread
            notifications is not a decision anyone makes, and the query behind it
            is capped for the same reason.
          */}
          <Pressable
            onPress={() => router.push("/notifications")}
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
            className="size-control rounded-pill items-center justify-center active:opacity-70"
          >
            <Bell size={22} color="#0A0E16" />
            {unread > 0 ? (
              <View className="bg-primary right-space-2 top-space-2 size-[9px] rounded-pill absolute" />
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => router.push("/cart")}
            accessibilityRole="button"
            accessibilityLabel={
              count > 0 ? `Basket, ${count} items` : "Basket, empty"
            }
            className="size-control rounded-pill items-center justify-center active:opacity-70"
          >
            <ShoppingBag size={24} color="#0A0E16" />
            {/*
              The count, which neither header showed before — a customer could
              not tell from any screen whether they had a basket at all.
            */}
            {count > 0 ? (
              <View className="bg-primary right-space-1 top-space-1 min-w-[18px] rounded-pill absolute items-center justify-center px-[4px]">
                <Text size="caption" weight="bold" variant="onBrand">
                  {count > 99 ? "99+" : count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <View className="gap-space-1">
        <Text variant="heading" size="h1">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="muted" size="sm">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/*
        A readonly entry point, not a live input. Typing happens on /search,
        which owns the debounce and the results. The screen this replaces had
        three overlapping search components (SearchHeader, SimplifiedSearchHeader,
        SearchInput) with the query living in the home screen's state.
      */}
      <Pressable
        onPress={() => router.push("/search")}
        accessibilityRole="search"
        accessibilityLabel="Search products"
        className="min-h-control gap-space-3 border-hairline border-border bg-card px-space-4 flex-row items-center rounded-lg active:opacity-80"
      >
        <Search size={18} color="#818A99" />
        <Text variant="subtle" size="sm">
          Search for products
        </Text>
      </Pressable>
    </View>
  );
}
