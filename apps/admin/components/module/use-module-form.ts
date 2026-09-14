"use client";

import { useCallback, useState } from "react";

import { FORM_PRESENTATION, type FormPresentation } from "@/lib/form-presentation";

export type FormMode = "view" | "add" | "update";

interface UseModuleFormOptions {
  /** Overrides the module-wide `FORM_PRESENTATION` for this module. */
  presentation?: FormPresentation;
}

/**
 * Owns the create/edit/view state a module's list page needs, regardless of
 * which `FormPresentation` it renders with, and derives whether the table
 * should stay mounted — `"sheet"` floats over it, `"full"` replaces it.
 *
 * Ported from `smart-stack-dashboard`'s `use-module-form.ts`.
 */
export function useModuleForm<T>(options?: UseModuleFormOptions) {
  const presentation = options?.presentation ?? FORM_PRESENTATION;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>("add");
  const [selected, setSelected] = useState<T | undefined>();

  const handleNew = useCallback(() => {
    setSelected(undefined);
    setMode("add");
    setOpen(true);
  }, []);

  const handleView = useCallback((record: T) => {
    setSelected(record);
    setMode("view");
    setOpen(true);
  }, []);

  const handleEdit = useCallback((record: T) => {
    setSelected(record);
    setMode("update");
    setOpen(true);
  }, []);

  // The sheet floats over the table; the full-page shell replaces it.
  const showTable = presentation === "sheet" || !open;

  return {
    presentation,
    open,
    setOpen,
    mode,
    selected,
    handleNew,
    handleView,
    handleEdit,
    showTable,
  };
}
