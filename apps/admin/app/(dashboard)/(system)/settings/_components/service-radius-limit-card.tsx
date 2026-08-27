"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  LocationShare01Icon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";

import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";

const SETTING_KEY = "vendor_service_radius_limit_m";

/**
 * The vendor service-radius ceiling, in metres.
 *
 * ── The two failure modes this design avoids ──────────────────────────────
 *
 * 1. Silently rejecting new vendors past a limit nobody could see. The limit is
 *    fetched here from `getVendorServiceRadiusLimit` — the SAME query the
 *    vendor form reads — so what an admin sets here is exactly what a manager
 *    creating a vendor gets validated against. There is only one source of
 *    truth on the wire; see `platform_settings.ts`'s
 *    `VENDOR_SERVICE_RADIUS_LIMIT_KEY` comment for why that matters.
 *
 * 2. Lowering the limit and silently leaving some vendors non-compliant with
 *    no record anyone was told. `getVendorsExceedingRadius` runs against the
 *    value in the INPUT as it is typed — not the saved value — so by the time
 *    Save is clicked the confirmation dialog (if any) is already showing the
 *    right list. Saving never rewrites a vendor's own radius; a vendor already
 *    past the new limit stays exactly as it was, and this dialog is the one
 *    place that fact is surfaced.
 */
export function ServiceRadiusLimitCard() {
  const { isSuperAdmin, isLoading: permsLoading } = useCurrentUserPermissions();
  const currentLimit = useQuery(
    api.data.platform_settings.getVendorServiceRadiusLimit,
    {},
  );
  const upsert = useMutation(api.data.platform_settings.upsert);

  const [draft, setDraft] = useState<string>("");
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed the input from the loaded value exactly once — after that the field
  // is the user's own, and re-syncing on every re-render would fight typing.
  if (currentLimit !== undefined && !touched && draft === "") {
    setDraft(String(currentLimit));
  }

  const candidate = Number(draft);
  const candidateValid = draft.trim() !== "" && Number.isFinite(candidate) && candidate > 0;

  // Live against whatever is in the box, not the saved value — this is what
  // lets the dialog be accurate the instant Save is clicked rather than one
  // keystroke behind it.
  const exceeding = useQuery(
    api.data.platform_settings.getVendorsExceedingRadius,
    candidateValid ? { limitMeters: candidate } : "skip",
  );

  const unchanged = currentLimit !== undefined && candidate === currentLimit;

  // Hidden entirely rather than disabled, matching DemoDataCard: a control
  // guaranteed to be refused by the backend gate is worse than no control.
  if (permsLoading || !isSuperAdmin) return null;

  async function doSave() {
    setSaving(true);
    try {
      await upsert({
        key: SETTING_KEY,
        value: String(candidate),
        description:
          "Maximum service radius a vendor may be given, in metres.",
      });
      setTouched(false);
      toast.success(
        `Vendor service radius limit set to ${candidate.toLocaleString("en-KE")} m`,
      );
    } catch (err) {
      toast.error(
        getConvexErrorMessage(err, "Could not update the service radius limit."),
      );
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  function onSaveClick() {
    if (!candidateValid || unchanged) return;
    if (exceeding === undefined) {
      // The check hasn't resolved for this exact candidate yet — waiting
      // rather than saving avoids the one race that would matter here:
      // confirming against a stale, possibly-empty exceeding list.
      return;
    }
    if (exceeding.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void doSave();
  }

  const checking = candidateValid && !unchanged && exceeding === undefined;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={LocationShare01Icon} className="size-4" />
          Vendor Service Radius Limit
        </CardTitle>
        <CardDescription>
          The largest service radius a vendor may be given. Enforced whenever a
          vendor is created or its radius is edited.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {currentLimit === undefined ? (
          <Skeleton className="h-9 w-48" />
        ) : (
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="radius-limit">Limit (metres)</Label>
            <Input
              id="radius-limit"
              type="number"
              min={1}
              step={100}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setTouched(true);
              }}
            />
            {draft.trim() !== "" && !candidateValid ? (
              <p className="text-destructive text-xs">
                Enter a whole number of metres greater than zero.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {/*
                  Stated in both units so a metric number does not need mental
                  conversion — 15,000 m reads faster as "15 km" to almost
                  everyone who will use this screen.
                */}
                {candidateValid
                  ? `≈ ${(candidate / 1000).toLocaleString("en-KE", { maximumFractionDigits: 1 })} km`
                  : " "}
              </p>
            )}
          </div>
        )}

        <Button
          onClick={onSaveClick}
          disabled={
            currentLimit === undefined ||
            !candidateValid ||
            unchanged ||
            saving ||
            checking
          }
        >
          {saving ? "Saving…" : checking ? "Checking vendors…" : "Save limit"}
        </Button>
      </CardContent>

      <RadiusWarningDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        limitMeters={candidateValid ? candidate : 0}
        vendors={exceeding ?? []}
        saving={saving}
        onConfirm={doSave}
      />
    </Card>
  );
}

interface ExceedingVendor {
  _id: string;
  name: string;
  service_radius: number;
}

function RadiusWarningDialog({
  open,
  onOpenChange,
  limitMeters,
  vendors,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitMeters: number;
  vendors: ExceedingVendor[];
  saving: boolean;
  onConfirm: () => void;
}) {
  // Worst offenders first — the vendor furthest past the new limit is the one
  // most likely to need an actual conversation, not just a glance.
  const sorted = useMemo(
    () => [...vendors].sort((a, b) => b.service_radius - a.service_radius),
    [vendors],
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Alert02Icon}
              className="text-warning size-5 shrink-0"
            />
            {sorted.length} vendor{sorted.length === 1 ? "" : "s"} already
            exceed{sorted.length === 1 ? "s" : ""} this limit
          </AlertDialogTitle>
          <AlertDialogDescription>
            Lowering the limit to {limitMeters.toLocaleString("en-KE")} m will
            not change any vendor&apos;s own radius — the vendors below will
            simply be left above the new platform limit until someone edits
            them individually.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Vendor</th>
                <th className="px-3 py-2 text-right font-medium">
                  Current radius
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((vendor) => (
                <tr key={vendor._id}>
                  <td className="max-w-[220px] truncate px-3 py-2 font-medium">
                    {vendor.name}
                  </td>
                  <td className="text-destructive px-3 py-2 text-right font-semibold tabular-nums">
                    {vendor.service_radius.toLocaleString("en-KE")} m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // The primitive closes on click by default; this save is async
              // and the dialog should stay open (showing "Saving…") until it
              // resolves, so the default close is prevented and doSave closes
              // it itself in its `finally`.
              e.preventDefault();
              onConfirm();
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save anyway"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
