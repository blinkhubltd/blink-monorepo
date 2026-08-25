"use client";

import type React from "react";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@repo/ui/components/ui/sidebar";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import DashboardDataProvider from "@/providers/DashboardDataProvider";
import AuthorizationWrapper from "@/components/auth/AuthorizationWrapper";
import { AppSidebar } from "@/components/app-sidebar";
import { Header } from "@/components/header";
import { LowStockBanner } from "@/components/dashboard/LowStockBanner";
import { labelForPath } from "@/lib/navigation";

/**
 * The dashboard shell, following sydia's arrangement:
 * SidebarProvider > AppSidebar + SidebarInset(Header, children).
 *
 * Replaces a hand-rolled sidebar and header that tracked their own mobile-menu
 * state and painted `bg-gradient-to-br from-gray-50 to-gray-100` — hardcoded
 * greys that bypassed the theme, so the dashboard could neither carry the brand
 * nor respond to dark mode. The shadcn sidebar primitive brings the collapse
 * behaviour, the mobile sheet, the keyboard shortcut and cookie-persisted state
 * that the old one only approximated.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const label = labelForPath(pathname);

  return (
    <AuthorizationWrapper>
      <DashboardDataProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="flex min-h-svh min-w-0 flex-col">
            <Header
              breadcrumbs={
                // The overview needs no trail; every other page reads
                // "Home / <page>", resolved from the nav config so the crumb and
                // the rail cannot disagree.
                pathname === "/"
                  ? [{ label: "Overview" }]
                  : [{ label: "Home", href: "/" }, { label }]
              }
            />
            <LowStockBanner />
            <main className="min-w-0 flex-1 p-4 md:p-6">
              {/*
                Suspense sits inside the shell, not around it. The previous
                layout wrapped the whole thing in a spinner, so navigating threw
                away the sidebar and header and the screen flashed empty; now
                only the content area suspends.
              */}
              <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </DashboardDataProvider>
    </AuthorizationWrapper>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
