import { useState } from "react";
import { Pressable, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import {
  Bell,
  Bike,
  ChevronRight,
  Info,
  Package,
  Tag,
  Trash2,
} from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../components/screen-header";
import {
  presentNotification,
  routeForNotification,
  type NotificationIcon,
} from "../lib/notification-kind";

/**
 * Notifications.
 *
 * ── The feed used to hand out delivery codes ─────────────────────────────
 *
 * `getUserNotifications` took `userId` as an argument and was public, and
 * delivery-code notifications carry the six-digit handover code in their message
 * and in `data.deliveryCode`. So the feed was a second route to the secret that
 * had already been closed on `orders.generateDeliveryCode`. This screen reads
 * `getMyNotifications`, which derives the caller from the token and returns a
 * projection rather than whole rows.
 *
 * ── Stored routes are translated, not followed ───────────────────────────
 *
 * The backend writes `route: "/order-details/<id>"` — a path from the old app
 * that does not exist here. Following it verbatim would land every order
 * notification on the not-found screen, so `routeForNotification` maps the known
 * shapes and refuses anything else. A stored route is data, not a command:
 * honouring an arbitrary string lets whatever wrote it choose where the app goes.
 */
export default function NotificationsScreen() {
  const { isLoaded, isSignedIn } = useAuth();

  const notifications = useQuery(
    api.data.user_notifications.getMyNotifications,
    isSignedIn ? {} : "skip",
  );
  const markRead = useMutation(
    api.data.user_notifications.markMyNotificationRead,
  );
  const markAllRead = useMutation(
    api.data.user_notifications.markAllMyNotificationsRead,
  );
  const remove = useMutation(api.data.user_notifications.deleteMyNotification);

  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Notifications" showCart={false} />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Bell size={36} color="#818A99" />
          <Text size="lg" weight="semibold">
            Sign in to see updates
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            Order updates, delivery codes and offers arrive here.
          </Text>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const unread = (notifications ?? []).filter((n) => n.status === "unread");

  async function open(notification: {
    _id: Id<"notifications">;
    status: string;
    orderId: string | null;
    route: string | null;
  }) {
    const destination = routeForNotification(notification);
    // Marked read on open, and the failure is not allowed to block the
    // navigation: an unread badge that lingers is a smaller problem than a tap
    // that appears to do nothing.
    if (notification.status === "unread") {
      void markRead({ notificationId: notification._id }).catch(() => {});
    }
    if (destination) router.push(destination as never);
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        title="Notifications"
        subtitle={
          notifications === undefined
            ? undefined
            : unread.length > 0
              ? `${unread.length} unread`
              : "All caught up"
        }
        showCart={false}
      />

      {error ? (
        <View className="px-screen pb-space-3">
          <Pressable
            onPress={() => setError(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            className="bg-destructive-soft p-space-3 rounded-md"
          >
            <Text size="sm" variant="destructive">
              {error}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {unread.length > 0 ? (
        <View className="px-screen pb-space-3">
          <Button
            size="sm"
            variant="outline"
            label="Mark all as read"
            loading={marking}
            onPress={() => {
              setMarking(true);
              setError(null);
              void markAllRead({})
                .then((result) => {
                  // Said rather than silently partial: the mutation is capped,
                  // so a very old feed needs another pass.
                  if (result.more) {
                    setError(
                      "Marked the most recent ones. Tap again to clear the rest.",
                    );
                  }
                })
                .catch(() =>
                  setError("Could not mark those as read. Try again."),
                )
                .finally(() => setMarking(false));
            }}
          />
        </View>
      ) : null}

      {notifications === undefined ? (
        <View className="px-screen gap-space-3">
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} className="gap-space-2 flex-row items-center">
              <Skeleton className="rounded-pill size-control" />
              <View className="gap-space-1 flex-1">
                <Skeleton className="h-[14px] w-2/3 rounded-sm" />
                <Skeleton className="h-[12px] w-1/2 rounded-sm" />
              </View>
            </View>
          ))}
        </View>
      ) : notifications.length === 0 ? (
        <View className="gap-space-3 px-screen py-space-10 items-center">
          <Bell size={36} color="#818A99" />
          <Text size="lg" weight="semibold">
            Nothing here yet
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            Order updates and delivery codes will appear here. Notifications
            older than 90 days are removed automatically.
          </Text>
        </View>
      ) : (
        <FlashList
          data={notifications}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-10"
          ItemSeparatorComponent={() => <View className="h-space-3" />}
          renderItem={({ item }) => {
            const presentation = presentNotification(item.type);
            const destination = routeForNotification(item);
            const isUnread = item.status === "unread";

            return (
              <Pressable
                onPress={() => void open(item)}
                // Not pressable when there is nowhere to go, rather than
                // pressable and inert.
                disabled={!destination && !isUnread}
                accessibilityRole="button"
                accessibilityLabel={`${presentation.label}. ${item.title}${
                  isUnread ? ". Unread" : ""
                }`}
                className={`border-hairline gap-space-3 p-space-3 flex-row items-start rounded-lg active:opacity-70 ${
                  isUnread ? "border-border bg-card" : "border-transparent"
                }`}
              >
                <View className="bg-muted size-control rounded-pill items-center justify-center">
                  <NotificationGlyph icon={presentation.icon} />
                </View>

                <View className="gap-space-1 flex-1">
                  <View className="gap-space-2 flex-row items-center">
                    <Badge
                      variant={presentation.tone}
                      label={presentation.label}
                    />
                    {isUnread ? (
                      <View className="bg-primary size-[8px] rounded-pill" />
                    ) : null}
                  </View>
                  <Text
                    size="sm"
                    weight={isUnread ? "semibold" : "regular"}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  <Text size="caption" variant="muted" numberOfLines={3}>
                    {item.message}
                  </Text>
                  <Text size="caption" variant="subtle">
                    {formatWhen(item.created_at)}
                  </Text>
                </View>

                {destination ? (
                  <ChevronRight size={18} color="#818A99" />
                ) : (
                  <Pressable
                    onPress={() =>
                      void remove({ notificationId: item._id }).catch(() =>
                        setError("Could not remove that one."),
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.title}`}
                    hitSlop={8}
                  >
                    <Trash2 size={16} color="#818A99" />
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function NotificationGlyph({ icon }: { icon: NotificationIcon }) {
  const colour = "#5A6372";
  if (icon === "package") return <Package size={18} color={colour} />;
  if (icon === "bike") return <Bike size={18} color={colour} />;
  if (icon === "tag") return <Tag size={18} color={colour} />;
  return <Info size={18} color={colour} />;
}

/**
 * Relative for the first day, then a date.
 *
 * "3 days ago" stops being useful quickly and "2 Aug" is what someone looking
 * for a specific order actually needs.
 */
function formatWhen(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
