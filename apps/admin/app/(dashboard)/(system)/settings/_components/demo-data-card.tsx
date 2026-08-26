"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Database02Icon,
  Delete02Icon,
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
import { getConvexErrorMessage } from "@/lib/utils";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";

/**
 * Seed and clear the demo dataset.
 *
 * Rendered only for a super admin, matching the mutation's own gate — a button
 * that is guaranteed to be refused is worse than no button.
 *
 * Both actions require typing a phrase. That is not ceremony: seeding writes
 * several hundred rows and clearing deletes them, and this card sits on the
 * settings page of an app that will one day point at production. A phrase is the
 * cheapest thing that makes "wrong deployment" a deliberate act rather than a
 * misplaced click.
 */

const SEED_PHRASE = "seed demo data";
const CLEAR_PHRASE = "clear demo data";

/** The order the summary reads in — insertion order, not alphabetical. */
const SUMMARY_ORDER = [
  ["orders", "Orders"],
  ["orderItems", "Order items"],
  ["shipments", "Shipments"],
  ["payments", "Payments"],
  ["products", "Products"],
  ["customers", "Customers"],
  ["riders", "Riders"],
  ["pickers", "Pickers"],
  ["vendors", "Vendors"],
  ["categories", "Categories"],
  ["industries", "Industries"],
  ["days", "Days of history"],
] as const;

export function DemoDataCard() {
  const { isSuperAdmin, isLoading } = useCurrentUserPermissions();
  const status = useQuery(api.seed.getDemoDataStatus, {});
  const seed = useMutation(api.seed.seedDemoData);
  const clear = useMutation(api.seed.clearDemoData);

  const [phrase, setPhrase] = useState("");
  const [days, setDays] = useState("95");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // Hidden entirely rather than disabled. The mutation refuses anyone else, so
  // showing the control would only advertise something they cannot do.
  if (isLoading || !isSuperAdmin) return null;

  if (status === undefined) {
    return (
      <Card className="mt-6">
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-9 w-48" />
        </CardContent>
      </Card>
    );
  }

  const seeded = status.seeded;
  const expected = seeded ? CLEAR_PHRASE : SEED_PHRASE;
  const ready = phrase.trim().toLowerCase() === expected;

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (seeded) {
        const out = await clear({ confirm: phrase });
        setResult(
          `Removed ${out.deleted.toLocaleString("en-KE")} rows` +
            (out.alreadyGone > 0
              ? `. ${out.alreadyGone} were already gone.`
              : "."),
        );
      } else {
        const parsed = Number.parseInt(days, 10);
        const out = await seed({
          confirm: phrase,
          days: Number.isFinite(parsed) ? parsed : undefined,
        });
        setResult(
          `Created ${out.orders.toLocaleString("en-KE")} orders across ` +
            `${out.days} days, with ${out.products} products and ` +
            `${out.customers} customers.`,
        );
      }
      setPhrase("");
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          seeded ? "Could not clear the demo data." : "Could not seed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={Database02Icon} className="size-4" />
          Demo data
        </CardTitle>
        <CardDescription>
          {seeded
            ? "A demo dataset is present. Clearing removes exactly the rows it created, and nothing else."
            : "Fills the dashboards with a realistic dataset — orders, shipments, products, customers — so the charts can be read."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {seeded && status.summary ? (
          <div className="bg-muted/40 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg p-3 sm:grid-cols-3">
            {SUMMARY_ORDER.map(([key, label]) => {
              const value = status.summary?.[key];
              if (value === undefined) return null;
              return (
                <div key={key} className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground text-xs">{label}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {value.toLocaleString("en-KE")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {seeded && status.seededAt ? (
          <p className="text-muted-foreground text-xs">
            Seeded{" "}
            {new Date(status.seededAt).toLocaleString("en-KE", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            .
          </p>
        ) : null}

        {!seeded ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="demo-days">Days of history</Label>
              <Input
                id="demo-days"
                type="number"
                min={7}
                max={180}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {/*
                  95 covers this month, last month and part of the one before, so
                  every period the selector offers has both data and a previous
                  period to compare against.
                */}
                95 gives every period a previous one to compare against.
              </p>
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="demo-confirm">
            Type <span className="font-mono">{expected}</span> to confirm
          </Label>
          <Input
            id="demo-confirm"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={expected}
            autoComplete="off"
          />
        </div>

        {error ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-sm">
            <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        {result ? (
          <p role="status" className="text-success flex items-start gap-2 text-sm">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{result}</span>
          </p>
        ) : null}

        <Button
          onClick={run}
          disabled={busy || !ready}
          variant={seeded ? "destructive" : "default"}
        >
          {seeded ? (
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          ) : (
            <HugeiconsIcon icon={Database02Icon} className="size-4" />
          )}
          {busy
            ? seeded
              ? "Clearing…"
              : "Seeding…"
            : seeded
              ? "Clear demo data"
              : "Seed demo data"}
        </Button>

        <p className="text-muted-foreground text-xs">
          {/*
            Stated because someone will reasonably wonder whether seeded people
            can log in, and because it explains why cleanup is complete: there
            are no Clerk accounts left behind that this cannot reach.
          */}
          Seeded people are Convex records only — no Clerk accounts are created,
          so nobody can sign in as them.
        </p>
      </CardContent>
    </Card>
  );
}
