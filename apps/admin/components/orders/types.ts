import type { Id } from "@repo/backend/dataModel";

export type Order = {
  _id: Id<"orders">;
  reference: string;
  order_date: number;
  vendor_id: Id<"vendors">;
  user_id: Id<"users">;
  order_status:
    | "Pending"
    | "Confirmed"
    | "Processing"
    | "Pickup"
    | "Delivery"
    | "Delivered"
    | "Cancelled"
    | "Refunded";
  payment_status: "Unpaid" | "Paid" | "Refunded";
  payment_method:
    | "Card"
    | "Mobile Money"
    | "Cash on Delivery"
    | "Bank Transfer"
    | "Paystack";
  subtotal_amount: number;
  tax_amount: number;
  discount_amount: number;
  delivery_fee: number;
  total_amount: number;
  address: {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  special_instructions?: string;
  // Additional fields that might come from joins
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  vendor_name?: string;
  rider_id?: Id<"users">;
  rider_name?: string;
  assigned_picker_id?: Id<"users">;
  picker_name?: string;
  confirmed_at?: number;
  picked_up_at?: number;
  payment_reference?: string;
  updated_at?: number;
  _creationTime: number;
};

export type OrderStatus = Order["order_status"];
export type PaymentStatus = Order["payment_status"];
export type PaymentMethod = Order["payment_method"];

export interface OrdersPagination {
  hasNext: boolean;
  hasPrevious: boolean;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  total: number;
  cursor: string | null;
}

export interface OrderItem {
  _id: Id<"order_items">;
  order_id: Id<"orders">;
  product_id: Id<"products">;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  product?: {
    _id: Id<"products">;
    name: string;
    description?: string;
    image?: string;
    price: number;
    category?: string;
    brand?: string;
    sku: string;
    stock_quantity?: number;
    status?: "Active" | "Inactive" | "Out of Stock";
    vendor_id: Id<"vendors">;
    _creationTime: number;
  } | null;
}

// Status color mappings
export const ORDER_STATUS_COLORS = {
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  Processing: "bg-purple-100 text-purple-800 border-purple-200",
  Pickup: "bg-orange-100 text-orange-800 border-orange-200",
  Delivery: "bg-indigo-100 text-indigo-800 border-indigo-200",
  Delivered: "bg-green-100 text-green-800 border-green-200",
  Cancelled: "bg-red-100 text-red-800 border-red-200",
  Refunded: "bg-gray-100 text-gray-800 border-gray-200",
} as const;

export const PAYMENT_STATUS_COLORS = {
  Unpaid: "bg-red-100 text-red-800 border-red-200",
  Paid: "bg-green-100 text-green-800 border-green-200",
  Refunded: "bg-gray-100 text-gray-800 border-gray-200",
} as const;

// Available statuses for dropdowns
export const ORDER_STATUSES: OrderStatus[] = [
  "Pending",
  "Confirmed",
  "Processing",
  "Pickup",
  "Delivery",
  "Delivered",
  "Cancelled",
  "Refunded",
];

export const PAYMENT_STATUSES: PaymentStatus[] = ["Unpaid", "Paid", "Refunded"];
