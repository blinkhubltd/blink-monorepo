"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferVerticalIcon as ChevronsUpDown,
  Search01Icon as Search,
  Tick02Icon as Check,
} from "@hugeicons/core-free-icons";
import * as React from "react";
import { cn } from "@/lib/utils";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /**
   * Called as the search box is typed in.
   *
   * Supplying it means the CALLER is doing the searching — against a server,
   * typically — so this component stops filtering `options` itself and
   * renders whatever it is given. Without it the behaviour is unchanged:
   * local filtering over a fixed list.
   *
   * The distinction matters for a list that cannot be fully downloaded. A
   * locally-filtered picker silently searches only the rows it happens to
   * hold, which looks identical to "no such customer".
   */
  onSearchChange?: (search: string) => void;
  /** Shown in place of the empty state while a server search is in flight. */
  loading?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyText = "No option found.",
  className,
  disabled = false,
  onSearchChange,
  loading = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");

  const selectedOption = options.find((option) => option.value === value);

  const filteredOptions = React.useMemo(() => {
    // The caller owns the search when `onSearchChange` is given; filtering
    // again here would hide server results that do not literally contain
    // the typed string (a phone-number match on a name search, say).
    if (onSearchChange || !searchValue) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchValue.toLowerCase())
    );
  }, [options, searchValue, onSearchChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            !selectedOption && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          {selectedOption ? selectedOption.label : placeholder}
          <HugeiconsIcon icon={ChevronsUpDown} className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={(next: string) => {
              setSearchValue(next);
              onSearchChange?.(next);
            }}
          />
          <CommandList>
            {loading ? (
              <CommandEmpty>Searching…</CommandEmpty>
            ) : filteredOptions.length === 0 ? (
              <CommandEmpty>{emptyText}</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={(currentValue: string) => {
                      const newValue =
                        currentValue === value ? "" : currentValue;
                      onValueChange?.(newValue);
                      setOpen(false);
                      setSearchValue("");
                      onSearchChange?.("");
                    }}
                  >
                    <HugeiconsIcon icon={Check}
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )} />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
