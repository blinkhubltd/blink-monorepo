"use client";

import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Calendar03Icon,
  Clock01Icon,
  Grid2X2Icon,
  PlusSignIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  ScheduleForm,
  ScheduleTable,
  ScheduleOverview,
  type ScheduleWithDetails,
} from "@/components/schedules";
import { computeScheduleStats } from "@/components/schedules/schedule-metrics";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { StatCard, StatCardSkeleton } from "../../_components/stat-card";
import { count } from "../../_components/format";

/**
 * Staff schedules.
 *
 * ── What changed ──────────────────────────────────────────────────────────
 *
 * A "Quick Actions" card is gone. It had four buttons: two ("Add Individual
 * Schedule", "Bulk Schedule Setup") called the same handler and opened the same
 * single-person dialog, so the second promised a capability that does not exist;
 * one duplicated the tab immediately below it; and "Generate Time Reports" had
 * no handler at all. A row of buttons where half do nothing they claim is worse
 * than no row.
 *
 * The stat row now uses the shared `StatCard`, which carries the `inverse` flag
 * — so "schedules with no shifts" being high reads as a problem rather than as
 * growth. The old cards were hand-rolled with `text-black` and `text-gray-600`,
 * hardcoded so they neither followed the brand nor worked in dark mode, and the
 * weekly-hours figure they showed was computed by arithmetic that went negative
 * on night shifts (see `components/schedules/schedule-metrics.ts`).
 *
 * `p-6` on the page is gone: the dashboard shell already applies padding, so it
 * was doubled here.
 */
export default function SchedulesPage() {
  const { schedules, vendors, isLoaded } = useDashboardData();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ScheduleWithDetails | null>(null);
  const [tab, setTab] = useState("table");

  const stats = useMemo(
    () => computeScheduleStats((schedules ?? []) as ScheduleWithDetails[]),
    [schedules],
  );

  if (!isLoaded) {
    return <SchedulesSkeleton />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">Staff schedules</h1>
          <p className="text-muted-foreground text-sm">
            Recurring weekly hours for riders, pickers and hub managers. These
            are templates, not dated shifts — they repeat every week until
            changed.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          New schedule
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Schedules"
          value={count(stats.total)}
          icon={Calendar03Icon}
          hint={`${count(stats.staff)} ${stats.staff === 1 ? "person" : "people"} rostered`}
        />
        <StatCard
          label="Hubs covered"
          value={count(stats.vendors)}
          icon={UserGroupIcon}
          hint={`of ${count(vendors?.length ?? 0)} total`}
        />
        <StatCard
          label="Average week"
          value={
            stats.total === 0
              ? "—"
              : `${stats.averageWeeklyHours.toFixed(1)} hrs`
          }
          icon={Clock01Icon}
          // Said explicitly: the denominator is every schedule, so an unrostered
          // person pulls this down. The old version quietly excluded them, which
          // made the number look better than the roster was.
          hint="Across every schedule, including empty ones"
        />
        <StatCard
          label="No shifts set"
          value={count(stats.emptySchedules)}
          icon={Alert02Icon}
          // Fewer is better, so a fall must not be coloured as a decline.
          inverse
          hint={
            stats.emptySchedules === 0
              ? "Every schedule has hours"
              : "Created but never filled in"
          }
        />
      </section>

      {/*
        Only when it applies. A malformed time is invisible everywhere else —
        the previous code caught the parse error and skipped the day, so those
        hours simply vanished from every total with nothing said.
      */}
      {stats.malformedSchedules > 0 ? (
        <div className="border-destructive/40 bg-destructive/5 flex items-start gap-2 rounded-lg border p-3">
          <HugeiconsIcon
            icon={Alert02Icon}
            className="text-destructive mt-0.5 size-4 shrink-0"
          />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">
              {stats.malformedSchedules}{" "}
              {stats.malformedSchedules === 1 ? "schedule has" : "schedules have"}{" "}
              a day with unreadable times
            </p>
            <p className="text-muted-foreground">
              Those days are excluded from every total above. Open the schedule
              and re-enter the affected day.
            </p>
          </div>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="table">All schedules</TabsTrigger>
          <TabsTrigger value="overview">
            <HugeiconsIcon icon={Grid2X2Icon} className="size-4" />
            Weekly cover
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4">
          <ScheduleTable onEditSchedule={setEditing} />
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <ScheduleOverview />
        </TabsContent>
      </Tabs>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New schedule</DialogTitle>
            <DialogDescription>
              Pick a staff member, then set the hours for each day they work.
            </DialogDescription>
          </DialogHeader>
          <ScheduleForm
            onSuccess={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit schedule</DialogTitle>
            <DialogDescription>
              {editing?.user?.name
                ? `Weekly hours for ${editing.user.name}.`
                : "Weekly hours for this staff member."}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <ScheduleForm
              initialData={{
                userId: editing.userId,
                vendorId: editing.vendorId,
                weeklySchedule: editing.weeklySchedule,
              }}
              onSuccess={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SchedulesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
