"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon as ChevronLeft,
  ArrowLeftDoubleIcon as ChevronFirstIcon,
  ArrowRight01Icon as ChevronRight,
  ArrowRightDoubleIcon as ChevronLastIcon,
} from "@hugeicons/core-free-icons";
import React from "react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Label } from "@repo/ui/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@repo/ui/components/ui/pagination";

export interface PaginationInfo {
  hasNext: boolean;
  hasPrevious?: boolean;
  totalPages: number;
  currentPage?: number;
  pageSize?: number;
  total: number;
}

export interface TablePaginationProps {
  pagination: PaginationInfo;
  onPageChange: (
    page: number,
    direction: "first" | "prev" | "next" | "last"
  ) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  id?: string;
  isLoading?: boolean;
}

export function TablePagination({
  pagination,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50, 100],
  id = "table-pagination",
  isLoading = false,
}: TablePaginationProps) {
  const {
    hasNext,
    hasPrevious,
    totalPages,
    currentPage = 1,
    pageSize = 10,
    total,
  } = pagination;

  const startItem = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 px-2 py-4">
      <div className="text-muted-foreground flex-1 text-sm whitespace-nowrap">
        <p
          className="text-muted-foreground text-sm whitespace-nowrap"
          aria-live="polite"
        >
          <span className="text-foreground font-medium">{startItem}</span>-
          <span className="text-foreground font-medium">{endItem}</span> of{" "}
          <span className="text-foreground font-medium">{total}</span>
        </p>
      </div>

      <div className="flex items-center gap-6">
        {onPageSizeChange && (
          <div className="flex items-center gap-3">
            <Label htmlFor={id} className="whitespace-nowrap">
              Rows per page
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger id={id} className="h-8 w-fit whitespace-nowrap">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => onPageChange(1, "first")}
                disabled={isLoading || !hasPrevious}
                aria-label="Go to first page"
              >
                <HugeiconsIcon icon={ChevronFirstIcon} size={16} aria-hidden="true" />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => onPageChange(currentPage - 1, "prev")}
                disabled={isLoading || !hasPrevious}
                aria-label="Go to previous page"
              >
                <HugeiconsIcon icon={ChevronLeft} size={16} aria-hidden="true" />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => onPageChange(currentPage + 1, "next")}
                disabled={isLoading || !hasNext}
                aria-label="Go to next page"
              >
                <HugeiconsIcon icon={ChevronRight} size={16} aria-hidden="true" />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => onPageChange(totalPages, "last")}
                disabled={isLoading || !hasNext}
                aria-label="Go to last page"
              >
                <HugeiconsIcon icon={ChevronLastIcon} size={16} aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
