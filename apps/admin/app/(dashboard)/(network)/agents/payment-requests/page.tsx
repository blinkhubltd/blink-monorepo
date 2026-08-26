"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeftIcon as ArrowLeft,
  WalletIcon as Wallet,
} from "@hugeicons/core-free-icons";
import React, { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
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
import {
  PaymentRequestsTable,
  PaymentRequestRow,
} from "@/components/agents/PaymentRequestsTable";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { getConvexErrorMessage } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "paid";

export default function AgentPaymentRequestsPage() {
  const { can, convexUser } = useCurrentUserPermissions();
  const canApprove = can("agents:UPDATE");
  const canPay = can("agents:CREATE");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);

  const requestsResult = useQuery(api.data.agent_payment_requests.getPaymentRequests, {
    limit: pageSize,
    cursor,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const updateStatus = useMutation(
    api.data.agent_payment_requests.updatePaymentRequestStatus,
  );
  const processPayment = useAction(
    api.data.agent_payment_requests.processPaymentRequest,
  );

  useEffect(() => {
    setCursor(null);
    setCurrentPage(1);
    setCursorHistory([null]);
  }, [statusFilter, pageSize]);

  const handleApprove = useCallback(
    async (id: Id<"agent_payment_requests">) => {
      try {
        await updateStatus({
          id,
          status: "approved",
          processedBy: convexUser!._id,
        });
        toast.success("Request approved");
      } catch (error: any) {
        toast.error(getConvexErrorMessage(error, "Failed to approve request"));
        throw error;
      }
    },
    [updateStatus],
  );

  const handleReject = useCallback(
    async (id: Id<"agent_payment_requests">, reason: string) => {
      try {
        await updateStatus({
          id,
          status: "rejected",
          rejection_reason: reason,
          processedBy: convexUser!._id,
        });
        toast.success("Request rejected");
      } catch (error: any) {
        toast.error(getConvexErrorMessage(error, "Failed to reject request"));
        throw error;
      }
    },
    [updateStatus],
  );

  const handlePay = useCallback(
    async (id: Id<"agent_payment_requests">) => {
      try {
        await processPayment({ requestId: id, processedBy: convexUser!._id });
        toast.success("Payment processed via M-Pesa");
      } catch (error: any) {
        toast.error(getConvexErrorMessage(error, "Payment failed"));
        throw error;
      }
    },
    [processPayment],
  );

  const handlePageChange = useCallback(
    (page: number, direction: "first" | "prev" | "next" | "last") => {
      if (!requestsResult) return;
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
          if (requestsResult.pagination.hasNext) {
            const nc = requestsResult.pagination.cursor;
            setCursor(nc ?? null);
            setCursorHistory([...cursorHistory, nc]);
            setCurrentPage((prev) => prev + 1);
          }
          break;
        case "last":
          if (requestsResult.pagination.totalPages > 0) {
            const nc = requestsResult.pagination.cursor;
            setCursor(nc ?? null);
            setCursorHistory([...cursorHistory, nc]);
            setCurrentPage(requestsResult.pagination.totalPages);
          }
          break;
      }
    },
    [requestsResult, currentPage, cursorHistory],
  );

  const requests = (requestsResult?.data ?? []) as PaymentRequestRow[];
  const pagination = {
    hasNext: requestsResult?.pagination.hasNext ?? false,
    hasPrevious: currentPage > 1,
    totalPages: requestsResult?.pagination.totalPages ?? 1,
    currentPage,
    pageSize,
    total: requestsResult?.pagination.total ?? 0,
    cursor: requestsResult?.pagination.cursor ?? null,
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

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
            <h1 className="text-3xl font-bold tracking-tight">
              Agent Payment Requests
            </h1>
            <p className="text-muted-foreground">
              Review, approve, and pay out agent earnings via M-Pesa
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          <HugeiconsIcon icon={Wallet} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {requestsResult?.pagination.total ?? 0}
          </div>
          {pendingCount > 0 && (
            <p className="text-xs text-amber-600">
              {pendingCount} pending review
            </p>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Payment Requests</CardTitle>
          <CardDescription>
            Approve requests then use "Pay Now" to send funds via M-Pesa
            (Paystack Transfers).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 pb-6">
            <PaymentRequestsTable
              requests={requests}
              isLoading={!requestsResult}
              statusFilter={statusFilter}
              onStatusFilterChange={(s) => setStatusFilter(s as StatusFilter)}
              pagination={pagination}
              onPageChange={handlePageChange}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
                setCursor(null);
                setCursorHistory([null]);
              }}
              onApprove={handleApprove}
              onReject={handleReject}
              onPay={handlePay}
              canApprove={canApprove}
              canPay={canPay}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
