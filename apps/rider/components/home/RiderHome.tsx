import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import type { Id } from "@repo/backend/dataModel";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { DeliveryBadge } from "@repo/mobile-ui/components/ui/delivery-badge";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { DutyCard } from "./DutyCard";
import { SparkStat } from "./SparkStat";
import { Chip } from "../job/Chip";
import { ClockPill } from "../job/ClockPill";
import { RouteStops } from "../job/RouteStops";
import { StatusPill } from "../job/StatusPill";
import { itemCountLabel } from "../job/ItemList";
import { useCrew } from "../../providers/CrewProvider";
import { useLocationSharing } from "../../providers/LocationProvider";
import {
  useDelivery,
  useRiderJobs,
  useRiderStats,
  useStartRide,
} from "../../lib/data";
import {
  averageDropMs,
  dropBy,
  formatDuration,
  lastDays,
  weekOverWeekPct,
  type RiderJob,
} from "../../lib/earnings";
import { formatClock, formatMoney, formatMoneyCompact } from "../../lib/format";
import { distanceKm, formatDistance } from "../../lib/geo";
import { canStartRide, isOnTheWay } from "../../lib/job-status";
import { useDeviceLocation } from "../../lib/use-device-location";
import { useNow } from "../../lib/use-now";

/**
 * A rider's home, below the shared greeting header.
 *
 * Per the design: the duty card, the delivery promise, two seven-day stat
 * cards, the active delivery with its drop-by clock, and what is next.
 *
 * ── Where the design's sample numbers come from here ─────────────────────
 *
 *   "Ksh 1,840" / "9 today"     getRiderDashboard's own totals for today.
 *   the two sparklines          delivery fees and counts per day, from the
 *                               rider's delivery list (lib/earnings.ts).
 *   "+12% on last week"         the last seven days' fees against the seven
 *                               before; left out when there is no prior week.
 *   "avg 8 min 40 s a drop"     assignment to delivery, last seven days.
 *   the clock, "Drop by 2:58"   the order time plus the 10-minute promise.
 *   "3.4 km"                    straight-line from this phone, labelled "away"
 *                               — there is no route distance to show.
 *
 * The design's "6 min" ride estimate and "2 bags" are not shown: neither has a
 * source, and an invented arrival time is the one number a rider might act on.
 */
export function RiderHome() {
  const { crew, online, setOnline } = useCrew();
  const location = useLocationSharing();
  const jobs = useRiderJobs();
  const stats = useRiderStats();
  const now = useNow();

  return (
    <View className="gap-[14px]">
      <DutyCard
        online={online}
        hubName={crew?.hubName ?? "Blink"}
        onToggle={setOnline}
      />

      {/*
        Said out loud because it fails silently otherwise. A rider who declined
        background location is online, taking work, and invisible to their hub —
        and nothing on screen would tell them until someone rang to ask where
        they were.
      */}
      {location.needsPermission ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fix location permission in settings"
          onPress={() => void Linking.openSettings()}
          className="active:opacity-80"
        >
          <View className="flex-row items-center gap-space-4 rounded-lg border border-warning bg-warning-soft p-space-4">
            <Icon name="warning-outline" size={20} tone="onBrand" />
            <View className="flex-1">
              <Text weight="semibold" size="sm" className="text-strong">
                Your hub can&rsquo;t see your location
              </Text>
              <Text variant="muted" size="caption">
                {location.state === "background_denied"
                  ? "Set location to “Allow all the time” so deliveries keep tracking while the app is closed."
                  : "Turn on location access to receive and track deliveries."}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} tone="onBrand" />
          </View>
        </Pressable>
      ) : null}

      <View className="items-center">
        <DeliveryBadge size="md" />
      </View>

      {jobs === undefined || stats === undefined ? (
        <HomeSkeleton />
      ) : (
        <>
          <Stats jobs={jobs.all} stats={stats} now={now} />
          <ActiveSection active={jobs.active} now={now} />
        </>
      )}
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View className="gap-[14px]">
      <View className="flex-row gap-space-4">
        <Card className="h-[128px] flex-1" />
        <Card className="h-[128px] flex-1" />
      </View>
      <Skeleton className="h-space-6 w-[150px]" />
      <Card className="h-[220px]" />
    </View>
  );
}

function Stats({
  jobs,
  stats,
  now,
}: {
  jobs: RiderJob[];
  stats: NonNullable<ReturnType<typeof useRiderStats>>;
  now: number;
}) {
  const wow = weekOverWeekPct(jobs, now);
  const drop = averageDropMs(jobs, now);
  return (
    <View className="flex-row gap-space-4">
      <SparkStat
        label="Earnings today"
        value={formatMoneyCompact(stats.earningsToday)}
        bars={lastDays(jobs, now, 7, "fee")}
        footnote={
          wow === null ? null : `${wow >= 0 ? "+" : ""}${wow}% on last week`
        }
      />
      <SparkStat
        label="Deliveries"
        value={`${stats.completedToday} today`}
        bars={lastDays(jobs, now, 7, "count")}
        footnote={drop === null ? null : `avg ${formatDuration(drop)} a drop`}
      />
    </View>
  );
}

function ActiveSection({ active, now }: { active: RiderJob[]; now: number }) {
  const router = useRouter();
  const current = active[0] ?? null;
  const next = active[1] ?? null;

  return (
    <>
      <View className="mt-[2px] flex-row items-center justify-between">
        <Text size="h3" weight="bold" className="text-strong">
          Active delivery
        </Text>
        {current ? (
          <ClockPill deadline={dropBy(current.orderDate)} now={now} />
        ) : null}
      </View>

      {current ? (
        <ActiveCard job={current} now={now} />
      ) : (
        <Card className="items-center gap-space-2 py-space-8">
          <Text weight="semibold" className="text-strong">
            No active delivery
          </Text>
          <Text variant="muted" size="sm" className="text-center">
            You&rsquo;ll be notified as soon as your hub assigns one.
          </Text>
        </Card>
      )}

      {next ? (
        <>
          <Text size="h3" weight="bold" className="mt-[6px] text-strong">
            Next in your queue
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Order ${next.reference}, ${next.addressLine}`}
            onPress={() => router.push(`/delivery/${next.id}`)}
            className="flex-row items-center justify-between gap-space-4 rounded-lg border border-border bg-card px-space-5 py-[14px] active:opacity-80"
          >
            <View className="flex-1">
              <Text size="sm" weight="bold" className="text-strong">
                Order #{next.reference}
              </Text>
              <Text size="sm" variant="subtle" numberOfLines={1}>
                {next.addressLine}
              </Text>
            </View>
            <StatusPill status={next.status} />
          </Pressable>
        </>
      ) : null}
    </>
  );
}

/**
 * The job in hand. The list row carries the address and times; the detail
 * query adds the hub and the item count, and the card renders from the list
 * row while that loads rather than blanking.
 */
function ActiveCard({ job, now }: { job: RiderJob; now: number }) {
  const router = useRouter();
  const model = useDelivery(job.id as Id<"shipments">);
  const here = useDeviceLocation();
  const startRide = useStartRide();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detail = model ? model.detail : null;
  const deadline = dropBy(job.orderDate);
  const away =
    here && job.coordinates ? formatDistance(distanceKm(here, job.coordinates)) : null;

  const chips = [
    detail ? itemCountLabel(detail.itemCount) : null,
    away ? `${away} away` : null,
    deadline !== null ? `Drop by ${formatClock(deadline)}` : null,
  ].filter((c): c is string => c !== null);

  // Mirrors the ride screen's own rule: on the way means go straight back to
  // the ride; from the hub, the tap starts it.
  const onTheWay = isOnTheWay(job.status);
  async function onRide() {
    setError(null);
    if (canStartRide(job.status)) {
      setStarting(true);
      try {
        await startRide(job.id as Id<"shipments">);
      } catch {
        setError("Couldn’t start the ride. Check your connection.");
        return;
      } finally {
        setStarting(false);
      }
    }
    router.push(`/delivery/${job.id}/ride`);
  }

  return (
    <View className="gap-space-4 rounded-lg border border-border bg-card p-space-5 shadow-xs">
      <View className="flex-row items-baseline justify-between gap-[10px]">
        <Text size="h4" weight="bold" className="text-strong">
          Order #{job.reference}
        </Text>
        <Text size="base" weight="bold" className="text-price">
          {formatMoney(job.total)}
        </Text>
      </View>

      <RouteStops pickup={detail?.hubName ?? null} dropoff={job.addressLine} />

      {chips.length > 0 ? (
        <View className="flex-row flex-wrap gap-space-3">
          {chips.map((c) => (
            <Chip key={c} label={c} />
          ))}
        </View>
      ) : null}

      {error ? (
        <Text size="sm" variant="destructive">
          {error}
        </Text>
      ) : null}

      <View className="flex-row gap-[10px] pt-[2px]">
        <Button
          variant="outline"
          size="ctaSm"
          label="View details"
          className="h-[46px] flex-1"
          onPress={() => router.push(`/delivery/${job.id}`)}
        />
        <Button
          size="ctaSm"
          label={onTheWay ? "Back to the ride" : "Start the ride"}
          loading={starting}
          className="h-[46px] flex-1"
          onPress={() => void onRide()}
        />
      </View>
    </View>
  );
}
