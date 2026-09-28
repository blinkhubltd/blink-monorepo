import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { ProgressBar } from "../ProgressBar";
import { Stat } from "../Stat";
import { useHome } from "../../lib/data";
import { progressPct } from "../../lib/incentives";

/**
 * A picker's home, below the shared header.
 *
 * The rider design has no picker screens, so this keeps what pickers had —
 * items picked today, the order in hand with its progress, and what comes
 * next — on the same cards and type the rider home now uses. It lives here
 * rather than in the route so that route reads as one fork on the role.
 */
export function PickerHome() {
  const router = useRouter();
  const home = useHome();

  if (home === undefined) {
    return (
      <View className="gap-space-5">
        <View className="flex-row gap-space-4">
          <Card className="h-[90px] flex-1" />
          <Card className="h-[90px] flex-1" />
        </View>
        <Skeleton className="h-space-6 w-[140px]" />
        <Card className="h-[150px]" />
      </View>
    );
  }

  return (
    <View className="gap-space-5">
      <View className="flex-row gap-space-4">
        <Card className="flex-1">
          <Stat {...home.summary.primary} />
        </Card>
        <Card className="flex-1">
          <Stat {...home.summary.secondary} />
        </Card>
      </View>

      <Text size="h3" weight="bold" className="text-strong">
        Active order
      </Text>
      {home.active ? (
        <Card className="gap-space-4">
          <View className="flex-row items-center justify-between">
            <Text weight="bold" className="text-strong">
              Order #{home.active.reference}
            </Text>
            <Badge variant="secondary" label={home.active.badgeLabel} />
          </View>
          {home.active.progress ? (
            <View className="gap-space-2">
              <ProgressBar
                pct={progressPct(
                  home.active.progress.done,
                  home.active.progress.total,
                )}
              />
              <Text variant="muted" size="label" weight="medium">
                {home.active.progress.done} of {home.active.progress.total}{" "}
                items picked
              </Text>
            </View>
          ) : null}
          <Button
            full
            size="cta"
            label="Continue picking"
            onPress={() => router.push(`/picklist/${home.active!.targetId}`)}
          />
        </Card>
      ) : (
        <Card className="items-center gap-space-2 py-space-8">
          <Text weight="semibold" className="text-strong">
            Nothing to pick
          </Text>
          <Text variant="muted" size="sm" className="text-center">
            Orders queued for picking will appear here.
          </Text>
        </Card>
      )}

      {home.upNext ? (
        <>
          <Text size="h3" weight="bold" className="text-strong">
            Next in your queue
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/picklist/${home.upNext!.id}`)}
            className="active:opacity-70"
          >
            <Card className="flex-row items-center justify-between">
              <View className="flex-1 pr-space-4">
                <Text weight="bold" size="sm" className="text-strong">
                  Order #{home.upNext.reference}
                </Text>
                <Text variant="subtle" size="sm">
                  {home.upNext.subtitle} · {home.upNext.status}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} tone="subtle" />
            </Card>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
