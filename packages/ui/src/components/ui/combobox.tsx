"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
} from "@hugeicons/core-free-icons";
import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@repo/ui/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  value?: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  // forwarded from FormControl (Slot)
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      value,
      onValueChange,
      options,
      placeholder = "Select…",
      searchPlaceholder = "Search…",
      emptyText = "No results found.",
      disabled,
      className,
      ...ariaProps
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const selectedLabel = React.useMemo(
      () => options.find((o) => o.value === value)?.label,
      [options, value],
    );

    const filtered = React.useMemo(
      () =>
        search.trim()
          ? options.filter((o) =>
              o.label.toLowerCase().includes(search.toLowerCase()),
            )
          : options,
      [options, search],
    );

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={ref}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            disabled={disabled}
            className={cn(
              "border-input shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border bg-transparent px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
              !selectedLabel && "text-muted-foreground",
              className,
            )}
            {...ariaProps}
          >
            <span className="truncate">{selectedLabel ?? placeholder}</span>
            <HugeiconsIcon icon={ChevronDownIcon} className="ml-2 size-4 shrink-0 opacity-50" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[var(--radix-popover-trigger-width)] rounded-md border shadow-md outline-none"
            align="start"
            sideOffset={4}
          >
            {/* Search */}
            <div className="flex items-center border-b px-3">
              <HugeiconsIcon icon={SearchIcon} className="text-muted-foreground mr-2 size-3.5 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="placeholder:text-muted-foreground flex h-10 w-full bg-transparent py-3 text-sm outline-none"
                autoFocus
              />
            </div>
            {/* Options */}
            <div
              role="listbox"
              className="max-h-[220px] overflow-y-auto overflow-x-hidden p-1"
            >
              {filtered.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  {emptyText}
                </p>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => {
                      onValueChange(option.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-left text-sm outline-none"
                  >
                    <span className="truncate">{option.label}</span>
                    {option.value === value && (
                      <HugeiconsIcon icon={CheckIcon} className="absolute right-2 size-4 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  },
);
Combobox.displayName = "Combobox";

export { Combobox };
