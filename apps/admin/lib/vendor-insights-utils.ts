import { formatKES } from "./utils";

export interface VendorData {
  _id: string;
  name: string;
  commission: number;
  commission_type: "percentage" | "fixed";
  status: "Active" | "Inactive";
  contact: {
    name: string;
    phone: string;
    email: string;
  };
}

export interface OrderData {
  _id: string;
  vendor_id: string;
  total_amount: number;
  subtotal_amount: number;
  order_status: string;
  payment_status: string;
  order_date: number;
  user_id: string;
}

export interface OrderItemData {
  _id: string;
  order_id: string;
  product_id: string;
  vendor_id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface VendorInsightSummary {
  totalOrders: number;
  totalCheckouts: number;
  totalAmount: number;
  totalSubtotal: number;
  commissionEarned: number;
  avgOrderValue: number;
  conversionRate: number;
}

export interface ProductSummary {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  orders: number;
}

/**
 * Calculate commission based on vendor settings
 */
export const calculateCommission = (
  vendor: VendorData,
  totalSubtotal: number,
  totalOrders: number
): number => {
  if (vendor.commission_type === "percentage") {
    return (totalSubtotal * vendor.commission) / 100;
  } else if (vendor.commission_type === "fixed") {
    return totalOrders * vendor.commission;
  }
  return 0;
};

/**
 * Calculate successful checkouts (orders that were confirmed and processed)
 */
export const calculateSuccessfulCheckouts = (orders: OrderData[]): number => {
  const successfulStatuses = ["Confirmed", "Processing", "Pickup", "Delivery", "Delivered"];
  return orders.filter(order => successfulStatuses.includes(order.order_status)).length;
};

/**
 * Calculate conversion rate
 */
export const calculateConversionRate = (totalCheckouts: number, totalOrders: number): number => {
  return totalOrders > 0 ? (totalCheckouts / totalOrders) * 100 : 0;
};

/**
 * Group orders by status
 */
export const groupOrdersByStatus = (orders: OrderData[]): Record<string, number> => {
  return orders.reduce((acc, order) => {
    acc[order.order_status] = (acc[order.order_status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

/**
 * Group orders by payment status
 */
export const groupOrdersByPaymentStatus = (orders: OrderData[]): Record<string, number> => {
  return orders.reduce((acc, order) => {
    acc[order.payment_status] = (acc[order.payment_status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

/**
 * Calculate product performance metrics
 */
export const calculateTopProducts = (orderItems: OrderItemData[], limit: number = 5): ProductSummary[] => {
  const productSales = orderItems.reduce((acc, item) => {
    const key = item.product_id;
    if (!acc[key]) {
      acc[key] = {
        productId: item.product_id,
        name: item.name,
        quantity: 0,
        revenue: 0,
        orders: 0
      };
    }
    acc[key].quantity += item.quantity;
    acc[key].revenue += item.total;
    acc[key].orders += 1;
    return acc;
  }, {} as Record<string, ProductSummary>);

  return Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
};

/**
 * Calculate sales trend by date
 */
export const calculateSalesTrend = (orders: OrderData[]): Array<{
  date: string;
  orders: number;
  revenue: number;
}> => {
  const salesByDate = orders.reduce((acc, order) => {
    const date = new Date(order.order_date).toISOString().slice(0, 10);
    if (!acc[date]) {
      acc[date] = {
        date,
        orders: 0,
        revenue: 0
      };
    }
    acc[date].orders += 1;
    acc[date].revenue += order.total_amount;
    return acc;
  }, {} as Record<string, any>);

  return Object.values(salesByDate).sort((a: any, b: any) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
};

/**
 * Format commission display text
 */
export const formatCommissionText = (vendor: VendorData): string => {
  if (vendor.commission_type === "percentage") {
    return `${vendor.commission}%`;
  } else if (vendor.commission_type === "fixed") {
    return `${formatKES(vendor.commission)} per order`;
  }
  return "Not set";
};

/**
 * Get time range display text
 */
export const getTimeRangeDisplayText = (range: string): string => {
  const timeRangeMap: Record<string, string> = {
    all: "All Time",
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "This Week",
    lastWeek: "Last Week",
    thisMonth: "This Month",
    lastMonth: "Last Month",
    thisYear: "This Year",
    lastYear: "Last Year",
  };
  return timeRangeMap[range] || "Unknown Range";
};

/**
 * Calculate percentage change between two values
 */
export const calculatePercentageChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Format percentage with sign
 */
export const formatPercentageChange = (percentage: number): string => {
  const sign = percentage > 0 ? "+" : "";
  return `${sign}${percentage.toFixed(1)}%`;
};

/**
 * Get status color class for order status
 */
export const getOrderStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Confirmed: "bg-blue-100 text-blue-800 border-blue-200",
    Processing: "bg-purple-100 text-purple-800 border-purple-200",
    Pickup: "bg-orange-100 text-orange-800 border-orange-200",
    Delivery: "bg-indigo-100 text-indigo-800 border-indigo-200",
    Delivered: "bg-green-100 text-green-800 border-green-200",
    Cancelled: "bg-red-100 text-red-800 border-red-200",
    Refunded: "bg-gray-100 text-gray-800 border-gray-200",
  };
  return statusColors[status] || "bg-gray-100 text-gray-800 border-gray-200";
};

/**
 * Get payment status color class
 */
export const getPaymentStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    Paid: "bg-green-100 text-green-800 border-green-200",
    Unpaid: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Refunded: "bg-red-100 text-red-800 border-red-200",
  };
  return statusColors[status] || "bg-gray-100 text-gray-800 border-gray-200";
};

/**
 * Calculate average order value
 */
export const calculateAverageOrderValue = (totalAmount: number, totalOrders: number): number => {
  return totalOrders > 0 ? totalAmount / totalOrders : 0;
};

/**
 * Generate vendor insights summary
 */
export const generateVendorInsightsSummary = (
  vendor: VendorData,
  orders: OrderData[],
  orderItems: OrderItemData[]
): VendorInsightSummary => {
  const totalOrders = orders.length;
  const totalAmount = orders.reduce((sum, order) => sum + order.total_amount, 0);
  const totalSubtotal = orders.reduce((sum, order) => sum + order.subtotal_amount, 0);
  const totalCheckouts = calculateSuccessfulCheckouts(orders);
  const commissionEarned = calculateCommission(vendor, totalSubtotal, totalOrders);
  const avgOrderValue = calculateAverageOrderValue(totalAmount, totalOrders);
  const conversionRate = calculateConversionRate(totalCheckouts, totalOrders);

  return {
    totalOrders,
    totalCheckouts,
    totalAmount,
    totalSubtotal,
    commissionEarned,
    avgOrderValue,
    conversionRate
  };
};
