import { defineSchema, defineTable } from "convex/server";
import {
  OrdersValidator,
  OrderItemValidator,
  UsersValidator,
  ProductsValidator,
  CategoriesValidator,
  VendorsValidator,
  AddressValidator,
  ShipmentValidator,
  PaymentsValidator,
  CartValidator,
  WishListValidator,
  StockReservationValidator,
  NotificationsValidator,
  BannersValidator,
  BannersUpdateValidator,
  PushTokensValidator,
  BaseEarningsValidator,
  IncentiveConfigValidator,
  UserIncentiveTargetValidator,
  PickerActivityValidator,
  SchedulesValidator,
  PrescriptionValidator,
  PickerAssignmentValidator,
  PrescriptionRejectionReasonValidator,
  PaystackSubaccountValidator,
  IndustryValidator,
  AgentsValidator,
  AgentZonesValidator,
  AgentEarningsValidator,
  AgentPaymentRequestsValidator,
  RolesValidator,
  PlatformSettingsValidator,
  TransactionsValidator,
  ClearanceProductValidator,
  ClearanceCartValidator,
  ClearanceOrderItemValidator,
  ClearanceBatchValidator,
  LegalAcceptanceValidator,
  ImportJobsValidator,
} from "./validators";

export default defineSchema({
  categories: defineTable(CategoriesValidator)
    .index("by_slug", ["slug"])
    .index("by_parent", ["parent_category_id"])
    .index("by_status", ["status"])
    .index("by_sort_order", ["sort_order"])
    .index("by_industry", ["industry"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "industry"],
    }),

  products: defineTable(ProductsValidator)
    .index("by_slug", ["slug"])
    .index("by_sku", ["sku"])
    .index("by_category", ["category_id"])
    .index("by_item_number", ["item_number"])
    .index("by_item_number_vendor", ["item_number", "vendor_id"])
    .index("by_item_number_status", ["item_number", "status"])
    .index("by_status", ["status"])
    .index("by_vendor", ["vendor_id"])
    .index("by_barcode", ["barcode"])
    .index("by_brand", ["brand"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "category_id", "vendor_id"],
    }),

  users: defineTable(UsersValidator)
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_push_token", ["push_token"])
    .index("by_isStaff", ["isStaff"])
    .index("by_role_id", ["role_id"])
    .index("by_role_id_rider_status", ["role_id", "rider_details.status"])
    .index("by_role_id_rider_vendor", ["role_id", "rider_details.vendor_id"])
    .index("by_role_id_picker_vendor", ["role_id", "picker_details.vendor_id"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: [
        "role_id",
        "status",
        "rider_details.status",
        "rider_details.vendor_id",
        "rider_details.vehicle_type",
        "picker_details.status",
        "picker_details.vendor_id",
      ],
    }),

  orders: defineTable(OrdersValidator)
    .index("by_reference", ["reference"])
    .index("by_payment_reference", ["payment_reference"])
    // De-duplicates pay-on-delivery finalisation, which has no payment
    // reference to guard on. See OrdersValidator.idempotency_key.
    .index("by_idempotency_key", ["idempotency_key"])
    .index("by_order_date", ["order_date"])
    .index("by_user", ["user_id"])
    .index("by_status", ["order_status"])
    .index("by_payment_status", ["payment_status"])
    .index("by_payment_method", ["payment_method"])
    .index("by_payment_mode", ["payment_mode"])
    .index("by_delivery_code_verified", ["delivery_code_verified"])
    .index("by_vendor", ["vendor_id"])
    .index("by_user_status", ["user_id", "order_status"])
    .index("by_assigned_picker", ["assigned_picker_id"])
    .index("by_assigned_picker_status", ["assigned_picker_id", "order_status"])
    // Composite so a vendor-scoped dashboard query is indexed on BOTH the vendor
    // and the period. by_vendor alone would read every order that vendor has
    // ever had and filter by date in memory, which is the read pattern Convex's
    // 16k limit punishes.
    .index("by_vendor_order_date", ["vendor_id", "order_date"])
    .index("by_is_clearance", ["is_clearance"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: [
        "vendor_id",
        "user_id",
        "order_status",
        "payment_status",
        "is_clearance",
      ],
    }),

  order_items: defineTable(OrderItemValidator)
    .index("by_order", ["order_id"])
    .index("by_product", ["product_id"])
    .index("by_vendor", ["vendor_id"])
    .index("by_barcodeVerified", ["barcodeVerified"])
    .index("by_name", ["name"])
    // Reverse lookup: which items a given prescription authorises. Lets the
    // review screen name what it is approving instead of showing a bare image.
    .index("by_prescription", ["prescription_id"]),

  vendors: defineTable(VendorsValidator)
    .index("by_coordinates", ["coordinates"])
    .index("by_address", ["address"])
    .index("by_contact", ["contact"])
    .index("by_status", ["status"])
    .index("by_hub_manager", ["hub_manager_id"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "industry_id"],
    }),

  industry: defineTable(IndustryValidator)
    .index("by_name", ["name"])
    .index("by_status", ["status"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status"],
    }),

  address: defineTable(AddressValidator).index("by_user", ["user_id"]),

  shipments: defineTable(ShipmentValidator)
    .index("by_order", ["order_id"])
    .index("by_vendor", ["vendor_id"])
    .index("by_rider", ["rider_id"])
    .index("by_status", ["status"])
    .index("by_pickup_address", ["pickup_address"])
    .index("by_delivery_address", ["delivery_address"])
    .index("by_rider_status", ["rider_id", "status"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "vendor_id", "rider_id"],
    }),

  payments: defineTable(PaymentsValidator)
    .index("by_order", ["order_id"])
    .index("by_user", ["user_id"])
    .index("by_date", ["payment_date"])
    .index("by_reference", ["reference"])
    .index("by_status", ["status"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "user_id", "payment_method"],
    }),

  transactions: defineTable(TransactionsValidator)
    .index("by_order", ["order_id"])
    .index("by_reference", ["reference"])
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "type", "payment_method"],
    }),

  paystackSubaccounts: defineTable(PaystackSubaccountValidator).index(
    "by_key",
    ["key"],
  ),

  cart: defineTable(CartValidator).index("by_user", ["user_id"]),

  wishlist: defineTable(WishListValidator).index("by_user", ["user_id"]),

  stockReservation: defineTable(StockReservationValidator)
    .index("by_product", ["product_id"])
    .index("by_order_reference", ["order_reference"])
    .index("by_status", ["status"])
    .index("by_expiry", ["expires_at"]),

  notifications: defineTable(NotificationsValidator)
    .index("by_user", ["user_id"])
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_user_status", ["user_id", "status"])
    .index("by_created_at", ["created_at"])
    .index("by_user_created", ["user_id", "created_at"]),

  banners: defineTable(BannersValidator)
    .index("by_status", ["status"])
    .index("by_dates", ["start_date", "end_date"])
    .index("by_status_dates", ["status", "start_date", "end_date"])
    .index("by_category", ["categoryId"])
    .index("by_category_status", ["categoryId", "status"])
    .index("by_promo_type", ["promo_type"])
    .index("by_product", ["product_id"])
    .index("by_brand", ["brand"]),

  push_tokens: defineTable(PushTokensValidator)
    .index("by_user", ["user_id"])
    .index("by_token", ["token"])
    .index("by_user_enabled", ["user_id", "enabled"])
    .index("by_enabled", ["enabled"]),

  base_earnings: defineTable(BaseEarningsValidator)
    .index("by_role", ["role"])
    .index("by_effective_date", ["effective_from"]),

  incentive_configs: defineTable(IncentiveConfigValidator).index("by_role", [
    "role",
  ]),

  user_incentive_targets: defineTable(UserIncentiveTargetValidator)
    .index("by_user", ["user_id"])
    .index("by_role", ["role"])
    .index("by_user_week", ["user_id", "week_start"])
    .index("by_user_month", ["user_id", "month_start"]),

  picker_activity: defineTable(PickerActivityValidator)
    .index("by_picker", ["picker_id"])
    .index("by_picker_day", ["picker_id", "day_bucket"])
    .index("by_order", ["order_id"]),

  schedules: defineTable(SchedulesValidator)
    .index("by_user", ["userId"])
    .index("by_vendor", ["vendorId"]),

  prescriptions: defineTable(PrescriptionValidator)
    .index("by_user", ["user_id"])
    .index("by_vendor", ["vendor_id"])
    .index("by_status", ["status"])
    .index("by_rejection_reason", ["rejection_reason_id"]),

  picker_assignments: defineTable(PickerAssignmentValidator)
    .index("by_vendor", ["vendor_id"])
    .index("by_picker", ["picker_id"])
    .index("by_order", ["order_id"])
    .index("by_prescription", ["prescription_id"])
    .index("by_type", ["type"]),

  prescriptionRejectionReasons: defineTable(
    PrescriptionRejectionReasonValidator,
  )
    .index("by_active", ["is_active"])
    .index("by_system_default", ["is_system_default"])
    .index("by_created_by", ["created_by"])
    .index("by_active_system", ["is_active", "is_system_default"]),

  agent_zones: defineTable(AgentZonesValidator)
    .index("by_name", ["name"])
    .searchIndex("search_text", {
      searchField: "searchText",
    }),

  agents: defineTable(AgentsValidator)
    .index("by_user", ["user_id"])
    .index("by_code", ["code"])
    .index("by_zone", ["zone_id"])
    .searchIndex("search_text", {
      searchField: "searchText",
    }),

  agent_earnings: defineTable(AgentEarningsValidator)
    .index("by_agent", ["agent_id"])
    .index("by_agent_type", ["agent_id", "type"]),

  agent_payment_requests: defineTable(AgentPaymentRequestsValidator)
    .index("by_agent", ["agent_id"])
    .index("by_status", ["status"])
    .index("by_agent_status", ["agent_id", "status"]),

  roles: defineTable(RolesValidator)
    .index("by_name", ["name"])
    .index("by_is_default", ["is_default"])
    .searchIndex("search_roles", {
      searchField: "search_text",
    }),

  // ── Clearance Feature ──────────────────────────────────────────
  platform_settings: defineTable(PlatformSettingsValidator).index("by_key", [
    "key",
  ]),

  clearance_products: defineTable(ClearanceProductValidator)
    .index("by_slug", ["slug"])
    .index("by_sku", ["sku"])
    .index("by_category", ["category_id"])
    .index("by_industry", ["industry_id"])
    .index("by_vendor", ["vendor_id"])
    .index("by_status", ["status"])
    .index("by_expiry_date", ["expiry_date"])
    .index("by_display_end_date", ["display_end_date"])
    .index("by_barcode", ["barcode"])
    .index("by_brand", ["brand"])
    .index("by_status_display", ["status", "display_end_date"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "category_id", "vendor_id", "industry_id"],
    }),

  clearance_cart: defineTable(ClearanceCartValidator).index("by_user", [
    "user_id",
  ]),

  clearance_order_items: defineTable(ClearanceOrderItemValidator)
    .index("by_order", ["order_id"])
    .index("by_clearance_product", ["clearance_product_id"])
    .index("by_vendor", ["vendor_id"]),

  clearance_batches: defineTable(ClearanceBatchValidator)
    .index("by_vendor", ["vendor_id"])
    .index("by_rider", ["rider_id"])
    .index("by_status", ["status"])
    .index("by_vendor_status", ["vendor_id", "status"]),

  legal_acceptances: defineTable(LegalAcceptanceValidator)
    .index("by_user", ["user_id"])
    .index("by_user_date", ["user_id", "accepted_at"]),

  import_jobs: defineTable(ImportJobsValidator)
    .index("by_status", ["status"])
    .index("by_created_at", ["created_at"]),
});
