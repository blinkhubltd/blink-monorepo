"use client";

import type React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DeliveryTruck01Icon,
  FlashIcon,
  ShieldUserIcon,
} from "@hugeicons/core-free-icons";

/**
 * The split panel both auth screens sit in.
 *
 * Left is brand and context, right is the form. The left panel is hidden below
 * `lg` rather than stacked: on a phone it would push the form below the fold,
 * and a sign-in form you have to scroll to is the one thing this screen must not
 * do.
 *
 * The panel is ink with a brand wash rather than the old
 * `bg-gradient-to-br from-gray-50 to-gray-100`, which was hardcoded grey that
 * bypassed the theme entirely and stayed light in dark mode.
 */

const POINTS = [
  {
    icon: FlashIcon,
    title: "Live operations",
    body: "Orders, pickers and riders as they move, not as of last refresh.",
  },
  {
    icon: DeliveryTruck01Icon,
    title: "Every hub in one place",
    body: "Trading, fulfilment and stock across all vendors.",
  },
  {
    icon: ShieldUserIcon,
    title: "Scoped by role",
    body: "Vendor managers see their own hubs, and only their own.",
  },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel */}
      <div className="bg-sidebar text-sidebar-foreground relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
        {/*
          Two soft brand washes rather than a flat block. Pointer-events off so
          they cannot swallow a click aimed at anything beneath.
        */}
        <div
          aria-hidden
          className="bg-primary/20 pointer-events-none absolute -top-32 -left-24 size-80 rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="bg-primary/10 pointer-events-none absolute -right-20 bottom-0 size-72 rounded-full blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl font-bold">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Blink Hub
          </span>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <h1 className="max-w-md text-3xl font-bold tracking-tight">
              Run the whole operation from one screen.
            </h1>
            <p className="text-sidebar-foreground/70 max-w-md text-sm">
              Sales, fulfilment and stock across every hub, updated as it
              happens.
            </p>
          </div>

          <ul className="space-y-5">
            {POINTS.map((point) => (
              <li key={point.title} className="flex gap-3.5">
                <span className="bg-primary/15 text-primary mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg">
                  <HugeiconsIcon icon={point.icon} className="size-4.5" />
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold">
                    {point.title}
                  </span>
                  <span className="text-sidebar-foreground/60 block max-w-xs text-sm">
                    {point.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sidebar-foreground/40 relative text-xs">
          Blink Hub Ltd · Nairobi
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        {/* The wordmark, for the small screens where the brand panel is hidden. */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl font-bold">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Blink Hub
          </span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
