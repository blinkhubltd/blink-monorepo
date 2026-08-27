"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { allSettingKeys, settingFieldsByKey } from "./fields";

/**
 * One draft over every platform setting, with per-field validation and a single
 * save.
 *
 * ── Why the saved value is the baseline, not a snapshot ───────────────────
 *
 * `dirtyKeys` compares each field against the CURRENT server value, not against
 * whatever it was when the page loaded. Convex pushes updates, so if someone
 * else changes a setting while this page is open, an untouched field simply
 * follows — and a field the user HAS edited stays dirty and keeps their text.
 * Snapshotting on mount would instead show every externally-changed field as an
 * edit the user never made.
 *
 * ── Why edits are keyed sparsely ─────────────────────────────────────────
 *
 * `edits` holds only fields the user actually typed in. An untouched field has
 * no entry, so it can never be written back. That matters because saving is one
 * pass over the dirty set: a dense map seeded from the server would make every
 * field look writable and risk re-writing a stale value read before someone
 * else's change arrived.
 */
export function useSettingsDraft() {
  const settings = useQuery(api.data.platform_settings.getAll);
  const upsert = useMutation(api.data.platform_settings.upsert);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /** Stored value per key, as the server currently has it. */
  const stored = useMemo(() => {
    const map: Record<string, string> = {};
    for (const key of allSettingKeys) {
      const row = settings?.find(
        (s: { key: string; value: string }) => s.key === key,
      );
      map[key] = row?.value ?? "";
    }
    return map;
  }, [settings]);

  /** What each field displays: the edit if there is one, else the saved value. */
  const shown = useMemo(() => {
    const map: Record<string, string> = {};
    for (const key of allSettingKeys) {
      const field = settingFieldsByKey[key]!;
      const savedRaw = stored[key];
      map[key] = edits[key] ?? (savedRaw ? field.fromStored(savedRaw) : "");
    }
    return map;
  }, [edits, stored]);

  const errors = useMemo(() => {
    const map: Record<string, string> = {};
    // Only validate what has been touched — an empty field the user has never
    // visited is not an error they made, and flagging it on load makes the page
    // look broken on a deployment where a setting has not been seeded.
    for (const key of Object.keys(edits)) {
      const problem = settingFieldsByKey[key]?.validate?.(shown[key] ?? "");
      if (problem) map[key] = problem;
    }
    return map;
  }, [edits, shown]);

  const dirtyKeys = useMemo(() => {
    return Object.keys(edits).filter((key) => {
      const field = settingFieldsByKey[key];
      if (!field) return false;
      const savedRaw = stored[key];
      const saved = savedRaw ? field.fromStored(savedRaw) : "";
      // Trimmed, so trailing whitespace alone is not an edit.
      return (edits[key] ?? "").trim() !== saved.trim();
    });
  }, [edits, stored]);

  const setField = useCallback((key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }, []);

  const discard = useCallback(() => setEdits({}), []);

  const save = useCallback(async () => {
    const invalid = dirtyKeys.filter((key) =>
      settingFieldsByKey[key]?.validate?.(shown[key] ?? ""),
    );
    if (invalid.length > 0) {
      toast.error(
        `Fix ${invalid.length} invalid ${invalid.length === 1 ? "field" : "fields"} first.`,
      );
      return;
    }
    if (dirtyKeys.length === 0) return;

    setSaving(true);

    // Sequential, stopping at the first failure. Convex mutations are
    // individually atomic but there is no transaction across them, so a
    // parallel burst that half-fails leaves the page unable to say which
    // settings actually changed. One at a time means the ones reported as saved
    // are exactly the ones written.
    const written: string[] = [];
    try {
      for (const key of dirtyKeys) {
        const field = settingFieldsByKey[key]!;
        await upsert({
          key,
          value: field.toStored(shown[key] ?? ""),
          description: field.description,
        });
        written.push(key);
        // Cleared as we go, so a mid-way failure leaves only the UNSAVED fields
        // dirty rather than all of them.
        setEdits((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
      toast.success(
        written.length === 1
          ? `${settingFieldsByKey[written[0]!]?.label} updated`
          : `${written.length} settings updated`,
      );
    } catch (err) {
      toast.error(
        getConvexErrorMessage(
          err,
          written.length > 0
            ? `Saved ${written.length}, then failed. The rest are still unsaved.`
            : "Could not save.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }, [dirtyKeys, shown, upsert]);

  return {
    loading: settings === undefined,
    settings,
    shown,
    errors,
    dirtyKeys,
    hasErrors: Object.keys(errors).length > 0,
    saving,
    setField,
    discard,
    save,
  };
}
