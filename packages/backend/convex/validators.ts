import { v } from "convex/values";

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

export const CartUpdateValidator = v.object({
  products: v.optional(
    v.array(
      v.object({
        product: v.id("products"),
        quantity: v.number(),
      }),
    ),
  ),
  updated_at: v.optional(v.number()),
});

export const TransactionsValidator = v.object({
  reference: v.string(),
  order_id: v.id("orders"),
  amount: v.float64(),
  type: v.union(v.literal("credit"), v.literal("debit")),
  status: v.union(
    v.literal("pending"),
    v.literal("successful"),
    v.literal("failed"),
    v.literal("refunded"),
  ),
  payment_method: v.union(v.literal("Card"), v.literal("Mobile Money")),
  searchText: v.optional(v.string()),
  updated_at: v.optional(v.number()),
});

export const TransactionsUpdateValidator = v.object({
  id: v.id("transactions"),
  reference: v.optional(v.string()),
  order_id: v.optional(v.id("orders")),
  amount: v.optional(v.float64()),
  type: v.optional(v.union(v.literal("credit"), v.literal("debit"))),
  status: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("successful"),
      v.literal("failed"),
      v.literal("refunded"),
    ),
  ),
  payment_method: v.optional(
    v.union(v.literal("Card"), v.literal("Mobile Money")),
  ),
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
    v.union(v.literal("pay_now"), v.literal("pay_on_delivery")),
  ),
  order_status: v.union(
    v.literal("Pending"),
    v.literal("Confirmed"),
    v.literal("Processing"),
    v.literal("Pickup"),
    v.literal("Delivery"),
    v.literal("Delivered"),
    v.literal("Cancelled"),
    v.literal("Refunded"),
  ),
  payment_status: v.union(
    v.literal("Unpaid"),
    v.literal("Paid"),
    v.literal("Refunded"),
  ),
  payment_method: v.union(
    v.literal("Card"),
    v.literal("Mobile Money"),
    // Legacy client value
    v.literal("Mpesa"),
    v.literal("Cash on Delivery"),
    v.literal("Bank Transfer"),
    v.literal("Paystack"),
  ),
  subtotal_amount: v.float64(),
  tax_amount: v.float64(),
  discount_amount: v.float64(),
  delivery_fee: v.float64(),
  total_amount: v.float64(),
  payment_reference: v.optional(v.string()),
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
  address: v.object({
    address: v.string(),
    lat: v.number(),
    lng: v.number(),
  }),
  rider_details: v.optional(
    v.object({
      vehicle_type: v.union(
        v.literal("Motorbike"),
        v.literal("Bicycle"),
        v.literal("Car"),
        v.literal("Van"),
      ),
      vehicle_plate: v.optional(v.string()),
      vendor_id: v.optional(v.id("vendors")),
      status: v.union(
        v.literal("Active"),
        v.literal("On Delivery"),
        v.literal("Inactive"),
      ),
      coordinates: v.optional(
        v.object({
          lat: v.float64(),
          lng: v.float64(),
        }),
      ),
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
      status: v.union(
        v.literal("Active"),
        v.literal("On Order"),
        v.literal("Inactive"),
      ),
      is_overtime: v.optional(v.boolean()),
    }),
  ),
  manager_details: v.optional(
    v.object({
      vendor_id: v.array(v.id("vendors")),
      assigned_at: v.optional(v.number()),
    }),
  ),
  status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
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
    v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
    }),
  ),
  rider_details: v.optional(
    v.object({
      vehicle_type: v.union(
        v.literal("Motorbike"),
        v.literal("Bicycle"),
        v.literal("Car"),
        v.literal("Van"),
      ),
      vehicle_plate: v.optional(v.string()),
      vendor_id: v.optional(v.id("vendors")),
      status: v.union(
        v.literal("Active"),
        v.literal("On Delivery"),
        v.literal("Inactive"),
      ),
      coordinates: v.optional(
        v.object({
          lat: v.float64(),
          lng: v.float64(),
        }),
      ),
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
      status: v.union(
        v.literal("Active"),
        v.literal("On Order"),
        v.literal("Inactive"),
      ),
      is_overtime: v.optional(v.boolean()),
    }),
  ),
  manager_details: v.optional(
    v.object({
      vendor_id: v.array(v.id("vendors")),
      assigned_at: v.optional(v.number()),
    }),
  ),
  status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
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
  status: v.union(
    v.literal("Active"),
    v.literal("Inactive"),
    v.literal("Archived"),
  ),
  price: v.float64(),
  quantity: v.number(),
  unit_value: v.optional(v.float64()),
  unit_type: v.optional(v.string()),
  barcode: v.optional(v.string()),
  item_number: v.optional(v.string()),
  vendor_id: v.optional(v.id("vendors")),
  vendor_location: v.optional(
    v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
    }),
  ),
  tags: v.optional(
    v.array(
      v.union(v.literal("Featured"), v.literal("Offer"), v.literal("Hot")),
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
    v.union(v.literal("Active"), v.literal("Inactive"), v.literal("Archived")),
  ),
  price: v.optional(v.float64()),
  quantity: v.optional(v.number()),
  unit_value: v.optional(v.float64()),
  unit_type: v.optional(v.string()),
  barcode: v.optional(v.string()),
  item_number: v.optional(v.string()),
  vendor_id: v.optional(v.id("vendors")),
  vendor_location: v.optional(
    v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
    }),
  ),
  tags: v.optional(
    v.array(
      v.union(v.literal("Featured"), v.literal("Offer"), v.literal("Hot")),
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
  status: v.union(v.literal("active"), v.literal("inactive")),
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
  address: v.object({
    address_1: v.optional(v.string()),
    address_2: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
  }),
  coordinates: v.object({
    lat: v.float64(),
    lng: v.float64(),
  }),
  service_center: v.optional(
    v.object({
      lat: v.float64(),
      lng: v.float64(),
    }),
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
  status: v.union(v.literal("Active"), v.literal("Inactive")),
  commission: v.float64(),
  commission_type: v.union(v.literal("percentage"), v.literal("fixed")),
  hub_manager_id: v.optional(v.union(v.id("users"), v.null())),
  schedule: v.optional(
    v.object({
      is_fulltime: v.boolean(),
      weeklySchedule: v.optional(
        v.object({
          Monday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Tuesday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Wednesday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Thursday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Friday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Saturday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Sunday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
        }),
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
    v.object({
      address_1: v.optional(v.string()),
      address_2: v.optional(v.string()),
      city: v.optional(v.string()),
      country: v.optional(v.string()),
    }),
  ),
  coordinates: v.optional(
    v.object({
      lat: v.float64(),
      lng: v.float64(),
    }),
  ),
  service_center: v.optional(
    v.object({
      lat: v.float64(),
      lng: v.float64(),
    }),
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
  status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
  commission: v.optional(v.float64()),
  commission_type: v.optional(
    v.union(v.literal("percentage"), v.literal("fixed")),
  ),
  hub_manager_id: v.optional(v.union(v.id("users"), v.null())),
  schedule: v.optional(
    v.object({
      is_fulltime: v.boolean(),
      weeklySchedule: v.optional(
        v.object({
          Monday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Tuesday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Wednesday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Thursday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Friday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Saturday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
          Sunday: v.optional(
            v.object({
              startTime: v.string(),
              endTime: v.string(),
            }),
          ),
        }),
      ),
    }),
  ),
  updated_at: v.optional(v.number()),
});

export const IndustryValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  image: v.optional(v.id("_storage")),
  status: v.union(v.literal("Active"), v.literal("Inactive")),
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
  status: v.optional(v.union(v.literal("Active"), v.literal("Inactive"))),
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
  key: v.union(v.literal("primary"), v.literal("secondary")),
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
      address: v.object({
        address_1: v.optional(v.string()),
        address_2: v.optional(v.string()),
        city: v.optional(v.string()),
        country: v.optional(v.string()),
      }),
      coordinates: v.object({
        lat: v.float64(),
        lng: v.float64(),
      }),
      is_default: v.boolean(),
      status: v.union(v.literal("Active"), v.literal("Inactive")),
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
  pickup_address: v.object({
    address_1: v.optional(v.string()),
    address_2: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
  }),
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
  status: v.union(
    v.literal("Awaiting Pickup"),
    v.literal("Picked Up"),
    v.literal("Out for Delivery"),
    v.literal("Delivered"),
    v.literal("Failed Delivery"),
  ),
  updated_at: v.number(),
});

export const PaymentsValidator = v.object({
  order_id: v.optional(v.id("orders")),
  user_id: v.id("users"),
  customerEmail: v.string(),
  searchText: v.optional(v.string()),
  payment_method: v.union(
    v.literal("Card"),
    v.literal("Mobile Money"),
    // Legacy client value
    v.literal("Mpesa"),
    v.literal("Cash on Delivery"),
    v.literal("Bank Transfer"),
    v.literal("Paystack"),
  ),
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
  payer_type: v.optional(v.union(v.literal("customer"), v.literal("receiver"))),
  payment_date: v.number(),
  status: v.union(
    v.literal("Pending"),
    v.literal("Successful"),
    v.literal("Failed"),
    v.literal("Refunded"),
  ),
  updated_at: v.number(),
});

export const StockReservationValidator = v.object({
  product_id: v.id("products"),
  order_reference: v.string(),
  quantity_reserved: v.number(),
  status: v.union(
    v.literal("Reserved"),
    v.literal("PaidReserved"),
    v.literal("Fulfilled"),
    v.literal("Released"),
  ),
  reserved_at: v.number(),
  expires_at: v.optional(v.number()),
  confirmed_at: v.optional(v.number()),
  fulfilled_at: v.optional(v.number()),
});

export const NotificationsValidator = v.object({
  user_id: v.id("users"),
  type: v.union(
    v.literal("order_update"),
    v.literal("delivery"),
    v.literal("promotion"),
    v.literal("system"),
  ),
  status: v.union(v.literal("read"), v.literal("unread")),
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
  platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
  device_id: v.optional(v.string()),
  enabled: v.boolean(),
  last_seen: v.optional(v.number()),
  updated_at: v.optional(v.number()),
});

export const IncentiveConfigValidator = v.object({
  role: v.union(v.literal("RIDER"), v.literal("PICKER")),
  threshold_daily: v.number(),
  bonus_per_extra_daily: v.float64(),
  currency: v.optional(v.string()),
  effective_from: v.number(),
  updated_at: v.number(),
  created_at: v.number(),
});

export const UserIncentiveTargetValidator = v.object({
  user_id: v.id("users"),
  role: v.union(v.literal("RIDER"), v.literal("PICKER")),
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
  role: v.union(v.literal("RIDER"), v.literal("PICKER")),
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
    v.union(v.literal("product"), v.literal("brand"), v.literal("blink")),
  ),
  product_id: v.optional(v.id("products")),
  brand: v.optional(v.string()),
  categoryId: v.optional(v.id("categories")),
  status: v.union(v.literal("active"), v.literal("inactive")),
  start_date: v.number(),
  end_date: v.number(),
  textOverlayPos: v.optional(
    v.union(
      v.literal("top-left"),
      v.literal("top-right"),
      v.literal("bottom-left"),
    ),
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
    v.union(v.literal("product"), v.literal("brand"), v.literal("blink")),
  ),
  product_id: v.optional(v.id("products")),
  brand: v.optional(v.string()),
  categoryId: v.optional(v.id("categories")),
  status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  start_date: v.optional(v.number()),
  end_date: v.optional(v.number()),
  textOverlayPos: v.optional(
    v.union(
      v.literal("top-left"),
      v.literal("top-right"),
      v.literal("bottom-left"),
    ),
  ),
  updated_at: v.optional(v.number()),
});

export const SchedulesValidator = v.object({
  userId: v.id("users"),
  vendorId: v.optional(v.id("vendors")),
  weeklySchedule: v.object({
    Monday: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        enabled: v.boolean(),
      }),
    ),
    Tuesday: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        enabled: v.boolean(),
      }),
    ),
    Wednesday: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        enabled: v.boolean(),
      }),
    ),
    Thursday: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        enabled: v.boolean(),
      }),
    ),
    Friday: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        enabled: v.boolean(),
      }),
    ),
    Saturday: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        enabled: v.boolean(),
      }),
    ),
    Sunday: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        enabled: v.boolean(),
      }),
    ),
  }),
  updated_at: v.optional(v.number()),
});

export const ScheduleUpdateValidator = v.object({
  id: v.id("schedules"),
  userId: v.optional(v.id("users")),
  vendorId: v.optional(v.id("vendors")),
  weeklySchedule: v.optional(
    v.object({
      Monday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Tuesday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Wednesday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Thursday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Friday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Saturday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
      Sunday: v.optional(
        v.object({
          startTime: v.string(),
          endTime: v.string(),
          enabled: v.boolean(),
        }),
      ),
    }),
  ),
  updated_at: v.optional(v.number()),
});

export const PrescriptionValidator = v.object({
  user_id: v.id("users"),
  vendor_id: v.id("vendors"),
  prescription_document: v.id("_storage"),
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
  ),
  notes: v.optional(v.string()),
  rejection_reason_id: v.optional(v.id("prescriptionRejectionReasons")),
  assigned_picker_id: v.optional(v.id("users")),
  uploaded_at: v.number(),
});

export const PrescriptionUpdateValidator = v.object({
  id: v.id("prescriptions"),
  user_id: v.optional(v.id("users")),
  vendor_id: v.optional(v.id("vendors")),
  prescription_document: v.optional(v.id("_storage")),
  status: v.optional(
    v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
  ),
  notes: v.optional(v.string()),
  rejection_reason_id: v.optional(v.id("prescriptionRejectionReasons")),
  uploaded_at: v.optional(v.number()),
});

export const PickerAssignmentValidator = v.object({
  vendor_id: v.id("vendors"),
  picker_id: v.id("users"),
  order_id: v.optional(v.id("orders")),
  prescription_id: v.optional(v.id("prescriptions")),
  type: v.union(v.literal("order"), v.literal("prescription")),
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
  earning_type: v.union(
    v.literal("fixed"),
    v.literal("per_conversion"),
    v.literal("both"),
  ),
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
  type: v.union(
    v.literal("install"),
    v.literal("registration"),
    v.literal("fixed"),
  ),
  amount: v.number(),
  zone_id: v.optional(v.id("agent_zones")),
  created_at: v.number(),
});

export const AgentPaymentRequestsValidator = v.object({
  agent_id: v.id("agents"),
  amount: v.number(),
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("paid"),
  ),
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
  status: v.union(
    v.literal("Active"),
    v.literal("Inactive"),
    v.literal("Sold Out"),
    v.literal("Expired"),
  ),
  unit_value: v.optional(v.float64()),
  unit_type: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.union(v.literal("Featured"), v.literal("Offer")))),
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
    v.union(
      v.literal("Active"),
      v.literal("Inactive"),
      v.literal("Sold Out"),
      v.literal("Expired"),
    ),
  ),
  unit_value: v.optional(v.float64()),
  unit_type: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.union(v.literal("Featured"), v.literal("Offer")))),
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
    v.union(v.literal("signup"), v.literal("purchase")),
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
  status: v.union(
    v.literal("Pending"),
    v.literal("Assigned"),
    v.literal("In Transit"),
    v.literal("Completed"),
  ),
  created_at: v.number(),
  assigned_at: v.optional(v.number()),
});

// ── Import Jobs ────────────────────────────────────────────────
export const ImportJobsValidator = v.object({
  type: v.literal("products"),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("done"),
    v.literal("failed"),
  ),
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
