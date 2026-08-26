"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferHorizontalIcon as ArrowLeftRight,
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle,
  Clock01Icon as Clock,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { TransactionsTable } from "@/components/transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { useRouter, useSearchParams } from "next/navigation";
import { formatKES, getConvexErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, isLoading: permsLoading } = useCurrentUserPermissions();

  const canRead = permsLoading || can("transactions:READ");
  const canUpdate = can("transactions:UPDATE");

  const initialPage = Number(searchParams.get("page") ?? "1");
  const initialLimit = Number(searchParams.get("limit") ?? "10");

  const [page, setPage] = useState(Math.max(1, initialPage));
  const [limit, setLimit] = useState(
    [5, 10, 25, 50].includes(initialLimit) ? initialLimit : 10,
  );
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "successful" | "failed" | "refunded" | undefined
  >(undefined);
  const [typeFilter, setTypeFilter] = useState<"credit" | "debit" | undefined>(
    undefined,
  );

  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const currentCursor = cursorStack[cursorStack.length - 1] ?? null;

  const result = useQuery(
    api.data.transactions.getTransactions,
    canRead
      ? {
          limit,
          cursor: currentCursor,
          search: debouncedSearch.trim() || undefined,
          statusFilter,
          typeFilter,
        }
      : "skip",
  );

  const updateStatusMutation = useMutation(
    api.data.transactions.updateTransactionStatus,
  );

  // Reset pagination when filters/search change
  useEffect(() => {
    setCursorStack([null]);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, typeFilter, limit]);

  const transactions = useMemo(() => result?.data ?? [], [result]);
  const paginationData = result?.pagination;
  const isLoading = !result;

  const stats = useMemo(() => {
    const all = transactions;
    return {
      total: paginationData?.total ?? 0,
      successful: all.filter((t) => t.status === "successful").length,
      pending: all.filter((t) => t.status === "pending").length,
      failedOrRefunded: all.filter(
        (t) => t.status === "failed" || t.status === "refunded",
      ).length,
      totalAmount: all
        .filter((t) => t.status === "successful")
        .reduce((sum, t) => sum + t.amount, 0),
    };
  }, [transactions, paginationData]);

  const handlePageChange = (nextPage: number) => {
    const safe = Math.max(1, nextPage);
    if (safe === 1) {
      setCursorStack([null]);
      setPage(1);
    } else if (safe === page + 1 && paginationData?.cursor) {
      setCursorStack((prev) => [...prev, paginationData.cursor!]);
      setPage((p) => p + 1);
    } else if (safe === page - 1 && cursorStack.length > 1) {
      setCursorStack((prev) => prev.slice(0, -1));
      setPage((p) => Math.max(1, p - 1));
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(safe));
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
  };

  const handleLimitChange = (nextLimit: number) => {
    setLimit(nextLimit);
    setPage(1);
    setCursorStack([null]);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("limit", String(nextLimit));
    router.replace(`?${params.toString()}`);
  };

  const handleUpdateStatus = async (
    id: Id<"transactions">,
    status: "pending" | "successful" | "failed" | "refunded",
  ) => {
    try {
      await updateStatusMutation({ id, status });
      toast.success(`Transaction status updated to ${status}`);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to update status"));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <HugeiconsIcon icon={ArrowLeftRight} className="w-7 h-7 text-muted-foreground" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Transactions
              </h1>
              <p className="text-muted-foreground">
                View and manage payment transaction records
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Transactions
                  </p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <HugeiconsIcon icon={ArrowLeftRight} className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Successful</p>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.successful}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatKES(stats.totalAmount)}
                  </p>
                </div>
                <HugeiconsIcon icon={CheckCircle} className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {stats.pending}
                  </p>
                </div>
                <HugeiconsIcon icon={Clock} className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Failed / Refunded
                  </p>
                  <p className="text-2xl font-bold text-red-600">
                    {stats.failedOrRefunded}
                  </p>
                </div>
                <HugeiconsIcon icon={XCircle} className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction Records</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionsTable
              transactions={transactions}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
              canUpdate={canUpdate}
              onUpdateStatus={handleUpdateStatus}
              paginationMeta={{
                page,
                limit,
                total: paginationData?.total ?? 0,
                totalPages: paginationData?.totalPages ?? 1,
                hasNext: paginationData?.hasNext ?? false,
                hasPrevious: page > 1,
              }}
              onPageChange={handlePageChange}
              onPageSizeChange={handleLimitChange}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
