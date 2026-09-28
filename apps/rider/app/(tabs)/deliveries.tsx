import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { StatusPill } from "../../components/job/StatusPill";
import { useCrewRole } from "../../providers/CrewProvider";
import { queueTabLabel } from "../../lib/roles";
import { useQueue, useRiderJobs } from "../../lib/data";
import { formatDuration, type RiderJob } from "../../lib/earnings";
import { formatClock, formatMoney } from "../../lib/format";

type Tab = "active" | "done";

function ListSkeleton() {
  return (
    <View className="gap-[14px]">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="gap-space-3">
          <View className="flex-row justify-between">
            <Skeleton className="h-space-5 w-[140px]" />
            <Skeleton className="h-space-6 w-[96px] rounded-pill" />
          </View>
          <Skeleton className="h-space-4 w-[200px]" />
          <Skeleton className="h-space-4 w-[160px]" />
        </Card>
      ))}
    </View>
  );
}

/**
 * Deliveries (rider) / Orders (picker).
 *
 * Riders get the design: Active and Completed tabs over one list, each card
 * the order, its status, where it is going and what it was worth. Pickers keep
 * their single queue — the design has no picker screens — on the same cards.
 */
export default function QueueRoute() {
  const insets = useSafeAreaInsets();
  const role = useCrewRole();

  return (
    <Screen withTabBar>
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="gap-[14px] pb-space-7"
      >
        <Text
          weight="bold"
          className="text-[24px] leading-[30px] tracking-h2 text-strong"
        >
          {queueTabLabel(role)}
        </Text>
        {role === "rider" ? <RiderQueue /> : <PickerQueue />}
      </View>
    </Screen>
  );
}

function RiderQueue() {
  const router = useRouter();
  const jobs = useRiderJobs();
  const [tab, setTab] = useState<Tab>("active");

  if (jobs === undefined) return <ListSkeleton />;

  const list = tab === "active" ? jobs.active : jobs.done;

  return (
    <>
      <SegmentedTabs
        items={[
          { value: "active", label: `Active · ${jobs.active.length}` },
          { value: "done", label: `Completed · ${jobs.done.length}` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<Icon name="file-tray-outline" size={32} tone="subtle" />}
          title={tab === "active" ? "Nothing to deliver" : "No deliveries yet"}
          body={
            tab === "active"
              ? "Assigned deliveries appear here as soon as your hub dispatches them."
              : "Deliveries you complete are kept here, with what each one paid."
          }
        />
      ) : (
        <View className="gap-[14px]">
          {list.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onPress={() => router.push(`/delivery/${job.id}`)}
            />
          ))}
        </View>
      )}
    </>
  );
}

/** "Assigned 14:41" while live; "Delivered 14:22 · 9 min" once done. */
function jobMeta(job: RiderJob): string {
  if (job.completedAt !== null) {
    const took = job.completedAt - job.assignedAt;
    return took > 0
      ? `Delivered ${formatClock(job.completedAt)} · ${formatDuration(took)}`
      : `Delivered ${formatClock(job.completedAt)}`;
  }
  return `Assigned ${formatClock(job.assignedAt)}`;
}

function JobCard({ job, onPress }: { job: RiderJob; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${job.reference}, ${job.addressLine}`}
      onPress={onPress}
      className="gap-[10px] rounded-lg border border-border bg-card p-space-5 shadow-xs active:opacity-80"
    >
      <View className="flex-row items-center justify-between gap-[10px]">
        <Text size="base" weight="bold" className="text-strong">
          Order #{job.reference}
        </Text>
        <StatusPill status={job.status} />
      </View>
      <View className="flex-row items-center gap-[7px]">
        <Icon name="location-outline" size={15} tone="body" />
        <Text size="sm" numberOfLines={1} className="flex-1 text-foreground">
          {job.addressLine}
        </Text>
      </View>
      <View className="flex-row items-center justify-between gap-[10px]">
        <Text size="sm" variant="subtle" className="flex-1">
          {jobMeta(job)}
        </Text>
        <Text size="sm" weight="bold" className="text-price">
          {formatMoney(job.total)}
        </Text>
      </View>
    </Pressable>
  );
}

function PickerQueue() {
  const router = useRouter();
  const items = useQueue();

  if (items === undefined) return <ListSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="file-tray-outline" size={32} tone="subtle" />}
        title="Nothing to pick yet"
        body="Orders queued for picking will appear here."
      />
    );
  }

  return (
    <View className="gap-[14px]">
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => router.push(`/picklist/${item.id}`)}
          className="gap-[10px] rounded-lg border border-border bg-card p-space-5 shadow-xs active:opacity-80"
        >
          <View className="flex-row items-center justify-between gap-[10px]">
            <Text size="base" weight="bold" className="text-strong">
              Order #{item.reference}
            </Text>
            {/*
              Status comes from the document, not a hardcoded string. The
              reference app rendered a fixed "In Progress" chip on every row
              regardless of the order's actual status.
            */}
            <StatusPill status={item.status} label={item.status} />
          </View>
          <Text size="sm" variant="subtle" numberOfLines={1}>
            {item.subtitle}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
