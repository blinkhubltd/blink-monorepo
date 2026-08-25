"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CreditCardIcon as CreditCard,
  Delete02Icon as Trash2,
  Edit02Icon as Pencil,
  MoreHorizontalIcon as MoreHorizontal,
  Search01Icon as Search,
  UserXIcon as UserX,
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

export interface AgentRow {
  _id: Id<"agents">;
  user_id: Id<"users">;
  code: string;
  scans?: number;
  installs?: number;
  registerations?: number;
  zone_id?: Id<"agent_zones">;
  zone_name?: string;
  mpesa_number?: string;
  paystack_recipient_code?: string;
  balance?: number;
  total_earned?: number;
  total_paid?: number;
  user: {
    name: string;
    email: string;
    phone: string;
  } | null;
  zone: {
    name: string;
  } | null;
}

interface AgentsPagination {
  hasNext: boolean;
  hasPrevious?: boolean;
  totalPages: number;
  currentPage?: number;
  pageSize?: number;
  total: number;
  cursor?: string | null;
}

interface AgentsTableProps {
  agents: AgentRow[];
  isLoading: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  pagination: AgentsPagination;
  onPageChange: (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRemoveAgent: (agentId: Id<"agents">) => Promise<void>;
  onEditAgent?: (agent: AgentRow) => void;
  onCreateRecipient?: (agentId: Id<"agents">) => Promise<void>;
  canEdit?: boolean;
}

export function AgentsTable({
  agents,
  isLoading,
  searchQuery,
  onSearchQueryChange,
  pagination,
  onPageChange,
  onPageSizeChange,
  onRemoveAgent,
  onEditAgent,
  onCreateRecipient,
  canEdit = true,
}: AgentsTableProps) {
  return (
    <div className="space-y-4">
      {/* Search - always rendered, never replaced by skeleton */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <HugeiconsIcon icon={Search} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents by name, email, phone or code..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table area - shows skeleton only here during loading */}
      {isLoading ? (
        <TableSkeleton rows={5} columns={6} showFilters={false} />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>M-Pesa</TableHead>
                  <TableHead className="text-right">Scans</TableHead>
                  <TableHead className="text-right">Installs</TableHead>
                  <TableHead className="text-right">Regs</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <HugeiconsIcon icon={UserX} className="h-8 w-8 mb-2" />
                        <p>No agents found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  agents.map((agent) => (
                    <TableRow key={agent._id}>
                      <TableCell className="font-medium">
                        <div>
                          <p>{agent.user?.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            {agent.code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{agent.user?.email || "—"}</p>
                          <p className="text-muted-foreground">
                            {agent.user?.phone || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {agent.zone?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {agent.mpesa_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {agent.scans ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {agent.installs ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {agent.registerations ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        KES {(agent.balance ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        KES {(agent.total_earned ?? 0).toLocaleString()}
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
                            {canEdit && onEditAgent && (
                              <DropdownMenuItem
                                onClick={() => onEditAgent(agent)}
                              >
                                <HugeiconsIcon icon={Pencil} className="mr-2 h-4 w-4" />
                                Edit Agent
                              </DropdownMenuItem>
                            )}
                            {onCreateRecipient &&
                              !agent.paystack_recipient_code && (
                                <DropdownMenuItem
                                  onClick={() => onCreateRecipient(agent._id)}
                                >
                                  <HugeiconsIcon icon={CreditCard} className="mr-2 h-4 w-4" />
                                  Create Paystack Recipient
                                </DropdownMenuItem>
                              )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onRemoveAgent(agent._id)}
                            >
                              <HugeiconsIcon icon={Trash2} className="mr-2 h-4 w-4" />
                              Remove as Agent
                            </DropdownMenuItem>
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
