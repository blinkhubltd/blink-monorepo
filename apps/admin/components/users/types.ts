import type { Id } from "@repo/backend/dataModel";

/** Legacy role — kept for backward compatibility with existing DB field. */
export type UserRole =
  | "ADMIN"
  | "GENERAL MANAGER"
  | "HUB MANAGER"
  | "VENDOR CONTACT"
  | "CUSTOMER"
  | "PICKER"
  | "RIDER";

export type User = {
  _id: Id<"users">;
  _creationTime: number;
  clerkId: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  image?: string;
  email: string;
  phone: string;
  role?: UserRole;
  role_id?: Id<"roles">;
  manager_details?: {
    vendor_id: Id<"vendors">[];
    assigned_at?: number;
  };
  picker_details?: {
    vendor_id: Id<"vendors">;
    status: "Active" | "On Order" | "Inactive";
  };
  rider_details?: {
    vehicle_type: "Motorbike" | "Bicycle" | "Car" | "Van";
    vehicle_plate?: string;
    vendor_id?: Id<"vendors">;
    status: "Active" | "On Delivery" | "Inactive";
    coordinates?: {
      lat: number;
      lng: number;
    };
    rating?: number;
  };
  address: {
    address: string;
    lat: number;
    lng: number;
  };
  status?: "Active" | "Inactive";
  searchText?: string;
  updated_at?: number;
};

export interface UsersPagination {
  hasNext: boolean;
  hasPrevious?: boolean;
  totalPages: number;
  currentPage?: number;
  pageSize?: number;
  total: number;
  cursor?: string | null;
}

export interface UsersTableProps {
  users: User[];
  allUsers: User[];
  isLoading?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onUpdateUserStatus?: (
    userId: Id<"users">,
    status: "Active" | "Inactive",
  ) => Promise<void>;
  pagination?: UsersPagination;
  onPageChange?: (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export const USER_STATUSES = ["Active", "Inactive"] as const;

export const STATUS_COLORS = {
  Active: "bg-green-100 text-green-800 border-green-200",
  Inactive: "bg-red-100 text-red-800 border-red-200",
} as const;
