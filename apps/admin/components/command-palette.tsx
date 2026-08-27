"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon as Search } from "@hugeicons/core-free-icons";

import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { cn } from "@/lib/utils";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { ADMIN_ONLY_LINKS, navigation } from "@/lib/navigation";
import { searchEntries, type Entry } from "@/lib/palette-search";

/**
 * Search-and-go across the dashboard's pages.
 *
 * ── Why this was rewritten rather than patched ────────────────────────────
 *
 * The palette did not search. `@repo/ui`'s command primitive is a set of styled
 * `<div>`s — `CommandInput` only forwards `onValueChange`, `CommandItem` only
 * fires on click — and this component passed no `onValueChange` and never
 * filtered anything. Consequences, all visible on screen:
 *
 *   - Typing did nothing. Every page stayed listed regardless of the query.
 *   - `CommandEmpty` is an unconditional `<div>`, so "Nothing matches that."
 *     was permanently rendered underneath a full list of matches.
 *   - No arrow-key navigation and no Enter. The only way to pick a page was to
 *     click it, which makes the keyboard shortcut that opens it pointless.
 *
 * Filtering, selection and keyboard handling therefore live here, over a flat
 * list, rather than being coaxed out of a primitive that has no state. The
 * primitive is left alone because other pages already use it for its styling.
 *
 * ── Shortcuts ────────────────────────────────────────────────────────────
 *
 * `/` and Ctrl/Cmd+K, both.
 *
 * `/` is the one to remember: single key, no modifier, and the convention on
 * GitHub, Linear, Slack and YouTube. It is ignored while focus is in a text
 * field, or a `/` typed into any input on the dashboard would swallow itself and
 * open this instead.
 *
 * Ctrl+K stays because it is the cross-app standard for exactly this control and
 * costs nothing to keep.
 *
 * WIN+S IS NOT AVAILABLE TO A WEB PAGE. Windows reserves Win+key combinations
 * at the shell level — Win+S opens Windows Search — and the keydown never
 * reaches the browser, so no `preventDefault` can claim it. The same is true of
 * Win+R, Win+E and Win+L. On macOS the equivalent, Cmd+S, is Save. This is a
 * platform constraint rather than an implementation gap, which is why the
 * shortcut is `/` instead.
 */

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const router = useRouter();
  const { isLoading, isAdminUser, can } = useCurrentUserPermissions();
  const listRef = React.useRef<HTMLDivElement>(null);

  // Rendered on the server too, so the hint cannot be read off the platform
  // until mount — showing "⌘K" to a Windows user was the previous behaviour.
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  const entries = React.useMemo<Entry[]>(() => {
    if (isLoading) return [];
    const allowed = (resource?: string) => {
      if (isAdminUser) return true;
      if (!resource) return true;
      return can(`${resource}:READ`);
    };

    const out: Entry[] = [];
    for (const group of navigation) {
      for (const link of group.links) {
        if (!allowed(link.resource)) continue;
        out.push({ title: link.title, group: group.title, url: link.url });
        for (const child of link.children ?? []) {
          if (!allowed(child.resource)) continue;
          // Prefixed with the parent, so "Insights · Products" is
          // distinguishable from the Products page itself.
          out.push({
            title: `${link.title} · ${child.title}`,
            group: group.title,
            url: child.url,
          });
        }
      }
    }
    if (isAdminUser) {
      for (const link of ADMIN_ONLY_LINKS) {
        out.push({ title: link.title, group: "System", url: link.url });
      }
    }
    return out;
  }, [isLoading, isAdminUser, can]);

  const results = React.useMemo(
    () => searchEntries(entries, query),
    [entries, query],
  );

  // Opening is a state change, so the shortcut handler stays trivial.
  const openPalette = React.useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Ctrl/Cmd+K works even while typing — it carries a modifier, so it
      // cannot be mistaken for input.
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((isOpen) => {
          if (isOpen) return false;
          setQuery("");
          setActive(0);
          return true;
        });
        return;
      }

      // A bare "/" must never steal a keystroke meant for a field, and must not
      // fire when a modifier is held (Ctrl+/ and Cmd+/ are other things).
      if (
        event.key === "/" &&
        !typing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        openPalette();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openPalette]);

  // Clamp the cursor when the result set shrinks under it, otherwise Enter
  // navigates to whatever used to be at that index — or to nothing.
  React.useEffect(() => {
    setActive((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)));
  }, [results.length]);

  const go = React.useCallback(
    (url: string) => {
      setOpen(false);
      router.push(url);
    },
    [router],
  );

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      // Wraps, so holding ArrowDown cycles rather than sticking at the bottom.
      setActive((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[active];
      if (chosen) go(chosen.url);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, results.length - 1));
    }
    // Escape is left to the Dialog, which already closes on it.
  }

  // Keep the highlighted row in view when the keyboard moves past the fold.
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-index="${active}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={openPalette}
        className="text-muted-foreground h-8 gap-2 px-2 font-normal sm:pr-1"
      >
        <HugeiconsIcon icon={Search} className="size-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="bg-muted hidden items-center rounded border px-1.5 font-mono text-[10px] font-medium sm:flex">
          /
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="overflow-hidden p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search pages</DialogTitle>
          <DialogDescription className="sr-only">
            Type to filter, arrow keys to move, Enter to open.
          </DialogDescription>

          <div className="flex items-center gap-2 border-b px-3">
            <HugeiconsIcon
              icon={Search}
              className="text-muted-foreground size-4 shrink-0"
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Any edit resets the cursor to the best match, which is what
                // Enter should take after refining a query.
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Go to a page…"
              className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
              // The listbox pattern: the input owns focus, the list is its
              // controlled collection.
              role="combobox"
              aria-expanded
              aria-controls="palette-results"
              aria-activedescendant={
                results[active] ? `palette-option-${active}` : undefined
              }
            />
          </div>

          <div
            ref={listRef}
            id="palette-results"
            role="listbox"
            aria-label="Pages"
            className="max-h-[320px] overflow-y-auto p-1"
          >
            {results.length === 0 ? (
              // Conditional, unlike the primitive's CommandEmpty, which rendered
              // permanently underneath the results.
              <p className="text-muted-foreground py-8 text-center text-sm">
                No page matches “{query}”.
              </p>
            ) : (
              results.map((entry, index) => (
                <div
                  key={entry.url}
                  id={`palette-option-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => go(entry.url)}
                  // Follows the pointer, so hovering and then pressing Enter
                  // opens what is under the cursor rather than a stale row.
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm",
                    index === active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground",
                  )}
                >
                  <span className="truncate">{entry.title}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {entry.group}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="text-muted-foreground flex items-center justify-between gap-4 border-t px-3 py-2 text-[11px]">
            <span className="flex items-center gap-3">
              <span>
                <kbd className="bg-muted rounded border px-1 font-mono">↑↓</kbd>{" "}
                move
              </span>
              <span>
                <kbd className="bg-muted rounded border px-1 font-mono">↵</kbd>{" "}
                open
              </span>
              <span>
                <kbd className="bg-muted rounded border px-1 font-mono">esc</kbd>{" "}
                close
              </span>
            </span>
            <span>
              {results.length} {results.length === 1 ? "page" : "pages"}
              {" · "}
              <kbd className="bg-muted rounded border px-1 font-mono">/</kbd>
              {" or "}
              <kbd className="bg-muted rounded border px-1 font-mono">
                {isMac ? "⌘" : "Ctrl"}K
              </kbd>
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
