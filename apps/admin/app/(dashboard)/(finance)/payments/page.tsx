"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon as AlertTriangle,
  ChartUpIcon as TrendingUp,
  CreditCardIcon as CreditCard,
  DollarSignIcon as DollarSign,
  RefreshIcon as RefreshCw,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { PaymentsTable } from "@/components/payments/PaymentsTable";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { useRouter, useSearchParams } from "next/navigation";
import { formatKES, getConvexErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthContext";
import { hasPermission } from "@/lib/auth/permissions";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export default function PaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();

  const initialPage = Number(searchParams.get("page") ?? "1");
  const initialLimit = Number(searchParams.get("limit") ?? "10");

  const [selectedPaymentIds, setSelectedPaymentIds] = useState<
    Id<"payments">[]
  >([]);
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [limit, setLimit] = useState(
    [5, 10, 25, 50].includes(initialLimit) ? initialLimit : 10,
  );
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const currentCursor = cursorStack[cursorStack.length - 1] ?? null;

  const paymentsResult = useQuery(api.data.payments.getPayments, {
    limit,
    cursor: currentCursor,
    search: debouncedSearchQuery.trim() ? debouncedSearchQuery : undefined,
  });

  const backfillPaymentsSearchText = useMutation(
    api.data.payments.backfillPaymentsSearchText,
  );
  const updatePaymentStatus = useMutation(api.data.payments.updatePaymentStatus);

  useEffect(() => {
    // Reset pagination when search changes
    setCursorStack([null]);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
  }, [debouncedSearchQuery, router, searchParams, limit]);

  useEffect(() => {
    if (!paymentsResult || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      (paymentsResult.data as any[]).some((p) => !p.searchText) ||
      (debouncedSearchQuery.trim().length > 0 &&
        paymentsResult.pagination.total > 0 &&
        paymentsResult.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    backfillPaymentsSearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.success("Search index updated", {
            description: `Updated ${updatedCount} payments for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill payments searchText:", error);
      });
  }, [
    paymentsResult,
    hasTriggeredSearchBackfill,
    debouncedSearchQuery,
    backfillPaymentsSearchText,
  ]);

  const payments = useMemo(() => {
    const rows = paymentsResult?.data ?? [];
    return rows.map((p: any) => {
      const user = p.user;
      const order = p.order;
      const displayName =
        user?.name ||
        `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
        user?.email?.split("@")[0];

      const uiStatus: "Pending" | "Completed" | "Failed" | "Refunded" =
        p.status === "Successful"
          ? "Completed"
          : p.status === "Pending"
            ? "Pending"
            : p.status === "Failed"
              ? "Failed"
              : p.status === "Refunded"
                ? "Refunded"
                : "Pending";

      return {
        _id: p._id as Id<"payments">,
        order_id: (p.order_id as Id<"orders">) ?? (order?._id as Id<"orders">),
        user_id: p.user_id as Id<"users">,
        amount: Number(p.amount ?? 0),
        currency: "KES",
        payment_method: p.payment_method,
        payment_status: uiStatus,
        transaction_id: p.transaction_id,
        reference: p.reference,
        provider: p.provider,
        fee_amount: p.fee_amount ?? 0,
        net_amount: Number(p.amount ?? 0) - Number(p.fee_amount ?? 0),
        payment_date: p.payment_date ?? p._creationTime,
        created_at: p._creationTime,
        updated_at: p.updated_at,
        order_reference: order?.reference,
        customer_name: displayName,
        customer_email: user?.email ?? p.customerEmail,
      };
    });
  }, [paymentsResult]);

  const paginationData = paymentsResult?.pagination;
  const isLoading = !paymentsResult;

  // Calculate statistics
  const paymentStats = useMemo(() => {
    const totalPayments = payments.length;
    const completedPayments = payments.filter(
      (p: { payment_status: string; amount?: number }) =>
        p.payment_status === "Completed",
    ).length;
    const totalAmount = payments
      .filter(
        (p: { payment_status: string; amount?: number }) =>
          p.payment_status === "Completed",
      )
      .reduce(
        (sum: number, p: { amount?: number }) => sum + (p.amount ?? 0),
        0,
      );
    const pendingPayments = payments.filter(
      (p: { payment_status: string; amount?: number }) =>
        p.payment_status === "Pending",
    ).length;
    const failedPayments = payments.filter(
      (p: { payment_status: string; amount?: number }) =>
        p.payment_status === "Failed",
    ).length;
    const totalFees = payments
      .filter(
        (p: { payment_status: string; amount?: number }) =>
          p.payment_status === "Completed",
      )
      .reduce(
        (sum: number, p: { amount?: number; fee_amount?: number }) =>
          sum + (p.fee_amount || 0),
        0,
      );

    return {
      totalPayments,
      completedPayments,
      totalAmount,
      pendingPayments,
      failedPayments,
      totalFees,
    };
  }, [payments]);

  /*
    The permission gate sits HERE, below every hook, and that placement is the
    fix rather than a preference.

    It used to be the first thing in the component, above all fourteen hooks. On
    the first render `currentUser` is null while auth resolves, so the gate
    returned early and React recorded zero hooks for this component. When auth
    resolved and the permission passed, the next render called fourteen — and
    React throws "Rendered more hooks than during the previous render" and
    unmounts the tree. The screen was reachable only for whoever had
    `currentUser` available synchronously.

    Hooks must run in the same order on every render, so the gate has to come
    after them. The queries above do run for a user who turns out not to have
    permission; they are Convex reads that authorise themselves server-side, so
    that costs a subscription, not access.
  */
  if (!currentUser || !hasPermission(currentUser, "payments:view")) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <HugeiconsIcon
            icon={AlertTriangle}
            className="w-12 h-12 text-red-500 mx-auto mb-4"
          />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            You don&apos;t have permission to view payments.
          </p>
          <Button onClick={() => router.push("/")}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

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

  const handleUpdatePaymentStatus = async (
    paymentId: Id<"payments">,
    status: "Pending" | "Completed" | "Failed" | "Refunded",
  ) => {
    try {
      const raw = paymentsResult?.data?.find((p: any) => p._id === paymentId);
      const reference = raw?.reference;
      if (!reference) {
        toast.error("Cannot update payment: missing reference");
        return;
      }

      const backendStatus = status === "Completed" ? "Successful" : status;
      await updatePaymentStatus({
        reference,
        status: backendStatus as any,
        paystackResponse: undefined,
      });
      toast.success(`Payment status updated to ${status}`);
    } catch (error) {
      console.error("Failed to update payment status:", error);
      toast.error(
        getConvexErrorMessage(error, "Failed to update payment status"),
      );
    }
  };

  const handleRefundPayment = async (paymentId: Id<"payments">) => {
    try {
      // TODO: Replace with actual mutation when available
      // await refundPayment({ paymentId });
      toast.success("Payment refund initiated");
    } catch (error) {
      console.error("Failed to refund payment:", error);
      toast.error(getConvexErrorMessage(error, "Failed to refund payment"));
    }
  };

  const handleSelectedIdsChange = (ids: Id<"payments">[]) => {
    const validIds = ids.filter(
      (id): id is Id<"payments"> =>
        id != null && typeof id === "string" && id.trim() !== "",
    );
    setSelectedPaymentIds(validIds);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
              <p className="text-muted-foreground">
                Manage payment transactions and financial data
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Refresh the page data
                window.location.reload();
              }}
            >
              <HugeiconsIcon icon={RefreshCw} className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Payments
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {paymentStats.totalPayments}
                  </p>
                </div>
                <HugeiconsIcon icon={CreditCard} className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-foreground">
                    {paymentStats.completedPayments}
                  </p>
                </div>
                <HugeiconsIcon icon={TrendingUp} className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatKES(paymentStats.totalAmount)}
                  </p>
                </div>
                <HugeiconsIcon icon={DollarSign} className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Failed/Pending
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {paymentStats.failedPayments + paymentStats.pendingPayments}
                  </p>
                </div>
                <HugeiconsIcon icon={AlertTriangle} className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 && !isLoading ? (
              <div className="text-center py-12">
                <HugeiconsIcon icon={CreditCard} className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">
                  No payments found
                </h3>
                <p className="text-muted-foreground">
                  Payment transactions will appear here once customers make
                  purchases.
                </p>
              </div>
            ) : (
              <PaymentsTable
                payments={payments}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                selectedIds={selectedPaymentIds}
                onSelectedIdsChange={handleSelectedIdsChange}
                onUpdatePaymentStatus={handleUpdatePaymentStatus}
                onRefundPayment={handleRefundPayment}
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
