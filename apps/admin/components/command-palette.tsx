"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon as Search } from "@hugeicons/core-free-icons";
import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { ADMIN_ONLY_LINKS, navigation } from "@/lib/navigation";

/**
 * ⌘K navigation.
 *
 * The dashboard has 32 pages across seven groups; past a certain size a rail is
 * a place to browse and a palette is how you actually get somewhere. It shares
 * lib/navigation.ts with the sidebar, so it can never offer a page the rail
 * doesn't know about — or one the viewer can't open.
 *
 * Filtered by the same permission check as the rail. A palette that lists pages
 * you'll be bounced off is worse than one that omits them.
 */
export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { isLoading, isAdminUser, can } = useCurrentUserPermissions();

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const groups = React.useMemo(() => {
    if (isLoading) return [];
    const allowed = (resource?: string) => {
      if (isAdminUser) return true;
      if (!resource) return true;
      return can(`${resource}:READ`);
    };

    const out = navigation
      .map((group) => ({
        title: group.title,
        items: group.links
          .filter((l) => allowed(l.resource))
          .flatMap((l) => [
            { title: l.title, url: l.url },
            // Drill-downs are prefixed with their parent, so "Insights ·
            // Products" is distinguishable from the Products page itself.
            ...(l.children ?? [])
              .filter((c) => allowed(c.resource))
              .map((c) => ({
                title: `${l.title} · ${c.title}`,
                url: c.url,
              })),
          ]),
      }))
      .filter((g) => g.items.length > 0);

    if (isAdminUser) {
      out.push({
        title: "System",
        items: ADMIN_ONLY_LINKS.map((l) => ({ title: l.title, url: l.url })),
      });
    }
    return out;
  }, [isLoading, isAdminUser, can]);

  const go = (url: string) => {
    setOpen(false);
    router.push(url);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground h-8 gap-2 px-2 font-normal sm:pr-1"
      >
        <HugeiconsIcon icon={Search} className="size-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="bg-muted hidden items-center gap-0.5 rounded border px-1.5 font-mono text-[10px] font-medium sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/*
        Composed from Dialog + Command rather than a CommandDialog: this app's
        command primitive is hand-rolled, not cmdk-based, and does not ship one.
        Wrapping here beats altering a primitive that other pages already use.
      */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Search pages</DialogTitle>
          <Command>
        <CommandInput placeholder="Go to a page…" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group.title}>
              {/* This command primitive is a plain div with no heading prop, so
                  the group label is rendered here. */}
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
                {group.title}
              </div>
              {group.items.map((item) => (
                <CommandItem
                  key={item.url}
                  // Value carries the group name too, so typing "money" finds
                  // Payments even though the word is not in its title.
                  value={`${group.title} ${item.title}`}
                  onSelect={() => go(item.url)}
                >
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
