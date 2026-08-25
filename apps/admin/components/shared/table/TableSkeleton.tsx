"use client";

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showFilters?: boolean;
}

export function TableSkeleton({ 
  rows = 5, 
  columns = 6, 
  showFilters = true 
}: TableSkeletonProps) {
  return (
    <div className="w-full space-y-4">
      {/* Filters skeleton */}
      {showFilters && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center space-x-2">
            <Skeleton className="h-9 w-[250px]" /> {/* Search input */}
            <Skeleton className="h-9 w-[140px]" /> {/* Filter 1 */}
            <Skeleton className="h-9 w-[140px]" /> {/* Filter 2 */}
          </div>
          <Skeleton className="h-9 w-[100px]" /> {/* Columns button */}
        </div>
      )}

      {/* Table skeleton */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, index) => (
                <TableHead key={index}>
                  <Skeleton className="h-4 w-full" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <TableCell key={colIndex}>
                    <Skeleton 
                      className={`h-4 ${
                        colIndex === 0 ? "w-20" : 
                        colIndex === 1 ? "w-32" : 
                        colIndex === columns - 1 ? "w-16" :
                        "w-24"
                      }`} 
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}
