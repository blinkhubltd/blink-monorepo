"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon as Trash2,
  Edit02Icon as Pencil,
  Location01Icon as MapPin,
  MoreHorizontalIcon as MoreHorizontal,
  Search01Icon as Search,
} from "@hugeicons/core-free-icons";
import React from "react";
import { Id } from "@repo/backend/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { TablePagination, TableSkeleton } from "@/components/shared/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Badge } from "@repo/ui/components/ui/badge";

export interface ZoneRow {
  _id: Id<"agent_zones">;
  name: string;
  description?: string;
  earning_type: "fixed" | "per_conversion" | "both";
  fixed_amount?: number;
  min_installs?: number;
  min_registrations?: number;
  install_commission_enabled?: boolean;
  install_commission_rate?: number;
  registration_commission_enabled?: boolean;
  registration_commission_rate?: number;
  agentCount: number;
}

interface ZonesPagination {
  hasNext: boolean;
  hasPrevious?: boolean;
  totalPages: number;
  currentPage?: number;
  pageSize?: number;
  total: number;
  cursor?: string | null;
}

interface ZonesTableProps {
  zones: ZoneRow[];
  isLoading: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  pagination: ZonesPagination;
  onPageChange: (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => void;
  onPageSizeChange: (pageSize: number) => void;
  onEditZone: (zone: ZoneRow) => void;
  onDeleteZone: (zoneId: Id<"agent_zones">) => Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
}

const EARNING_TYPE_LABELS: Record<string, string> = {
  fixed: "Fixed",
  per_conversion: "Per Conversion",
  both: "Both",
};

const EARNING_TYPE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  fixed: "secondary",
  per_conversion: "default",
  both: "outline",
};

export function ZonesTable({
  zones,
  isLoading,
  searchQuery,
  onSearchQueryChange,
  pagination,
  onPageChange,
  onPageSizeChange,
  onEditZone,
  onDeleteZone,
  canEdit = true,
  canDelete = true,
}: ZonesTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <HugeiconsIcon icon={Search} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search zones..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={5} showFilters={false} />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone Name</TableHead>
                  <TableHead>Commission Type</TableHead>
                  <TableHead>Rates</TableHead>
                  <TableHead className="text-right">Agents</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <HugeiconsIcon icon={MapPin} className="h-8 w-8 mb-2" />
                        <p>No zones found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  zones.map((zone) => (
                    <TableRow key={zone._id}>
                      <TableCell className="font-medium">
                        <div>
                          <p>{zone.name}</p>
                          {zone.description && (
                            <p className="text-xs text-muted-foreground">
                              {zone.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            EARNING_TYPE_VARIANT[zone.earning_type] ?? "default"
                          }
                        >
                          {EARNING_TYPE_LABELS[zone.earning_type] ??
                            zone.earning_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm space-y-0.5">
                          {(zone.earning_type === "fixed" ||
                            zone.earning_type === "both") &&
                            zone.fixed_amount != null && (
                              <p>
                                Fixed: KES {zone.fixed_amount.toLocaleString()}
                              </p>
                            )}
                          {(zone.earning_type === "per_conversion" ||
                            zone.earning_type === "both") && (
                            <>
                              {zone.install_commission_enabled &&
                                zone.install_commission_rate != null && (
                                  <p>
                                    Install: KES {zone.install_commission_rate}
                                  </p>
                                )}
                              {zone.registration_commission_enabled &&
                                zone.registration_commission_rate != null && (
                                  <p>
                                    Reg: KES {zone.registration_commission_rate}
                                  </p>
                                )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {zone.agentCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <HugeiconsIcon icon={MoreHorizontal} className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                              <DropdownMenuItem
                                onClick={() => onEditZone(zone)}
                              >
                                <HugeiconsIcon icon={Pencil} className="mr-2 h-4 w-4" />
                                Edit Zone
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => onDeleteZone(zone._id)}
                              >
                                <HugeiconsIcon icon={Trash2} className="mr-2 h-4 w-4" />
                                Delete Zone
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pagination.total > 0 && (
            <TablePagination
              pagination={pagination}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              isLoading={isLoading}
            />
          )}
        </>
      )}
    </div>
  );
}
