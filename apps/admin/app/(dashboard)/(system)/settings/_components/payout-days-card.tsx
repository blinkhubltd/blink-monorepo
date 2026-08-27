"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";

import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PlainSection } from "./settings-ui";

const KEY = "agent_payout_days";

const DAYS = [
  { value: "monday", short: "Mon" },
  { value: "tuesday", short: "Tue" },
  { value: "wednesday", short: "Wed" },
  { value: "thursday", short: "Thu" },
  { value: "friday", short: "Fri" },
  { value: "saturday", short: "Sat" },
  { value: "sunday", short: "Sun" },
] as const;

type Day = (typeof DAYS)[number]["value"];

/**
 * Which days agents may request a payout.
 *
 * Its own card, not part of the settings draft, because the stored value is a
 * comma-joined string and the control is a set of toggles — folding it into the
 * text-field draft would mean editing "friday,saturday" by hand.
 *
 * ── Two fixes ────────────────────────────────────────────────────────────
 *
 *  - Toggle buttons rather than seven checkboxes with labels. Days of the week
 *    are a fixed, ordered, mutually-visible set; a row of toggles shows the
 *    whole week at a glance where a checkbox list makes you read seven labels to
 *    find out that Wednesday is off.
 *
 *  - An empty selection now warns. `lib/payout_window.ts` fails CLOSED on an
 *    empty config, so saving zero days silently blocks every agent payout — the
 *    single most consequential thing on this page, and previously it saved with
 *    a plain success toast.
 */
export function PayoutDaysCard() {
  const setting = useQuery(api.data.platform_settings.get, { key: KEY });
  const upsert = useMutation(api.data.platform_settings.upsert);

  const [selected, setSelected] = useState<Day[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Adopt the server value once it arrives, and again whenever it changes
  // externally — but never over the top of an in-progress edit.
  useEffect(() => {
    if (setting === undefined) return;
    setSelected((current) => {
      if (current !== null) return current;
      const parsed = String(setting?.value ?? "")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter((d): d is Day => DAYS.some((x) => x.value === d));
      return parsed;
    });
  }, [setting]);

  if (setting === undefined || selected === null) {
    return (
      <PlainSection
        title="Agent payout days"
        blurb="The days on which agents may submit a payout request."
      >
        <Skeleton className="h-9 w-full max-w-md" />
      </PlainSection>
    );
  }

  // Bound after the guard above: TypeScript will not narrow `selected` inside
  // the closures below, because a captured state variable could in principle
  // change between render and invocation. It cannot here — a re-render with
  // null would have returned early — so binding it once is both correct and
  // clearer than a non-null assertion at each use.
  const days: Day[] = selected;

  const saved = String(setting?.value ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");
  const draft = [...days].sort().join(",");
  const dirty = draft !== saved;

  function toggle(day: Day) {
    setSelected((prev) =>
      (prev ?? []).includes(day)
        ? (prev ?? []).filter((d) => d !== day)
        : [...(prev ?? []), day],
    );
  }

  async function save() {
    setSaving(true);
    try {
      // Written in week order rather than click order, so the stored string is
      // stable and two admins choosing the same days produce the same value.
      const ordered = DAYS.filter((d) => days.includes(d.value)).map(
        (d) => d.value,
      );
      await upsert({
        key: KEY,
        value: ordered.join(","),
        description:
          "Comma-separated days of the week when agents can create payout requests",
      });
      toast.success(
        ordered.length === 0
          ? "Payout days cleared — agents cannot request payouts"
          : "Payout days updated",
      );
    } catch (err) {
      toast.error(getConvexErrorMessage(err, "Could not update payout days."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlainSection
      title="Agent payout days"
      blurb="The days on which agents may submit a payout request. Requests on other days are refused."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const on = days.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggle(day.value)}
                aria-pressed={on}
                className={cn(
                  "min-w-[56px] rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted text-muted-foreground",
                )}
              >
                {day.short}
              </button>
            );
          })}
        </div>

        {/*
          Named as a consequence, not a validation error — an empty set is a
          legitimate choice (pausing payouts entirely), it just must not be made
          by accident. `lib/payout_window.ts` fails closed on empty config.
        */}
        {days.length === 0 ? (
          <p className="text-destructive flex items-start gap-2 text-sm">
            <HugeiconsIcon
              icon={Alert02Icon}
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              With no days selected, agents cannot request a payout at all.
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Agents may request a payout on{" "}
            <span className="text-foreground font-medium">
              {DAYS.filter((d) => days.includes(d.value))
                .map((d) => d.short)
                .join(", ")}
            </span>
            .
          </p>
        )}

        <Button onClick={save} disabled={!dirty || saving} size="sm">
          {saving ? (
            <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
          ) : null}
          {saving ? "Saving…" : "Save payout days"}
        </Button>
      </div>
    </PlainSection>
  );
}
