"use client";

import { Fragment } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Moon02Icon as Moon,
  Sun01Icon as Sun,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useTheme } from "next-themes";

import { Button } from "@repo/ui/components/ui/button";
import { Separator } from "@repo/ui/components/ui/separator";
import { SidebarTrigger } from "@repo/ui/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/ui/breadcrumb";
import { CommandPalette } from "@/components/command-palette";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The dashboard header: rail trigger, breadcrumb, search, theme, account.
 *
 * Sticky rather than scrolling away — on a data table the header is how you get
 * anywhere else, and losing it means scrolling to the top to navigate.
 */
export function Header({ breadcrumbs }: { breadcrumbs: Crumb[] }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />

      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          {breadcrumbs.map((crumb, i) => {
            const last = i === breadcrumbs.length - 1;
            return (
              // BreadcrumbItem and BreadcrumbSeparator each render an <li>, so
              // the separator must be a SIBLING of the item, not nested inside
              // it — an <li> nested in another <li> is invalid HTML, which is
              // what React was flagging as a hydration error.
              <Fragment key={`${crumb.label}-${i}`}>
                <BreadcrumbItem>
                  {last || !crumb.href ? (
                    <BreadcrumbPage className="truncate">
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last ? <BreadcrumbSeparator /> : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1">
        <CommandPalette />

        <Button
          variant="ghost"
          size="icon"
          aria-label={
            resolvedTheme === "dark" ? "Switch to light" : "Switch to dark"
          }
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {/* Both rendered, one hidden per scheme — swapping the element on
              `resolvedTheme` flickers on first paint before it resolves. */}
          <HugeiconsIcon icon={Sun} className="size-4 dark:hidden" />
          <HugeiconsIcon icon={Moon} className="hidden size-4 dark:block" />
        </Button>

        <div className="ml-1">
          <UserButton
            appearance={{ elements: { avatarBox: "size-7" } }}
            afterSignOutUrl="/sign-in"
          />
        </div>
      </div>
    </header>
  );
}
