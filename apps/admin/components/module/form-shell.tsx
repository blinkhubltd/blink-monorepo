"use client";

import { useEffect, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeftIcon } from "@hugeicons/core-free-icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@repo/ui/components/ui/sheet";
import { Button } from "@repo/ui/components/ui/button";

import { FORM_PRESENTATION, type FormPresentation } from "@/lib/form-presentation";

interface FormShellProps {
  /** Defaults to `FORM_PRESENTATION` from `lib/form-presentation.ts`. */
  presentation?: FormPresentation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Chrome around a form/detail view — a right-side sheet or a full page in
 * place of the table, chosen once per module via `presentation` rather than
 * by the viewer.
 *
 * Deliberately just chrome: `children` is the *entire* existing form
 * component (`CategoryForm`, `ProductForm`, ...), own `<form>` tag, own
 * submit/cancel buttons and all — this mirrors how the same components sit
 * inside a `Dialog` today (a `DialogContent` with a width/scroll className
 * around unchanged children), so porting a resource onto `FormShell` is a
 * swap of the wrapper, not a rewrite of the form. (The reference this is
 * ported from, `smart-stack-dashboard`'s `FormShell`, assumes react-hook-form
 * components with no owned `<form>`/buttons of their own, and owns the
 * submit button itself — that shape doesn't fit blink-admin's existing
 * self-contained forms, so this version doesn't try to force it.)
 */
export function FormShell({
  presentation = FORM_PRESENTATION,
  open,
  onOpenChange,
  title,
  description,
  children,
}: FormShellProps) {
  const isFull = presentation === "full";

  // The sheet gets this from Radix; the full-page shell has to bind it itself.
  useEffect(() => {
    if (!isFull || !open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isFull, open, onOpenChange]);

  if (isFull) {
    if (!open) return null;

    return (
      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-4 border-b px-6 py-4 md:px-8">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onOpenChange(false)}
          >
            <HugeiconsIcon icon={ArrowLeftIcon} className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Button>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-foreground font-semibold">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </div>
      </section>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
