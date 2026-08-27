"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";

import { settingGroups } from "./_components/fields";
import { useSettingsDraft } from "./_components/use-settings-draft";
import { SaveBar, SettingsSection } from "./_components/settings-ui";
import { ClearanceImageCard } from "./_components/clearance-image-card";
import { PayoutDaysCard } from "./_components/payout-days-card";
import { ServiceRadiusLimitCard } from "./_components/service-radius-limit-card";
import { DemoDataCard } from "./_components/demo-data-card";

/**
 * Platform settings.
 *
 * ── What changed, and why ─────────────────────────────────────────────────
 *
 * The page was twelve knobs in twelve cards, each with its own Save button, of
 * which only five were actually reachable — `clearance_batch_wait_minutes`,
 * `clearance_batch_max_orders` and the three legal versions were seeded but had
 * no UI, so they could only be changed from the Convex dashboard. The batch
 * settings decide when a clearance order dispatches, which is an operational
 * lever, not an internal one.
 *
 * Now: settings grouped by the decision they belong to, one draft across the
 * page, one save. See `_components/settings-ui.tsx` for why grouping matters
 * more than it sounds, and `use-settings-draft.ts` for why the baseline is the
 * live server value rather than a snapshot.
 *
 * The four cards that own real behaviour — the clearance image, payout days, the
 * vendor radius limit with its warning dialog, and demo data — stay separate
 * from that draft. Each writes on its own terms, and folding them in would mean
 * the save bar counting a file that has not been uploaded yet.
 *
 * ── The page chrome ──────────────────────────────────────────────────────
 *
 * `min-h-screen bg-background` wrapping a `container mx-auto px-6` header is
 * gone. The dashboard shell already supplies the background, the padding and a
 * breadcrumb header, so that markup produced a second header inside the first
 * and doubled the horizontal padding. Same correction as the insights pages.
 */
export default function SettingsPage() {
  const { isSuperAdmin, isLoading: permissionsLoading } =
    useCurrentUserPermissions();
  const draft = useSettingsDraft();

  if (permissionsLoading || draft.loading) {
    return <SettingsSkeleton />;
  }

  // Every write on this page goes through `platform_settings.upsert`, which
  // requires the wildcard permission. Saying so beats rendering controls that
  // are guaranteed to be refused.
  if (!isSuperAdmin) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={Alert02Icon} className="size-4" />
            Not available to your role
          </CardTitle>
          <CardDescription>
            Platform settings are limited to super administrators.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Platform settings</h1>
        <p className="text-muted-foreground text-sm">
          Fees, clearance behaviour, vendor limits and legal document versions.
          Changes take effect immediately and apply to new activity only.
        </p>
      </header>

      {settingGroups.map((group) => (
        <SettingsSection
          key={group.id}
          group={group}
          shown={draft.shown}
          errors={draft.errors}
          dirtyKeys={draft.dirtyKeys}
          onChange={draft.setField}
          disabled={draft.saving}
        />
      ))}

      <ServiceRadiusLimitCard />
      <PayoutDaysCard />
      <ClearanceImageCard />
      <DemoDataCard />

      <SaveBar
        count={draft.dirtyKeys.length}
        hasErrors={draft.hasErrors}
        saving={draft.saving}
        onSave={draft.save}
        onDiscard={draft.discard}
      />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72" />
            <div className="space-y-4 pt-4">
              {Array.from({ length: 3 }).map((__, j) => (
                <Skeleton key={j} className="h-9 w-full" />
              ))}
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
