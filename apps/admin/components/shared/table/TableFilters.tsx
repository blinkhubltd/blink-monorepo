"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon as ChevronDown,
  Search01Icon as Search,
} from "@hugeicons/core-free-icons";
import React from "react";
import { Table } from "@tanstack/react-table";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

export interface FilterOption {
  value: string;
  label: string;
}

export interface TableFiltersProps<T> {
  table: Table<T>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  filters?: Array<{
    key: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
  }>;
  filteredCount: number;
  totalCount: number;
  searchPlaceholder?: string;
  showColumnVisibility?: boolean;
}

export function TableFilters<T>({
  table,
  globalFilter,
  onGlobalFilterChange,
  filters = [],
  filteredCount,
  totalCount,
  searchPlaceholder = "Search...",
  showColumnVisibility = true,
}: TableFiltersProps<T>) {
  const hasActiveFilters = globalFilter || filters.some(filter => filter.value !== "all");

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative">
            <HugeiconsIcon icon={Search}
              className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true" />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter}
              onChange={(event) => onGlobalFilterChange(event.target.value)}
              className="pl-8 w-[250px]"
            />
          </div>
          
          {filters.map((filter) => (
            <Select key={filter.key} value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {filter.label}</SelectItem>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
        
        {showColumnVisibility && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto bg-transparent">
                Columns <HugeiconsIcon icon={ChevronDown} className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id.replace(/_/g, " ")}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Search Results Info */}
      {hasActiveFilters && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredCount} of {totalCount} results
          {globalFilter && ` matching "${globalFilter}"`}
        </div>
      )}
    </div>
  );
}
