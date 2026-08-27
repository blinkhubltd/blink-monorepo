"use client";

import type React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  FloppyDiskIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";

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
import { cn } from "@/lib/utils";
import type { SettingField, SettingGroup } from "./fields";

/**
 * The pieces the settings page is built from.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * Every setting used to be its own `<Card>` with its own Save button, laid out
 * two-up in a grid. Three problems, in order of how much they cost:
 *
 *  1. Saving several settings meant several clicks and several round trips, with
 *     nothing showing which fields had unsaved edits. The save bar below covers
 *     the whole page instead, and states the count.
 *
 *  2. A card per field made related settings look unrelated. The clearance
 *     radius sat beside the standard delivery fee with equal weight, so the page
 *     read as twelve unconnected knobs rather than four decisions.
 *
 *  3. `bg-yellow-500 text-white` on the primary buttons. Not a Blink colour —
 *     the brand is #FFC50B — it bypasses the theme so it does not follow dark
 *     mode, and white on yellow-500 is about 1.9:1 against the 4.5:1 minimum.
 *     `bg-primary text-primary-foreground` is both correct and legible.
 */

// ── One field ───────────────────────────────────────────────────────────────

export function SettingRow({
  field,
  value,
  error,
  dirty,
  onChange,
  disabled,
}: {
  field: SettingField;
  value: string;
  error?: string;
  dirty: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = `setting-${field.key}`;

  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-start sm:gap-6">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="flex items-center gap-2">
          {field.label}
          {/*
            A dot rather than the word "unsaved": the save bar already carries
            the count and the verb, so this only needs to mark WHICH rows it
            refers to. Given a title too, since colour alone is not a signal
            everyone receives.
          */}
          {dirty ? (
            <span
              className="bg-primary size-1.5 rounded-full"
              title="Unsaved change"
              aria-label="Unsaved change"
            />
          ) : null}
        </Label>
        <p className="text-muted-foreground text-sm">{field.help}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Input
            id={id}
            // `text` with a numeric keypad rather than `type="number"`:
            // number inputs silently swallow the value on a stray scroll and
            // report "" for anything half-typed, which fights per-keystroke
            // validation. Validation here is explicit anyway.
            type="text"
            inputMode={field.kind === "text" ? "text" : "decimal"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn("tabular-nums", error && "border-destructive")}
          />
          {field.unit ? (
            <span className="text-muted-foreground shrink-0 text-sm">
              {field.unit}
            </span>
          ) : null}
        </div>
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── One group ───────────────────────────────────────────────────────────────

export function SettingsSection({
  group,
  shown,
  errors,
  dirtyKeys,
  onChange,
  disabled,
}: {
  group: SettingGroup;
  shown: Record<string, string>;
  errors: Record<string, string>;
  dirtyKeys: string[];
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  const dirtyHere = group.fields.filter((f) => dirtyKeys.includes(f.key)).length;

  return (
    <Card id={group.id}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {group.title}
          {dirtyHere > 0 ? (
            <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
              {dirtyHere} unsaved
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>{group.blurb}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {/*
          Divided rows rather than a card each: the divider says "same kind of
          thing" where a card border says "unrelated". `first:pt-0` keeps the
          first row flush with the header.
        */}
        <div className="divide-y [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
          {group.fields.map((field) => (
            <SettingRow
              key={field.key}
              field={field}
              value={shown[field.key] ?? ""}
              error={errors[field.key]}
              dirty={dirtyKeys.includes(field.key)}
              onChange={(value) => onChange(field.key, value)}
              disabled={disabled}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── The save bar ────────────────────────────────────────────────────────────

/**
 * Appears only when something is dirty.
 *
 * Sticky at the bottom rather than a button at the end of the page: this page is
 * long enough to scroll, and a save control you have to scroll to find is one
 * people abandon edits in front of. It states the count, because "Save" alone
 * does not tell you whether the field you just fixed is included.
 */
export function SaveBar({
  count,
  hasErrors,
  saving,
  onSave,
  onDiscard,
}: {
  count: number;
  hasErrors: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-4 z-20 mt-6">
      <div className="bg-popover flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-lg">
        <span className="flex items-center gap-2 text-sm">
          {hasErrors ? (
            <HugeiconsIcon
              icon={Alert02Icon}
              className="text-destructive size-4 shrink-0"
            />
          ) : null}
          <span>
            <span className="font-semibold tabular-nums">{count}</span>{" "}
            unsaved {count === 1 ? "change" : "changes"}
            {hasErrors ? " — fix the errors above first" : ""}
          </span>
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
          >
            Discard
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || hasErrors}>
            {saving ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                className="size-4 animate-spin"
              />
            ) : (
              <HugeiconsIcon icon={FloppyDiskIcon} className="size-4" />
            )}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── A plain section wrapper, for the cards that own their own behaviour ─────

export function PlainSection({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{blurb}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
