"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChartBarLineIcon as BarChart3,
  CheckmarkCircle02Icon as CheckCircle,
  Clock01Icon as Clock,
  DollarSignIcon as DollarSign,
  PlusSignIcon as Plus,
  ShoppingCartIcon as ShoppingCart,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Id } from "@repo/backend/dataModel";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatKES, getConvexErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import Link from "next/link";

export default function OrdersPage() {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);

  const [searchQuery, setSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [pickerFilter, setPickerFilter] = useState<string>("all");
  const [clearanceFilter, setClearanceFilter] = useState<string>("all");
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const { currentUser } = useAuth();
  const { isAdminUser } = useCurrentUserPermissions();

  const ViewInsightsButton = () =>
    isAdminUser ? (
      <Link href="/orders/insights">
        <Button variant="outline" size="sm">
          <HugeiconsIcon icon={BarChart3} className="w-4 h-4 mr-2" />
          View Insights
        </Button>
      </Link>
    ) : null;

  // Auto-filter by assigned vendors for managers
  const assignedVendorIds = currentUser?.manager_details?.vendor_id;

  // Fetch paginated orders data
  const ordersResult = useQuery(api.data.orders.paginateOrders, {
    limit: pageSize,
    cursor,
    search: debouncedSearchQuery.trim() ? debouncedSearchQuery : undefined,
    order_status:
      orderStatusFilter !== "all" ? (orderStatusFilter as any) : undefined,
    payment_status:
      paymentStatusFilter !== "all" ? (paymentStatusFilter as any) : undefined,
    assigned_picker_id:
      pickerFilter !== "all" ? (pickerFilter as any) : undefined,
    vendor_ids:
      assignedVendorIds && assignedVendorIds.length > 0
        ? assignedVendorIds
        : undefined,
    is_clearance:
      clearanceFilter === "clearance"
        ? true
        : clearanceFilter === "regular"
          ? false
          : undefined,
  });

  // Fetch all pickers for the filter dropdown
  const allPickers = useQuery(api.user.users.getAllPickers);

  // Fetch all orders for insights (hub managers get filtered data)
  const allOrdersResult = useQuery(api.data.orders.paginateOrders, {
    limit: 1000,
    cursor: null,
    vendor_ids:
      assignedVendorIds && assignedVendorIds.length > 0
        ? assignedVendorIds
        : undefined,
  });

  const allOrders = allOrdersResult?.data ?? [];

  // Backend now handles vendor filtering via vendor_ids param
  const filteredOrders = allOrders;

  // Format picker options for the filter dropdown
  const pickerOptions = useMemo(() => {
    if (!allPickers) return [];
    return allPickers.map((p: any) => ({
      _id: p._id as string,
      name:
        p.name ||
        (p.first_name
          ? `${p.first_name || ""} ${p.last_name || ""}`.trim()
          : p.email?.split("@")[0] || "Unknown"),
    }));
  }, [allPickers]);

  // Table data and pagination
  const orders = ordersResult?.data ?? [];
  const pagination = {
    hasNext: ordersResult?.pagination.hasNext ?? false,
    hasPrevious: currentPage > 1,
    totalPages: ordersResult?.pagination.totalPages ?? 1,
    currentPage: currentPage,
    pageSize: pageSize,
    total: ordersResult?.pagination.total ?? 0,
    cursor: ordersResult?.pagination.cursor ?? null,
  };

  // Mutations
  const updateSingleOrderStatus = useMutation(api.data.orders.updateOrderStatus);
  const updateSinglePaymentStatus = useMutation(api.data.orders.updatePaymentStatus);
  const bulkUpdateOrderStatus = useMutation(api.data.orders.bulkUpdateOrderStatus);
  const deleteOrder = useMutation(api.data.orders.deleteOrder);
  const backfillOrdersSearchText = useMutation(
    api.data.orders.backfillOrdersSearchText,
  );

  // State
  const [selectedOrderIds, setSelectedOrderIds] = useState<Id<"orders">[]>([]);
  const [selectedOrderForDetails, setSelectedOrderForDetails] =
    useState<any>(null);
  const [orderDetailsDialogOpen, setOrderDetailsDialogOpen] = useState(false);

  // Fetch detailed order data when dialog opens
  const orderDetails = useQuery(
    api.data.orders.getOrderWithItems,
    selectedOrderForDetails ? { orderId: selectedOrderForDetails._id } : "skip",
  );

  const isLoading = !ordersResult;

  useEffect(() => {
    setCursor(null);
    setCurrentPage(1);
    setCursorHistory([null]);
  }, [
    debouncedSearchQuery,
    orderStatusFilter,
    paymentStatusFilter,
    pickerFilter,
    clearanceFilter,
  ]);

  useEffect(() => {
    if (!ordersResult || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      (ordersResult.data as any[]).some((o) => !o.searchText) ||
      (debouncedSearchQuery.trim().length > 0 &&
        ordersResult.pagination.total > 0 &&
        ordersResult.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    backfillOrdersSearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.success("Search index updated", {
            description: `Updated ${updatedCount} orders for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill orders searchText:", error);
      });
  }, [
    ordersResult,
    hasTriggeredSearchBackfill,
    debouncedSearchQuery,
    backfillOrdersSearchText,
  ]);

  const handlePageChange = useCallback(
    (page: number, direction: "first" | "prev" | "next" | "last") => {
      if (!ordersResult) return;

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
          if (ordersResult.pagination.hasNext) {
            const newCursor = ordersResult.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage((prev) => prev + 1);
          }
          break;
        case "last":
          if (ordersResult.pagination.totalPages > 0) {
            const newCursor = ordersResult.pagination.cursor;
            setCursor(newCursor ?? null);
            setCursorHistory([...cursorHistory, newCursor]);
            setCurrentPage(ordersResult.pagination.totalPages);
          }
          break;
      }
    },
    [ordersResult, currentPage, cursorHistory],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    setCursor(null);
    setCursorHistory([null]);
  }, []);

  // Calculate statistics (uses allOrdersResult, independent of table loading state)
  const totalOrders = filteredOrders.length;
  const totalRevenue = filteredOrders
    .filter((order: any) => order.payment_status === "Paid")
    .reduce((sum: number, order: any) => sum + order.total_amount, 0);
  const pendingOrders = filteredOrders.filter(
    (order: any) => order.order_status === "Pending",
  ).length;
  const deliveredOrders = filteredOrders.filter(
    (order: any) => order.order_status === "Delivered",
  ).length;

  const handleUpdateOrderStatus = async (
    orderId: Id<"orders">,
    status: any,
  ) => {
    try {
      await updateSingleOrderStatus({ orderId, status });
      toast(`Order status updated to ${status} successfully!`);
    } catch (error) {
      console.error("Failed to update order status:", error);
      toast.error(getConvexErrorMessage(error, "Order status update failed"));
    }
  };

  const handleUpdatePaymentStatus = async (
    orderId: Id<"orders">,
    status: any,
  ) => {
    try {
      await updateSinglePaymentStatus({ orderId, status });
      toast(`Payment status updated to ${status} successfully!`);
    } catch (error) {
      console.error("Failed to update payment status:", error);
      toast.error(
        getConvexErrorMessage(error, "Failed to update payment status"),
      );
    }
  };

  const handleBulkUpdateOrderStatus = async (
    orderIds: Id<"orders">[],
    status: any,
  ) => {
    try {
      await bulkUpdateOrderStatus({ orderIds, status });
      toast(`Order status bulk update to ${status} completed successfully!`);
    } catch (error) {
      console.error("Failed to bulk update order status:", error);
      toast.error(
        getConvexErrorMessage(error, "Order status bulk update failed"),
      );
    }
  };

  const handleDeleteOrder = async (id: Id<"orders">) => {
    try {
      await deleteOrder({ id });
      toast("Order deleted successfully!");
    } catch (error) {
      console.error("Failed to delete order:", error);
      toast.error(getConvexErrorMessage(error, "Failed to delete order"));
    }
  };

  const handleViewDetails = (order: any) => {
    setSelectedOrderForDetails(order);
    setOrderDetailsDialogOpen(true);
  };

  const handleSelectedIdsChange = (selectedIds: Id<"orders">[]) => {
    const validIds = selectedIds.filter(
      (id): id is Id<"orders"> =>
        id != null && typeof id === "string" && id.trim() !== "",
    );
    setSelectedOrderIds(validIds);
  };

  const isVendorManager =
    (currentUser?.manager_details?.vendor_id?.length ?? 0) > 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Manage and track all customer orders
          </p>
        </div>
        <ViewInsightsButton />
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <HugeiconsIcon icon={ShoppingCart}
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">All time orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <HugeiconsIcon icon={DollarSign}
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatKES(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              From paid orders only
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Orders
            </CardTitle>
            <HugeiconsIcon icon={Clock}
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders}</div>
            <p className="text-xs text-muted-foreground">Awaiting processing</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Delivered Orders
            </CardTitle>
            <HugeiconsIcon icon={CheckCircle}
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deliveredOrders}</div>
            <p className="text-xs text-muted-foreground">
              Successfully completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Orders Management</CardTitle>
          <CardDescription>
            View and manage all customer orders with comprehensive filtering and
            bulk actions.
            {filteredOrders.length > 0 && (
              <span className="block mt-1 text-xs">
                Showing {filteredOrders.length} orders with their associated
                items.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrdersTable
            orders={orders as any}
            allOrders={allOrders as any}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            statusFilter={orderStatusFilter}
            onStatusFilterChange={setOrderStatusFilter}
            paymentStatusFilter={paymentStatusFilter}
            onPaymentStatusFilterChange={setPaymentStatusFilter}
            pickerFilter={pickerFilter}
            onPickerFilterChange={setPickerFilter}
            pickers={pickerOptions}
            clearanceFilter={clearanceFilter}
            onClearanceFilterChange={setClearanceFilter}
            selectedIds={selectedOrderIds}
            onSelectedIdsChange={handleSelectedIdsChange}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onUpdatePaymentStatus={handleUpdatePaymentStatus}
            onDeleteOrder={handleDeleteOrder}
            onViewDetails={handleViewDetails}
            updateSingleOrderStatus={handleUpdateOrderStatus}
            updateSinglePaymentStatus={handleUpdatePaymentStatus}
            bulkUpdateOrderStatus={handleBulkUpdateOrderStatus}
            pagination={pagination}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
