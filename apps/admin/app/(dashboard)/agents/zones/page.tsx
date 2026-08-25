"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeftIcon as ArrowLeft,
  Location01Icon as MapPin,
  PlusSignIcon as Plus,
} from "@hugeicons/core-free-icons";
import React, { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { toast } from "sonner";
import { ZonesTable, ZoneRow } from "@/components/agents/ZonesTable";
import { ZoneForm, ZoneFormValues } from "@/components/agents/ZoneForm";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { getConvexErrorMessage } from "@/lib/utils";

export default function AgentZonesPage() {
  const { can, isLoading: permsLoading } = useCurrentUserPermissions();
  const canCreate = can("agents:CREATE");
  const canUpdate = can("agents:UPDATE");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneRow | null>(null);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const zonesResult = useQuery(api.data.agent_zones.getZones, {
    limit: pageSize,
    cursor,
    search: debouncedSearch.trim() ? debouncedSearch : undefined,
  });

  const createZone = useMutation(api.data.agent_zones.createZone);
  const updateZone = useMutation(api.data.agent_zones.updateZone);
  const deleteZone = useMutation(api.data.agent_zones.deleteZone);

  useEffect(() => {
    setCursor(null);
    setCurrentPage(1);
    setCursorHistory([null]);
  }, [debouncedSearch]);

  const handleCreateZone = useCallback(
    async (values: ZoneFormValues) => {
      try {
        await createZone(values);
        toast.success("Zone created successfully");
      } catch (error: any) {
        toast.error(getConvexErrorMessage(error, "Failed to create zone"));
        throw error;
      }
    },
    [createZone],
  );

  const handleUpdateZone = useCallback(
    async (values: ZoneFormValues) => {
      if (!editingZone) return;
      try {
        await updateZone({ id: editingZone._id, ...values });
        toast.success("Zone updated successfully");
        setEditingZone(null);
      } catch (error: any) {
        toast.error(getConvexErrorMessage(error, "Failed to update zone"));
        throw error;
      }
    },
    [updateZone, editingZone],
  );

  const handleDeleteZone = useCallback(
    async (zoneId: Id<"agent_zones">) => {
      try {
        await deleteZone({ id: zoneId });
        toast.success("Zone deleted");
      } catch (error: any) {
        toast.error(getConvexErrorMessage(error, "Failed to delete zone"));
      }
    },
    [deleteZone],
  );

  const handleEditZone = useCallback((zone: ZoneRow) => {
    setEditingZone(zone);
    setShowZoneForm(true);
  }, []);

  const handlePageChange = useCallback(
    (page: number, direction: "first" | "prev" | "next" | "last") => {
      if (!zonesResult) return;
      switch (direction) {
        case "first":
          setCurrentPage(1);
          setCursor(null);
          setCursorHistory([null]);
          break;
        case "prev":
          if (currentPage > 1) {
            const np = currentPage - 1;
            setCurrentPage(np);
            const nc = cursorHistory[np - 1];
            setCursor(nc ?? null);
            setCursorHistory(cursorHistory.slice(0, np));
          }
          break;
        case "next":
          if (zonesResult.pagination.hasNext) {
            const nc = zonesResult.pagination.cursor;
            setCursor(nc ?? null);
            setCursorHistory([...cursorHistory, nc]);
            setCurrentPage((prev) => prev + 1);
          }
          break;
        case "last":
          if (zonesResult.pagination.totalPages > 0) {
            const nc = zonesResult.pagination.cursor;
            setCursor(nc ?? null);
            setCursorHistory([...cursorHistory, nc]);
            setCurrentPage(zonesResult.pagination.totalPages);
          }
          break;
      }
    },
    [zonesResult, currentPage, cursorHistory],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    setCursor(null);
    setCursorHistory([null]);
  }, []);

  const zones = (zonesResult?.data ?? []) as ZoneRow[];
  const pagination = {
    hasNext: zonesResult?.pagination.hasNext ?? false,
    hasPrevious: currentPage > 1,
    totalPages: zonesResult?.pagination.totalPages ?? 1,
    currentPage,
    pageSize,
    total: zonesResult?.pagination.total ?? 0,
    cursor: zonesResult?.pagination.cursor ?? null,
  };

  const totalZones = zones.length;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/agents">
              <HugeiconsIcon icon={ArrowLeft} className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agent Zones</h1>
            <p className="text-muted-foreground">
              Manage zones and their commission configurations
            </p>
          </div>
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setEditingZone(null);
              setShowZoneForm(true);
            }}
          >
            <HugeiconsIcon icon={Plus} className="mr-2 h-4 w-4" /> Create Zone
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-1">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Zones</CardTitle>
            <HugeiconsIcon icon={MapPin} className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {zonesResult?.pagination.total ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Configured agent zones
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Zones Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Zones</CardTitle>
          <CardDescription>
            Zones define commission rules for agents assigned to them.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 pb-6">
            <ZonesTable
              zones={zones}
              isLoading={!zonesResult}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              pagination={pagination}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onEditZone={handleEditZone}
              onDeleteZone={handleDeleteZone}
              canEdit={canUpdate}
              canDelete={canCreate}
            />
          </div>
        </CardContent>
      </Card>

      {/* Zone Form Dialog */}
      <ZoneForm
        open={showZoneForm}
        onOpenChange={(open) => {
          setShowZoneForm(open);
          if (!open) setEditingZone(null);
        }}
        mode={editingZone ? "edit" : "create"}
        initialValues={editingZone ?? undefined}
        onSubmit={editingZone ? handleUpdateZone : handleCreateZone}
      />
    </div>
  );
}
