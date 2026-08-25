"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon as ChevronRight } from "@hugeicons/core-free-icons";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@repo/ui/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  ADMIN_ONLY_LINKS,
  navigation,
  OVERVIEW_LINK,
  type NavLink,
} from "@/lib/navigation";

/**
 * The dashboard rail.
 *
 * Driven entirely by lib/navigation.ts, so a route cannot exist without an entry
 * — which is how `/staff` ended up with a page and no way in.
 *
 * Permission behaviour is carried over from the previous sidebar unchanged: an
 * administrator sees everything, anyone else sees links they hold READ on. That
 * `isAdminUser` check is known to be broad — it treats any non-system role as an
 * administrator and ignores `role.permissions` entirely — but tightening it is a
 * data migration with a lockout risk, not a port detail. Deliberately not
 * changed here.
 */
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { isLoading, permissions, isAdminUser, can } =
    useCurrentUserPermissions();

  const visible = React.useCallback(
    (link: Pick<NavLink, "resource">) => {
      if (isLoading) return false;
      if (isAdminUser) return true;
      if (!link.resource) return true;
      return can(`${link.resource}:READ`);
    },
    [isLoading, isAdminUser, can],
  );

  /**
   * Whether a link owns the current path.
   *
   * A prefix match alone would light up "Orders" while sitting on
   * `/orders/insights`, so the longest matching url wins — the same rule the
   * breadcrumb uses.
   */
  const isActive = React.useCallback(
    (url: string) => {
      const base = url.split("?")[0]!;
      if (pathname === base) return true;
      if (!pathname.startsWith(base === "/" ? "/__never" : base + "/")) {
        return false;
      }
      const allUrls = [
        OVERVIEW_LINK.url,
        ...navigation.flatMap((g) =>
          g.links.flatMap((l) => [
            l.url.split("?")[0]!,
            ...(l.children ?? []).map((c) => c.url),
          ]),
        ),
        ...ADMIN_ONLY_LINKS.map((l) => l.url),
      ];
      const longest = allUrls
        .filter((u) => pathname === u || pathname.startsWith(u + "/"))
        .sort((a, b) => b.length - a.length)[0];
      return longest === base;
    },
    [pathname],
  );

  return (
    <Sidebar {...props}>
      <SidebarHeader className="px-3 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          {/*
            The wordmark is an image on marketing surfaces, but the rail is ink
            and narrow — a yellow mark plus a text label reads at every width and
            survives the collapsed state, which a wide logo does not.
          */}
          <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg text-sm font-black">
            B
          </span>
          <span className="grid text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sidebar-accent-foreground text-sm font-bold">
              Blink
            </span>
            <span className="text-sidebar-foreground/60 text-[11px]">
              Operations
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/"}
                  tooltip={OVERVIEW_LINK.title}
                >
                  <Link href={OVERVIEW_LINK.url}>
                    <HugeiconsIcon icon={OVERVIEW_LINK.icon} />
                    <span>{OVERVIEW_LINK.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isLoading ? (
          // A skeleton rather than an empty rail: the permission chain is four
          // sequential queries deep, so the gap is long enough to look broken.
          <SidebarGroup>
            <SidebarGroupContent className="space-y-2 px-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="bg-sidebar-accent h-8 w-full" />
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          navigation.map((group) => {
            const links = group.links.filter(visible);
            if (links.length === 0) return null;

            return (
              <SidebarGroup key={group.title}>
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] font-semibold tracking-wider">
                  {group.title.toUpperCase()}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {links.map((link) => {
                      const children = (link.children ?? []).filter(visible);
                      const active = isActive(link.url);
                      const childActive = children.some((c) =>
                        isActive(c.url),
                      );

                      if (children.length === 0) {
                        return (
                          <SidebarMenuItem key={link.url}>
                            <SidebarMenuButton
                              asChild
                              isActive={active}
                              tooltip={link.title}
                            >
                              <Link href={link.url}>
                                <HugeiconsIcon icon={link.icon} />
                                <span>{link.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      }

                      return (
                        <Collapsible
                          key={link.url}
                          asChild
                          // Open when the current page is inside it, so a
                          // drill-down never hides where you are.
                          defaultOpen={active || childActive}
                          className="group/collapsible"
                        >
                          <SidebarMenuItem>
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton
                                isActive={active}
                                tooltip={link.title}
                              >
                                <HugeiconsIcon icon={link.icon} />
                                <span>{link.title}</span>
                                <HugeiconsIcon icon={ChevronRight} className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                              </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub>
                                {children.map((child) => (
                                  <SidebarMenuSubItem key={child.url}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={isActive(child.url)}
                                    >
                                      <Link href={child.url}>
                                        <span>{child.title}</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                ))}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </SidebarMenuItem>
                        </Collapsible>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })
        )}
      </SidebarContent>

      {/* Platform settings is gated on being an administrator, not on a module
          permission — there is no `settings` resource in the vocabulary. */}
      {!isLoading && isAdminUser ? (
        <SidebarFooter>
          <SidebarMenu>
            {ADMIN_ONLY_LINKS.map((link) => (
              <SidebarMenuItem key={link.url}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(link.url)}
                  tooltip={link.title}
                >
                  <Link href={link.url}>
                    <HugeiconsIcon icon={link.icon} />
                    <span>{link.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarFooter>
      ) : null}

      <SidebarRail />
    </Sidebar>
  );
}
