import { v } from "convex/values";

// ─── ENUMS ──────────────────────────────────────────────────────────────

// Plain `as const` tuples, expanded at each use site with
// `v.union(...name.map((e) => v.literal(e)))`. Verified type-preserving:
// `_generated/dataModel.d.ts` is byte-identical before and after, so the
// wire format and every generated Doc type are unchanged.
//
// Exported through `@repo/backend/validators` so the apps can import the same
// tuples the database validates against, instead of hand-copying them as
// string literals the way `blink-rider/lib/constants.ts` does today.

export const agentEarningTypes = [
  "install",
  "registration",
  "fixed",
] as const;

export const agentPaymentRequestStatus = [
  "pending",
  "approved",
  "rejected",
  "paid",
] as const;

export const agentTransactionTypes = [
  "signup",
  "purchase",
] as const;

export const agentZoneEarningTypes = [
  "fixed",
  "per_conversion",
  "both",
] as const;

export const bannerPromoTypes = [
  "product",
  "brand",
  "blink",
] as const;

export const bannerTags = [
  "Featured",
  "Offer",
] as const;

export const bannerTextPositions = [
  "top-left",
  "top-right",
  "bottom-left",
] as const;

export const clearanceBatchStatus = [
  "Pending",
  "Assigned",
  "In Transit",
  "Completed",
] as const;

export const clearanceProductStatus = [
  "Active",
  "Inactive",
  "Sold Out",
  "Expired",
] as const;

export const commissionTypes = [
  "percentage",
  "fixed",
] as const;

export const importJobStatus = [
  "pending",
  "processing",
  "done",
  "failed",
] as const;

export const incentiveRoles = [
  "RIDER",
  "PICKER",
] as const;

export const lowercaseRecordStatus = [
  "active",
  "inactive",
] as const;

export const notificationReadStatus = [
  "read",
  "unread",
] as const;

export const notificationTypes = [
  "order_update",
  "delivery",
  "promotion",
  "system",
] as const;

export const orderPaymentStatus = [
  "Unpaid",
  "Paid",
  "Refunded",
] as const;

export const orderStatus = [
  "Pending",
  "Confirmed",
  "Processing",
  "Pickup",
  "Delivery",
  "Delivered",
  "Cancelled",
  "Refunded",
] as const;

export const payerTypes = [
  "customer",
  "receiver",
] as const;

export const paymentMethods = [
  "Card",
  "Mobile Money",
  "Mpesa",
  "Cash on Delivery",
  "Bank Transfer",
  "Paystack",
] as const;

export const paymentModes = [
  "pay_now",
  "pay_on_delivery",
] as const;

export const paymentStatus = [
  "Pending",
  "Successful",
  "Failed",
  "Refunded",
] as const;

export const paystackSubaccountKeys = [
  "primary",
  "secondary",
] as const;

export const pickerAssignmentTypes = [
  "order",
  "prescription",
] as const;

export const pickerStatus = [
  "Active",
  "On Order",
  "Inactive",
] as const;

export const prescriptionStatus = [
  "pending",
  "approved",
  "rejected",
] as const;

export const productStatus = [
  "Active",
  "Inactive",
  "Archived",
] as const;

export const productTags = [
  "Featured",
  "Offer",
  "Hot",
] as const;

export const pushPlatforms = [
  "ios",
  "android",
  "web",
] as const;

export const recordStatus = [
  "Active",
  "Inactive",
] as const;

export const riderStatus = [
  "Active",
  "On Delivery",
  "Inactive",
] as const;

export const shipmentStatus = [
  "Awaiting Pickup",
  "Picked Up",
  "Out for Delivery",
  "Delivered",
  "Failed Delivery",
] as const;

export const stockReservationStatus = [
  "Reserved",
  "PaidReserved",
  "Fulfilled",
  "Released",
] as const;

export const transactionPaymentMethods = [
  "Card",
  "Mobile Money",
] as const;

export const transactionStatus = [
  "pending",
  "successful",
  "failed",
  "refunded",
] as const;

export const transactionTypes = [
  "credit",
  "debit",
] as const;

export const vehicleTypes = [
  "Motorbike",
  "Bicycle",
  "Car",
  "Van",
] as const;
// ─── SHARED SHAPES ────────────────────────────────────────────────────────

// Object shapes that appeared verbatim in several tables. Extracting them is
// mechanical, but the reason is not cosmetic: the seven-weekday block below was
// written out four times, so a change to one copy silently diverged from the
// other three. `VendorsValidator.schedule.weeklySchedule` and
// `SchedulesValidator.weeklySchedule` had in fact already diverged — the second
// carries a required `enabled` the first does not — which is why there are two
// week shapes here rather than one. Unifying them would need a data migration,
// so the divergence is named and kept rather than papered over.

/** A vendor's opening hours for one day. */
const dayWindow = v.object({
  startTime: v.string(),
  endTime: v.string(),
});

/** A staff shift for one day. Same as `dayWindow` plus a required `enabled`. */
const scheduledDayWindow = v.object({
  startTime: v.string(),
  endTime: v.string(),
  enabled: v.boolean(),
});

/** Vendor opening hours, Monday through Sunday. Every day optional. */
export const weeklyOpeningHours = v.object({
  Monday: v.optional(dayWindow),
  Tuesday: v.optional(dayWindow),
  Wednesday: v.optional(dayWindow),
  Thursday: v.optional(dayWindow),
  Friday: v.optional(dayWindow),
  Saturday: v.optional(dayWindow),
  Sunday: v.optional(dayWindow),
});

/** Staff shift schedule, Monday through Sunday. Every day optional. */
export const weeklyShiftSchedule = v.object({
  Monday: v.optional(scheduledDayWindow),
  Tuesday: v.optional(scheduledDayWindow),
  Wednesday: v.optional(scheduledDayWindow),
  Thursday: v.optional(scheduledDayWindow),
  Friday: v.optional(scheduledDayWindow),
  Saturday: v.optional(scheduledDayWindow),
  Sunday: v.optional(scheduledDayWindow),
});

/**
 * Kenyan postal address, as stored on vendors, shipments and agent zones.
 *
 * Note `UsersValidator.address` and `ShipmentValidator.delivery_address` are
 * deliberately NOT this shape — they carry extra fields (`street`, `state`,
 * `postal_code`). Widening them to match would change what those tables accept.
 */
export const postalAddress = v.object({
  address_1: v.optional(v.string()),
  address_2: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
});

/** A bare coordinate pair. */
export const geoPoint = v.object({
  lat: v.float64(),
  lng: v.float64(),
});

/** A resolved place: human-readable address plus its coordinates. */
export const addressWithCoordinates = v.object({
  address: v.string(),
  lat: v.number(),
  lng: v.number(),
});

// ─── TABLES ─────────────────────────────────────────────────────────────

export const CartValidator = v.object({
  user_id: v.id("users"),
  products: v.array(
    v.object({
      product: v.id("products"),
      quantity: v.number(),
    }),
  ),
  updated_at: v.optional(v.number()),
});

export const WishListValidator = v.object({
  user_id: v.id("users"),
  products: v.array(v.id("products")),
  updated_at: v.optional(v.number()),
});

export const AddToCartValidator = v.object({
  product_id: v.id("products"),
  quantity: v.number(),
});

export const TransactionsValidator = v.object({
  reference: v.string(),
  order_id: v.id("orders"),
  amount: v.float64(),
  type: v.union(...transactionTypes.map((e) => v.literal(e))),
  status: v.union(...transactionStatus.map((e) => v.literal(e))),
  payment_method: v.union(...transactionPaymentMethods.map((e) => v.literal(e))),
  searchText: v.optional(v.string()),
  updated_at: v.optional(v.number()),
});

export const OrdersValidator = v.object({
  reference: v.string(),
  searchText: v.optional(v.string()),
  order_date: v.number(),
  rider_id: v.optional(v.id("users")),
  vendor_id: v.id("vendors"),
  user_id: v.id("users"),
  service_radius: v.number(),
  payment_mode: v.optional(
    v.union(...paymentModes.map((e) => v.literal(e))),
  ),
  order_status: v.union(...orderStatus.map((e) => v.literal(e))),
  payment_status: v.union(...orderPaymentStatus.map((e) => v.literal(e))),
  payment_method: v.union(...paymentMethods.map((e) => v.literal(e))),
  subtotal_amount: v.float64(),
  tax_amount: v.float64(),
  discount_amount: v.float64(),
  delivery_fee: v.float64(),
  total_amount: v.float64(),
  payment_reference: v.optional(v.string()),
  /**
   * Client-supplied de-duplication key.
   *
   * The prepaid finalisers guard against double submission by scanning
   * `by_payment_reference`, because a Paystack reference is unique per checkout.
   * Pay-on-delivery orders have no payment and set `payment_reference` to
   * undefined, so they had nothing to guard on — a double-tapped checkout
   * created duplicate orders.
   *
   * Optional so existing clients keep working; when supplied, the finaliser
   * scans `by_idempotency_key` and returns the already-created orders instead of
   * inserting again.
   */
  idempotency_key: v.optional(v.string()),
  delivery_code: v.optional(v.string()),
  delivery_code_verified: v.optional(v.boolean()),
  payment_collected_at: v.optional(v.number()),
  address: v.object({
    street: v.optional(v.string()),
    address_1: v.optional(v.string()),
    address_2: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    postal_code: v.optional(v.string()),
    country: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  }),
  receiver_contact: v.optional(
    v.object({
      name: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
    }),
  ),
  special_instructions: v.optional(v.string()),
  assigned_picker_id: v.optional(v.id("users")),
  confirmed_at: v.optional(v.number()),
  picked_up_at: v.optional(v.number()),
  rider_rating: v.optional(v.number()),
  updated_at: v.optional(v.number()),
  is_clearance: v.optional(v.boolean()),
  batch_id: v.optional(v.id("clearance_batches")),
});

export const OrderItemValidator = v.object({
  order_id: v.id("orders"),
  product_id: v.id("products"),
  vendor_id: v.id("vendors"),
  name: v.string(),
  sku: v.string(),
  quantity: v.number(),
  price: v.float64(),
  tax: v.float64(),
  discount: v.float64(),
  total: v.float64(),
  unit_type: v.optional(v.string()),
  unit_value: v.optional(v.float64()),
  barcodeVerified: v.optional(v.boolean()),
  barcodeVerifiedAt: v.optional(v.number()),
  is_picked: v.optional(v.boolean()),
  picked_quantity: v.optional(v.number()),
  requires_prescription: v.optional(v.boolean()),
  /**
   * The prescription that authorises this item.
   *
   * `requires_prescription` says an item needs one; this says WHICH one. Without
   * it a picker can be told an item needs a prescription check but not which
   * document to check, because prescriptions are keyed by customer + vendor and
   * were never linked to the item they authorise.
   *
   * Optional, and unset on every row created before this field existed —
   * `prescriptions.backfillOrderItemPrescriptions` fills those in.
   */
  prescription_id: v.optional(v.id("prescriptions")),
});

export const OrderItemWithoutOrderId = v.object({
  product_id: v.id("products"),
  vendor_id: v.id("vendors"),
  name: v.string(),
  sku: v.string(),
  quantity: v.number(),
  price: v.float64(),
  tax: v.float64(),
  discount: v.float64(),
  total: v.float64(),
  unit_type: v.optional(v.string()),
  unit_value: v.optional(v.float64()),
  barcodeVerified: v.optional(v.boolean()),
  barcodeVerifiedAt: v.optional(v.number()),
  is_picked: v.optional(v.boolean()),
  picked_quantity: v.optional(v.number()),
  requires_prescription: v.optional(v.boolean()), // Track if this item required prescription
  prescription_id: v.optional(v.id("prescriptions")),
});

export const OrderItemUpdateValidator = v.object({
  order_id: v.optional(v.id("orders")),
  product_id: v.optional(v.id("products")),
  vendor_id: v.optional(v.id("vendors")),
  name: v.optional(v.string()),
  sku: v.optional(v.string()),
  quantity: v.optional(v.number()),
  price: v.optional(v.number()),
  tax: v.optional(v.number()),
  discount: v.optional(v.number()),
  total: v.optional(v.number()),
  unit_type: v.optional(v.string()),
  unit_value: v.optional(v.float64()),
  barcodeVerified: v.optional(v.boolean()),
  barcodeVerifiedAt: v.optional(v.number()),
  is_picked: v.optional(v.boolean()),
  picked_quantity: v.optional(v.number()),
  requires_prescription: v.optional(v.boolean()), // Track if this item required prescription
  prescription_id: v.optional(v.id("prescriptions")),
});

export const UsersValidator = v.object({
  clerkId: v.string(),
  first_name: v.string(),
  last_name: v.string(),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.string(),
  phone: v.string(),
  searchText: v.optional(v.string()),
  address: addressWithCoordinates,
  rider_details: v.optional(
    v.object({
      vehicle_type: v.union(...vehicleTypes.map((e) => v.literal(e))),
      vehicle_plate: v.optional(v.string()),
      vendor_id: v.optional(v.id("vendors")),
      status: v.union(...riderStatus.map((e) => v.literal(e))),
      coordinates: v.optional(
        geoPoint,
      ),
      /**
       * When `coordinates` was recorded ON THE DEVICE, not when it was written.
       *
       * A background task batches points and delivers them late, so arrival
       * order is not fix order. Without this, a two-minute-old point queued
       * behind a tunnel overwrites the rider's current position.
       */
      location_updated_at: v.optional(v.number()),
      rating: v.optional(v.float64()),
      rating_count: v.optional(v.number()),
      id_image: v.optional(v.id("_storage")),
      license_image: v.optional(v.id("_storage")),
      is_overtime: v.optional(v.boolean()),
      is_clearance_rider: v.optional(v.boolean()),
    }),
  ),
  picker_details: v.optional(
    v.object({
      vendor_id: v.id("vendors"),
      status: v.union(...pickerStatus.map((e) => v.literal(e))),
      is_overtime: v.optional(v.boolean()),
    }),
  ),
  manager_details: v.optional(
    v.object({
      vendor_id: v.array(v.id("vendors")),
      assigned_at: v.optional(v.number()),
    }),
  ),
  status: v.optional(v.union(...recordStatus.map((e) => v.literal(e)))),
  notifications: v.optional(v.boolean()),
  push_token: v.optional(v.string()),
  role_id: v.optional(v.id("roles")),
  isStaff: v.optional(v.boolean()),
  updated_at: v.optional(v.number()),
});

export const UsersUpdateValidator = v.object({
  id: v.id("users"),
  clerkId: v.string(),
  first_name: v.optional(v.string()),
  last_name: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  searchText: v.optional(v.string()),
  address: v.optional(
    addressWithCoordinates,
  ),
  rider_details: v.optional(
    v.object({
      vehicle_type: v.union(...vehicleTypes.map((e) => v.literal(e))),
      vehicle_plate: v.optional(v.string()),
      vendor_id: v.optional(v.id("vendors")),
      status: v.union(...riderStatus.map((e) => v.literal(e))),
      coordinates: v.optional(
        geoPoint,
      ),
      /**
       * When `coordinates` was recorded ON THE DEVICE, not when it was written.
       *
       * A background task batches points and delivers them late, so arrival
       * order is not fix order. Without this, a two-minute-old point queued
       * behind a tunnel overwrites the rider's current position.
       */
      location_updated_at: v.optional(v.number()),
      rating: v.optional(v.float64()),
      id_image: v.optional(v.id("_storage")),
      license_image: v.optional(v.id("_storage")),
      is_overtime: v.optional(v.boolean()),
      is_clearance_rider: v.optional(v.boolean()),
    }),
  ),
  picker_details: v.optional(
    v.object({
      vendor_id: v.id("vendors"),
      status: v.union(...pickerStatus.map((e) => v.literal(e))),
      is_overtime: v.optional(v.boolean()),
    }),
  ),
  manager_details: v.optional(
    v.object({
      vendor_id: v.array(v.id("vendors")),
      assigned_at: v.optional(v.number()),
    }),
  ),
  status: v.optional(v.union(...recordStatus.map((e) => v.literal(e)))),
  notifications: v.optional(v.boolean()),
  push_token: v.optional(v.string()),
  role_id: v.optional(v.id("roles")),
  isStaff: v.optional(v.boolean()),
  updated_at: v.optional(v.number()),
});

export const ProductsValidator = v.object({
  images: v.optional(v.array(v.id("_storage"))),
  name: v.string(),
  slug: v.string(),
  sku: v.string(),
  searchText: v.optional(v.string()),
  upc: v.optional(v.number()),
  brand: v.optional(v.string()),
  category_id: v.id("categories"),
  description: v.optional(v.string()),
  status: v.union(...productStatus.map((e) => v.literal(e))),
  price: v.float64(),
  quantity: v.number(),
  unit_value: v.optional(v.float64()),
  unit_type: v.optional(v.string()),
  barcode: v.optional(v.string()),
  item_number: v.optional(v.string()),
  vendor_id: v.optional(v.id("vendors")),
  vendor_location: v.optional(
    addressWithCoordinates,
  ),
  tags: v.optional(
    v.array(
      v.union(...productTags.map((e) => v.literal(e))),
    ),
  ),
  requires_prescription: v.optional(v.boolean()),
  prescription_verified: v.optional(v.boolean()),
  external_id: v.optional(v.string()),
  created_at: v.optional(v.number()),
  updated_at: v.optional(v.number()),
});

export const ProductsUpdateValidator = v.object({
  id: v.id("products"),
  images: v.optional(v.array(v.id("_storage"))),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  sku: v.optional(v.string()),
  searchText: v.optional(v.string()),
  upc: v.optional(v.number()),
  brand: v.optional(v.string()),
  category_id: v.optional(v.id("categories")),
  description: v.optional(v.string()),
  status: v.optional(
    v.union(...productStatus.map((e) => v.literal(e))),
  ),
  price: v.optional(v.float64()),
  quantity: v.optional(v.number()),
  unit_value: v.optional(v.float64()),
  unit_type: v.optional(v.string()),
  barcode: v.optional(v.string()),
  item_number: v.optional(v.string()),
  vendor_id: v.optional(v.id("vendors")),
  vendor_location: v.optional(
    addressWithCoordinates,
  ),
  tags: v.optional(
    v.array(
      v.union(...productTags.map((e) => v.literal(e))),
    ),
  ),
  requires_prescription: v.optional(v.boolean()),
  prescription_verified: v.optional(v.boolean()),
  external_id: v.optional(v.string()),
  created_at: v.optional(v.number()),
  updated_at: v.optional(v.number()),
});

export const CategoriesValidator = v.object({
  industry: v.optional(v.id("industry")),
  name: v.string(),
  slug: v.string(),
  searchText: v.optional(v.string()),
  parent_category_id: v.optional(v.id("categories")),
  description: v.optional(v.string()),
  image: v.optional(v.id("_storage")),
  status: v.union(...lowercaseRecordStatus.map((e) => v.literal(e))),
  sort_order: v.number(),
  created_at: v.optional(v.number()),
  updated_at: v.optional(v.number()),
});

export const VendorsValidator = v.object({
  name: v.string(),
  industry_id: v.optional(v.id("industry")),
  image: v.optional(v.id("_storage")),
  searchText: v.optional(v.string()),
  contact: v.object({
    name: v.string(),
    phone: v.string(),
    email: v.string(),
  }),
  address: postalAddress,
  coordinates: geoPoint,
  service_center: v.optional(
    geoPoint,
  ),
  business_details: v.optional(
    v.object({
      business_name: v.string(),
      bank_code: v.string(),
      account_number: v.string(),
      paystack_subaccount_code: v.optional(v.string()),
      kra_pin: v.optional(v.string()),
    }),
  ),
  service_radius: v.number(),
  status: v.union(...recordStatus.map((e) => v.literal(e))),
  commission: v.float64(),
  commission_type: v.union(...commissionTypes.map((e) => v.literal(e))),
  hub_manager_id: v.optional(v.union(v.id("users"), v.null())),
  schedule: v.optional(
    v.object({
      is_fulltime: v.boolean(),
      weeklySchedule: v.optional(
        weeklyOpeningHours,
      ),
    }),
  ),
  updated_at: v.optional(v.number()),
});

export const VendorsUpdateValidator = v.object({
  id: v.id("vendors"),
  industry_id: v.optional(v.id("industry")),
  name: v.optional(v.string()),
  searchText: v.optional(v.string()),
  image: v.optional(v.id("_storage")),
  contact: v.optional(
    v.object({
      name: v.string(),
      phone: v.string(),
      email: v.string(),
    }),
  ),
  address: v.optional(
    postalAddress,
  ),
  coordinates: v.optional(
    geoPoint,
  ),
  service_center: v.optional(
    geoPoint,
  ),
  business_details: v.optional(
    v.object({
      business_name: v.string(),
      bank_code: v.string(),
      account_number: v.string(),
      paystack_subaccount_code: v.optional(v.string()),
      kra_pin: v.optional(v.string()),
    }),
  ),
  service_radius: v.optional(v.number()),
  status: v.optional(v.union(...recordStatus.map((e) => v.literal(e)))),
  commission: v.optional(v.float64()),
  commission_type: v.optional(
    v.union(...commissionTypes.map((e) => v.literal(e))),
  ),
  hub_manager_id: v.optional(v.union(v.id("users"), v.null())),
  schedule: v.optional(
    v.object({
      is_fulltime: v.boolean(),
      weeklySchedule: v.optional(
        weeklyOpeningHours,
      ),
    }),
  ),
  updated_at: v.optional(v.number()),
});

export const IndustryValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  image: v.optional(v.id("_storage")),
  status: v.union(...recordStatus.map((e) => v.literal(e))),
  bank_details: v.optional(
    v.object({
      business_name: v.string(),
      bank_code: v.string(),
      account_number: v.string(),
      paystack_subaccount_code: v.optional(v.string()),
      kra_pin: v.optional(v.string()),
    }),
  ),
  searchText: v.optional(v.string()),
  updated_at: v.optional(v.string()),
});

export const IndustryUpdateValidator = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.id("_storage")),
  status: v.optional(v.union(...recordStatus.map((e) => v.literal(e)))),
  bank_details: v.optional(
    v.object({
      business_name: v.string(),
      bank_code: v.string(),
      account_number: v.string(),
      paystack_subaccount_code: v.optional(v.string()),
      kra_pin: v.optional(v.string()),
    }),
  ),
  searchText: v.optional(v.string()),
  updated_at: v.optional(v.string()),
});

export const PaystackSubaccountValidator = v.object({
  key: v.union(...paystackSubaccountKeys.map((e) => v.literal(e))),
  business_name: v.string(),
  bank_code: v.string(),
  account_number: v.string(),
  subaccount_code: v.string(),
  raw: v.optional(v.any()),
  created_at: v.number(),
  updated_at: v.number(),
});

export const AddressValidator = v.object({
  user_id: v.id("users"),
  addresses: v.array(
    v.object({
      label: v.string(),
      address: postalAddress,
      coordinates: geoPoint,
      is_default: v.boolean(),
      status: v.union(...recordStatus.map((e) => v.literal(e))),
      created_at: v.number(),
      updated_at: v.optional(v.number()),
    }),
  ),
  created_at: v.number(),
  updated_at: v.optional(v.number()),
});

export const ShipmentValidator = v.object({
  order_id: v.id("orders"),
  vendor_id: v.id("vendors"),
  rider_id: v.id("users"),
  searchText: v.optional(v.string()),
  pickup_address: postalAddress,
  delivery_address: v.object({
    address_1: v.optional(v.string()),
    address_2: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    state: v.optional(v.string()),
    postal_code: v.optional(v.string()),
    street: v.optional(v.string()),
    lat: v.optional(v.float64()),
    lng: v.optional(v.float64()),
  }),
  status: v.union(...shipmentStatus.map((e) => v.literal(e))),
  updated_at: v.number(),
});

export const PaymentsValidator = v.object({
  order_id: v.optional(v.id("orders")),
  user_id: v.id("users"),
  customerEmail: v.string(),
  searchText: v.optional(v.string()),
  payment_method: v.union(...paymentMethods.map((e) => v.literal(e))),
  amount: v.float64(),
  reference: v.string(),
  paystackResponse: v.optional(v.any()),
  paystack_split_code: v.optional(v.string()),
  paystack_split_breakdown: v.optional(
    v.object({
      total_minor: v.number(),
      commission_minor: v.number(),
      delivery_fee_minor: v.number(),
      vendor_minor: v.number(),
      vendor_id: v.optional(v.id("vendors")),
      vendors: v.optional(
        v.array(
          v.object({
            vendor_id: v.id("vendors"),
            vendor_minor: v.number(),
            commission_minor: v.number(),
            gross_minor: v.number(),
          }),
        ),
      ),
      split_code: v.optional(v.string()),
    }),
  ),
  payer_phone: v.optional(v.string()),
  payer_type: v.optional(v.union(...payerTypes.map((e) => v.literal(e)))),
  payment_date: v.number(),
  status: v.union(...paymentStatus.map((e) => v.literal(e))),
  updated_at: v.number(),
});

export const StockReservationValidator = v.object({
  product_id: v.id("products"),
  order_reference: v.string(),
  quantity_reserved: v.number(),
  status: v.union(...stockReservationStatus.map((e) => v.literal(e))),
  reserved_at: v.number(),
  expires_at: v.optional(v.number()),
  confirmed_at: v.optional(v.number()),
  fulfilled_at: v.optional(v.number()),
});

export const NotificationsValidator = v.object({
  user_id: v.id("users"),
  type: v.union(...notificationTypes.map((e) => v.literal(e))),
  status: v.union(...notificationReadStatus.map((e) => v.literal(e))),
  title: v.string(),
  message: v.string(),
  data: v.optional(v.any()),
  read_at: v.optional(v.number()),
  created_at: v.number(),
  updated_at: v.number(),
});

export const PushTokensValidator = v.object({
  user_id: v.id("users"),
  token: v.string(),
  platform: v.union(...pushPlatforms.map((e) => v.literal(e))),
  device_id: v.optional(v.string()),
  enabled: v.boolean(),
  last_seen: v.optional(v.number()),
  updated_at: v.optional(v.number()),
});

export const IncentiveConfigValidator = v.object({
  role: v.union(...incentiveRoles.map((e) => v.literal(e))),
  threshold_daily: v.number(),
  bonus_per_extra_daily: v.float64(),
  currency: v.optional(v.string()),
  effective_from: v.number(),
  updated_at: v.number(),
  created_at: v.number(),
});

export const UserIncentiveTargetValidator = v.object({
  user_id: v.id("users"),
  role: v.union(...incentiveRoles.map((e) => v.literal(e))),
  daily_target: v.number(),
  weekly_target: v.number(),
  monthly_target: v.number(),
  week_start: v.number(),
  month_start: v.number(),
  updated_at: v.number(),
});

export const PickerActivityValidator = v.object({
  picker_id: v.id("users"),
  order_id: v.id("orders"),
  items_picked: v.number(),
  day_bucket: v.number(),
  created_at: v.number(),
});

export const BaseEarningsValidator = v.object({
  role: v.union(...incentiveRoles.map((e) => v.literal(e))),
  monthly_base_amount: v.float64(),
  currency: v.optional(v.string()),
  effective_from: v.number(),
  updated_at: v.number(),
  created_at: v.number(),
});

export const BannersValidator = v.object({
  image: v.id("_storage"),
  header: v.optional(v.string()),
  sub_header: v.optional(v.string()),
  cta_text: v.optional(v.string()),
  promo_type: v.optional(
    v.union(...bannerPromoTypes.map((e) => v.literal(e))),
  ),
  product_id: v.optional(v.id("products")),
  brand: v.optional(v.string()),
  categoryId: v.optional(v.id("categories")),
  status: v.union(...lowercaseRecordStatus.map((e) => v.literal(e))),
  start_date: v.number(),
  end_date: v.number(),
  textOverlayPos: v.optional(
    v.union(...bannerTextPositions.map((e) => v.literal(e))),
  ),
  created_at: v.optional(v.number()),
  updated_at: v.optional(v.number()),
});

export const BannersUpdateValidator = v.object({
  id: v.id("banners"),
  image: v.optional(v.id("_storage")),
  header: v.optional(v.string()),
  sub_header: v.optional(v.string()),
  cta_text: v.optional(v.string()),
  promo_type: v.optional(
    v.union(...bannerPromoTypes.map((e) => v.literal(e))),
  ),
  product_id: v.optional(v.id("products")),
  brand: v.optional(v.string()),
  categoryId: v.optional(v.id("categories")),
  status: v.optional(v.union(...lowercaseRecordStatus.map((e) => v.literal(e)))),
  start_date: v.optional(v.number()),
  end_date: v.optional(v.number()),
  textOverlayPos: v.optional(
    v.union(...bannerTextPositions.map((e) => v.literal(e))),
  ),
  updated_at: v.optional(v.number()),
});

export const SchedulesValidator = v.object({
  userId: v.id("users"),
  vendorId: v.optional(v.id("vendors")),
  weeklySchedule: weeklyShiftSchedule,
  updated_at: v.optional(v.number()),
});

export const ScheduleUpdateValidator = v.object({
  id: v.id("schedules"),
  userId: v.optional(v.id("users")),
  vendorId: v.optional(v.id("vendors")),
  weeklySchedule: v.optional(
    weeklyShiftSchedule,
  ),
  updated_at: v.optional(v.number()),
});

export const PrescriptionValidator = v.object({
  user_id: v.id("users"),
  vendor_id: v.id("vendors"),
  prescription_document: v.id("_storage"),
  status: v.union(...prescriptionStatus.map((e) => v.literal(e))),
  notes: v.optional(v.string()),
  rejection_reason_id: v.optional(v.id("prescriptionRejectionReasons")),
  assigned_picker_id: v.optional(v.id("users")),
  uploaded_at: v.number(),
});

export const PickerAssignmentValidator = v.object({
  vendor_id: v.id("vendors"),
  picker_id: v.id("users"),
  order_id: v.optional(v.id("orders")),
  prescription_id: v.optional(v.id("prescriptions")),
  type: v.union(...pickerAssignmentTypes.map((e) => v.literal(e))),
  assigned_at: v.number(),
});

export const PrescriptionRejectionReasonValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  is_active: v.boolean(),
  is_system_default: v.boolean(),
  created_by: v.optional(v.id("users")),
  created_at: v.number(),
  updated_at: v.optional(v.number()),
});

export const PrescriptionRejectionReasonUpdateValidator = v.object({
  id: v.id("prescriptionRejectionReasons"),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  is_active: v.optional(v.boolean()),
  updated_at: v.optional(v.number()),
});

export const AgentsValidator = v.object({
  user_id: v.id("users"),
  scans: v.optional(v.number()),
  code: v.string(),
  installs: v.optional(v.number()),
  registerations: v.optional(v.number()),
  searchText: v.optional(v.string()),
  // Commission fields
  zone_id: v.optional(v.id("agent_zones")),
  mpesa_number: v.optional(v.string()),
  paystack_recipient_code: v.optional(v.string()),
  balance: v.optional(v.number()),
  total_earned: v.optional(v.number()),
  total_paid: v.optional(v.number()),
});

export const AgentsUpdateValidator = v.object({
  id: v.id("agents"),
  user_id: v.optional(v.id("users")),
  code: v.optional(v.string()),
  scans: v.optional(v.number()),
  installs: v.optional(v.number()),
  registerations: v.optional(v.number()),
  zone_id: v.optional(v.id("agent_zones")),
  mpesa_number: v.optional(v.string()),
  paystack_recipient_code: v.optional(v.string()),
  balance: v.optional(v.number()),
  total_earned: v.optional(v.number()),
  total_paid: v.optional(v.number()),
});

export const AgentZonesValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  earning_type: v.union(...agentZoneEarningTypes.map((e) => v.literal(e))),
  fixed_amount: v.optional(v.number()),
  min_installs: v.optional(v.number()),
  min_registrations: v.optional(v.number()),
  install_commission_enabled: v.optional(v.boolean()),
  install_commission_rate: v.optional(v.number()),
  registration_commission_enabled: v.optional(v.boolean()),
  registration_commission_rate: v.optional(v.number()),
  searchText: v.optional(v.string()),
});

export const AgentEarningsValidator = v.object({
  agent_id: v.id("agents"),
  type: v.union(...agentEarningTypes.map((e) => v.literal(e))),
  amount: v.number(),
  zone_id: v.optional(v.id("agent_zones")),
  created_at: v.number(),
});

export const AgentPaymentRequestsValidator = v.object({
  agent_id: v.id("agents"),
  amount: v.number(),
  status: v.union(...agentPaymentRequestStatus.map((e) => v.literal(e))),
  paystack_transfer_code: v.optional(v.string()),
  paystack_reference: v.optional(v.string()),
  rejection_reason: v.optional(v.string()),
  requested_at: v.number(),
  processed_at: v.optional(v.number()),
  processed_by: v.optional(v.id("users")),
});

// ── Roles ──────────────────────────────────────────────────────
export const RolesValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  permissions: v.array(v.string()),
  is_default: v.boolean(),
  manages_vendor: v.boolean(),
  search_text: v.optional(v.string()),
});

// ── Platform Settings ──────────────────────────────────────────
export const PlatformSettingsValidator = v.object({
  key: v.string(),
  value: v.string(),
  description: v.optional(v.string()),
  updated_by: v.optional(v.id("users")),
  updated_at: v.optional(v.number()),
});

// ── Clearance Products ─────────────────────────────────────────
export const ClearanceProductValidator = v.object({
  name: v.string(),
  slug: v.string(),
  sku: v.string(),
  searchText: v.optional(v.string()),
  images: v.optional(v.array(v.id("_storage"))),
  barcode: v.optional(v.string()),
  item_number: v.optional(v.string()),
  brand: v.optional(v.string()),
  category_id: v.id("categories"),
  industry_id: v.optional(v.id("industry")),
  vendor_id: v.id("vendors"),
  original_price: v.float64(),
  clearance_price: v.float64(),
  discount_percentage: v.float64(),
  quantity: v.number(),
  expiry_date: v.number(),
  display_end_date: v.number(),
  status: v.union(...clearanceProductStatus.map((e) => v.literal(e))),
  unit_value: v.optional(v.float64()),
  unit_type: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.union(...bannerTags.map((e) => v.literal(e))))),
  created_at: v.number(),
  updated_at: v.optional(v.number()),
  created_by: v.optional(v.id("users")),
});

export const ClearanceProductUpdateValidator = v.object({
  id: v.id("clearance_products"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  sku: v.optional(v.string()),
  searchText: v.optional(v.string()),
  images: v.optional(v.array(v.id("_storage"))),
  barcode: v.optional(v.string()),
  item_number: v.optional(v.string()),
  brand: v.optional(v.string()),
  category_id: v.optional(v.id("categories")),
  industry_id: v.optional(v.id("industry")),
  vendor_id: v.optional(v.id("vendors")),
  original_price: v.optional(v.float64()),
  clearance_price: v.optional(v.float64()),
  discount_percentage: v.optional(v.float64()),
  quantity: v.optional(v.number()),
  expiry_date: v.optional(v.number()),
  display_end_date: v.optional(v.number()),
  status: v.optional(
    v.union(...clearanceProductStatus.map((e) => v.literal(e))),
  ),
  unit_value: v.optional(v.float64()),
  unit_type: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.union(...bannerTags.map((e) => v.literal(e))))),
  updated_at: v.optional(v.number()),
});

// ── Clearance Cart ─────────────────────────────────────────────
export const ClearanceCartValidator = v.object({
  user_id: v.id("users"),
  items: v.array(
    v.object({
      clearance_product_id: v.id("clearance_products"),
      quantity: v.number(),
    }),
  ),
  updated_at: v.optional(v.number()),
});

// ── Legal Acceptances ────────────────────────────────────────
export const LegalAcceptanceValidator = v.object({
  user_id: v.id("users"),
  accepted_at: v.number(),
  terms_version: v.string(),
  privacy_version: v.string(),
  eula_version: v.optional(v.string()),
  transaction_type: v.optional(
    v.union(...agentTransactionTypes.map((e) => v.literal(e))),
  ),
});

// ── Clearance Order Items ──────────────────────────────────────
export const ClearanceOrderItemValidator = v.object({
  order_id: v.id("orders"),
  clearance_product_id: v.id("clearance_products"),
  vendor_id: v.id("vendors"),
  name: v.string(),
  sku: v.string(),
  quantity: v.number(),
  original_price: v.float64(),
  clearance_price: v.float64(),
  discount_percentage: v.float64(),
  tax: v.float64(),
  total: v.float64(),
  unit_type: v.optional(v.string()),
  unit_value: v.optional(v.float64()),
  barcodeVerified: v.optional(v.boolean()),
  barcodeVerifiedAt: v.optional(v.number()),
  is_picked: v.optional(v.boolean()),
  picked_quantity: v.optional(v.number()),
});

// ── Clearance Batches ──────────────────────────────────────────
export const ClearanceBatchValidator = v.object({
  vendor_id: v.id("vendors"),
  order_ids: v.array(v.id("orders")),
  rider_id: v.optional(v.id("users")),
  status: v.union(...clearanceBatchStatus.map((e) => v.literal(e))),
  created_at: v.number(),
  assigned_at: v.optional(v.number()),
});

// ── Import Jobs ────────────────────────────────────────────────
export const ImportJobsValidator = v.object({
  type: v.literal("products"),
  status: v.union(...importJobStatus.map((e) => v.literal(e))),
  total: v.number(),
  processed: v.number(),
  success: v.number(),
  failed: v.number(),
  errors: v.array(v.string()),
  file_storage_id: v.id("_storage"),
  vendor_id: v.optional(v.id("vendors")),
  created_at: v.number(),
  updated_at: v.number(),
});
