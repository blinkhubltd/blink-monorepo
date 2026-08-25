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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Label } from "@repo/ui/components/ui/label";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterConfig {
  key: string;
  label: string;
  value: string | string[];
  options: FilterOption[];
  onChange: (value: string | string[]) => void;
  type?: "select" | "multiselect" | "popover";
}

export interface AdvancedTableFiltersProps<T> {
  table: Table<T>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  filters?: FilterConfig[];
  filteredCount: number;
  totalCount: number;
  searchPlaceholder?: string;
  showColumnVisibility?: boolean;
  customFilters?: React.ReactNode;
  bulkActions?: React.ReactNode;
}

export function AdvancedTableFilters<T>({
  table,
  globalFilter,
  onGlobalFilterChange,
  filters = [],
  filteredCount,
  totalCount,
  searchPlaceholder = "Search...",
  showColumnVisibility = true,
  customFilters,
  bulkActions,
}: AdvancedTableFiltersProps<T>) {
  const hasActiveFilters = globalFilter || filters.some(filter => 
    Array.isArray(filter.value) 
      ? filter.value.length > 0 && filter.value.some(v => v !== "all")
      : filter.value !== "all"
  );

  const renderFilter = (filter: FilterConfig) => {
    switch (filter.type) {
      case "multiselect":
      case "popover":
        const selectedValues = Array.isArray(filter.value) ? filter.value : [];
        return (
          <Popover key={filter.key}>
            <PopoverTrigger asChild>
              <Button variant="outline">
                {filter.label}
                {selectedValues.length > 0 && (
                  <span className="bg-background text-muted-foreground/70 -me-1 inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium ml-2">
                    {selectedValues.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-36 p-3" align="start">
              <div className="space-y-3">
                <div className="text-muted-foreground text-xs font-medium">
                  {filter.label}
                </div>
                <div className="space-y-2">
                  {filter.options.map((option) => (
                    <div key={option.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`${filter.key}-${option.value}`}
                        checked={selectedValues.includes(option.value)}
                        onCheckedChange={(checked) => {
                          const newValues = checked
                            ? [...selectedValues, option.value]
                            : selectedValues.filter(v => v !== option.value);
                          filter.onChange(newValues);
                        }}
                      />
                      <Label
                        htmlFor={`${filter.key}-${option.value}`}
                        className="flex grow justify-between gap-2 font-normal"
                      >
                        {option.label}
                        {option.count !== undefined && (
                          <span className="text-muted-foreground text-xs">
                            {option.count}
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        );
      
      default:
        return (
          <Select
            key={filter.key}
            value={filter.value as string}
            onValueChange={(value) => filter.onChange(value)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {filter.label}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  {option.count !== undefined && ` (${option.count})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center space-x-2 flex-wrap">
          {/* Search Input */}
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
          
          {/* Standard Filters */}
          {filters.map(renderFilter)}
          
          {/* Custom Filters */}
          {customFilters}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Bulk Actions */}
          {bulkActions}
          
          {/* Column Visibility */}
          {showColumnVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="bg-transparent">
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
