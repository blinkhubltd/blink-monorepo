"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Download01Icon as Download,
  Location01Icon as MapPin,
  PlusSignIcon as Plus,
  ScanLineIcon as ScanLine,
  UserAdd01Icon as UserPlus,
  UserGroupIcon as Users,
  WalletIcon as Wallet,
} from "@hugeicons/core-free-icons";
import React, { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { toast } from "sonner";
import { AgentsTable, AgentRow } from "@/components/agents/AgentsTable";
import {
  AgentForm,
  AgentFormSubmitValues,
} from "@/components/agents/AgentForm";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { getConvexErrorMessage } from "@/lib/utils";
import Link from "next/link";

export default function AgentsPage() {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  // Paginated agents
  const agentsResult = useQuery(api.data.marketing.getAgents, {
    limit: pageSize,
    cursor,
    search: debouncedSearchQuery.trim() ? debouncedSearchQuery : undefined,
  });

  // All agents for stats
  const allAgents = useQuery(api.data.marketing.getAllAgents) ?? [];

  const createAgent = useMutation(api.data.marketing.createAgent);
  const updateAgent = useMutation(api.data.marketing.updateAgent);
  const deleteAgent = useMutation(api.data.marketing.deleteAgent);
  const backfillAgentsSearchText = useMutation(
    api.data.marketing.backfillAgentsSearchText,
  );
  const createRecipient = useAction(
    api.data.agent_payment_requests.createAgentPaystackRecipient,
  );

  // Reset pagination when search changes
  useEffect(() => {
    setCursor(null);
    setCurrentPage(1);
    setCursorHistory([null]);
  }, [debouncedSearchQuery]);

  // Backfill searchText for agents that don't have it yet
  useEffect(() => {
    if (!agentsResult || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      agentsResult.data.some((agent: any) => !agent.searchText) ||
      (debouncedSearchQuery.trim().length > 0 &&
        agentsResult.pagination.total > 0 &&
        agentsResult.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    backfillAgentsSearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.success("Search index updated", {
            description: `Updated ${updatedCount} agents for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill agents searchText:", error);
      });
  }, [
    agentsResult,
    hasTriggeredSearchBackfill,
    debouncedSearchQuery,
    backfillAgentsSearchText,
  ]);

  // Stats
  const totalAgents = allAgents.length;
  const totalScans = allAgents.reduce(
    (sum: number, a: any) => sum + (a.scans ?? 0),
    0,
  );
  const avgScans = totalAgents > 0 ? Math.round(totalScans / totalAgents) : 0;
  const totalInstalls = allAgents.reduce(
    (sum: number, a: any) => sum + (a.installs ?? 0),
    0,
  );
  const totalRegistrations = allAgents.reduce(
    (sum: number, a: any) => sum + (a.registerations ?? 0),
    0,
  );

  // Agents data & pagination info
  const agents = agentsResult?.data ?? [];
  const pagination = {
    hasNext: agentsResult?.pagination.hasNext ?? false,
    hasPrevious: currentPage > 1,
    totalPages: agentsResult?.pagination.totalPages ?? 1,
    currentPage,
    pageSize,
    total: agentsResult?.pagination.total ?? 0,
    cursor: agentsResult?.pagination.cursor ?? null,
  };

  const handleCreateAgent = useCallback(
    async (values: AgentFormSubmitValues) => {
      try {
        await createAgent({
          user_id: values.userId,
          zone_id: values.zone_id,
          mpesa_number: values.mpesa_number,
        });
        toast.success("Agent added successfully");
      } catch (error) {
        console.error("Error creating agent:", error);
        toast.error(getConvexErrorMessage(error, "Failed to add agent"));
        throw error;
      }
    },
    [createAgent],
  );

  const handleUpdateAgent = useCallback(
    async (values: AgentFormSubmitValues) => {
      if (!editingAgent) return;
      try {
        await updateAgent({
          id: editingAgent._id,
          zone_id: values.zone_id,
          mpesa_number: values.mpesa_number,
        });
        toast.success("Agent updated successfully");
        setEditingAgent(null);
      } catch (error) {
        console.error("Error updating agent:", error);
        toast.error(getConvexErrorMessage(error, "Failed to update agent"));
        throw error;
      }
    },
    [updateAgent, editingAgent],
  );

  const handleRemoveAgent = useCallback(
    async (agentId: Id<"agents">) => {
      try {
        await deleteAgent({ agentId });
        toast.success("Agent removed successfully");
      } catch (error) {
        console.error("Error removing agent:", error);
        toast.error(getConvexErrorMessage(error, "Failed to remove agent"));
      }
    },
    [deleteAgent],
  );

  const handleCreateRecipient = useCallback(
    async (agentId: Id<"agents">) => {
      const agent = allAgents.find((a: any) => a._id === agentId);
      const mpesaNumber: string = agent?.mpesa_number ?? "";
      if (!mpesaNumber) {
        toast.error("Agent does not have an M-Pesa number set");
        return;
      }
      try {
        await createRecipient({ agentId, mpesaNumber });
        toast.success("Paystack recipient created");
      } catch (error: any) {
        toast.error(getConvexErrorMessage(error, "Failed to create recipient"));
      }
    },
    [createRecipient, allAgents],
  );

  const handlePageChange = useCallback(
    (page: number, direction: "first" | "prev" | "next" | "last") => {
      if (!agentsResult) return;

      switch (direction) {
        case "first":
          setCurrentPage(1);
          setCursor(null);
          setCursorHistory([null]);
          break;
        case "prev":
          if (currentPage > 1) {
            const newCurrentPage = currentPage - 1;
            setCurrentPage(newCurrentPage);
            const newCursor = cursorHistory[newCurrentPage - 1];
            setCursor(newCursor ?? null);
            setCursorHistory(cursorHistory.slice(0, newCurrentPage));
          }
          break;
        case "next":
          if (agentsResult.pagination.hasNext) {
            const newCursor = agentsResult.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage((prev) => prev + 1);
          }
          break;
        case "last":
          if (agentsResult.pagination.totalPages > 0) {
            const newCursor = agentsResult.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage(agentsResult.pagination.totalPages);
          }
          break;
      }
    },
    [agentsResult, currentPage, cursorHistory],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    setCursor(null);
    setCursorHistory([null]);
  }, []);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Manage marketing agents and track their performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/agents/zones">
              <HugeiconsIcon icon={MapPin} className="mr-2 h-4 w-4" /> Zones
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/agents/payment-requests">
              <HugeiconsIcon icon={Wallet} className="mr-2 h-4 w-4" /> Payment Requests
            </Link>
          </Button>
          <Button
            onClick={() => {
              setEditingAgent(null);
              setShowAddAgent(true);
            }}
          >
            <HugeiconsIcon icon={Plus} className="mr-2 h-4 w-4" /> Add Agent
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <HugeiconsIcon icon={Users} className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAgents}</div>
            <p className="text-xs text-muted-foreground">
              Registered marketing agents
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Scans</CardTitle>
            <HugeiconsIcon icon={ScanLine} className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalScans}</div>
            <p className="text-xs text-muted-foreground">
              Avg {avgScans} scans per agent
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Installs
            </CardTitle>
            <HugeiconsIcon icon={Download} className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInstalls}</div>
            <p className="text-xs text-muted-foreground">
              App installs from agents
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Registrations
            </CardTitle>
            <HugeiconsIcon icon={UserPlus} className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRegistrations}</div>
            <p className="text-xs text-muted-foreground">
              User registrations from agents
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Agents Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Agents</CardTitle>
          <CardDescription>
            View and manage marketing agents and their performance metrics
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 pb-6">
            <AgentsTable
              agents={agents}
              isLoading={!agentsResult}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              pagination={pagination}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onRemoveAgent={handleRemoveAgent}
              onEditAgent={(agent) => {
                setEditingAgent(agent);
                setShowAddAgent(true);
              }}
              onCreateRecipient={handleCreateRecipient}
            />
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Agent Dialog */}
      <AgentForm
        open={showAddAgent}
        onOpenChange={(open) => {
          setShowAddAgent(open);
          if (!open) setEditingAgent(null);
        }}
        mode={editingAgent ? "edit" : "create"}
        initialValues={
          editingAgent
            ? {
                zone_id: editingAgent.zone_id,
                mpesa_number: editingAgent.mpesa_number,
              }
            : undefined
        }
        initialUserPhone={editingAgent?.user?.phone ?? undefined}
        onSubmit={editingAgent ? handleUpdateAgent : handleCreateAgent}
      />
    </div>
  );
}
