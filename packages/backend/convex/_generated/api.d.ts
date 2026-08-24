/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_import_jobs_action from "../actions/import_jobs_action.js";
import type * as crons from "../crons.js";
import type * as data_addresses from "../data/addresses.js";
import type * as data_agent_payment_requests from "../data/agent_payment_requests.js";
import type * as data_agent_zones from "../data/agent_zones.js";
import type * as data_banners from "../data/banners.js";
import type * as data_cart from "../data/cart.js";
import type * as data_categories from "../data/categories.js";
import type * as data_clearance_batching from "../data/clearance_batching.js";
import type * as data_clearance_cart from "../data/clearance_cart.js";
import type * as data_clearance_products from "../data/clearance_products.js";
import type * as data_coverage from "../data/coverage.js";
import type * as data_directions from "../data/directions.js";
import type * as data_dispatch from "../data/dispatch.js";
import type * as data_files from "../data/files.js";
import type * as data_geocode from "../data/geocode.js";
import type * as data_import_jobs from "../data/import_jobs.js";
import type * as data_incentives from "../data/incentives.js";
import type * as data_industry from "../data/industry.js";
import type * as data_insights from "../data/insights.js";
import type * as data_legal_acceptances from "../data/legal_acceptances.js";
import type * as data_marketing from "../data/marketing.js";
import type * as data_notifications from "../data/notifications.js";
import type * as data_order_items from "../data/order_items.js";
import type * as data_orders from "../data/orders.js";
import type * as data_payments from "../data/payments.js";
import type * as data_paystack_subaccounts from "../data/paystack_subaccounts.js";
import type * as data_picker_assignment from "../data/picker_assignment.js";
import type * as data_picker_orders from "../data/picker_orders.js";
import type * as data_platform_settings from "../data/platform_settings.js";
import type * as data_prescription_rejection_reasons from "../data/prescription_rejection_reasons.js";
import type * as data_prescriptions from "../data/prescriptions.js";
import type * as data_products from "../data/products.js";
import type * as data_push_tokens from "../data/push_tokens.js";
import type * as data_ratings from "../data/ratings.js";
import type * as data_rider_analytics from "../data/rider_analytics.js";
import type * as data_riders from "../data/riders.js";
import type * as data_schedules from "../data/schedules.js";
import type * as data_shift_utils from "../data/shift_utils.js";
import type * as data_shipments from "../data/shipments.js";
import type * as data_stock_alerts from "../data/stock_alerts.js";
import type * as data_stock_reservation from "../data/stock_reservation.js";
import type * as data_tracking from "../data/tracking.js";
import type * as data_transactions from "../data/transactions.js";
import type * as data_user_notifications from "../data/user_notifications.js";
import type * as data_vendors from "../data/vendors.js";
import type * as data_wishlist from "../data/wishlist.js";
import type * as http from "../http.js";
import type * as lib_account_completion from "../lib/account_completion.js";
import type * as lib_delivery_code from "../lib/delivery_code.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_paystack from "../lib/paystack.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_schedule from "../lib/schedule.js";
import type * as lib_status_mapping from "../lib/status_mapping.js";
import type * as user_clerk from "../user/clerk.js";
import type * as user_roles from "../user/roles.js";
import type * as user_users from "../user/users.js";
import type * as validators from "../validators.js";
import type * as webhooks_agent_scan from "../webhooks/agent_scan.js";
import type * as webhooks_location from "../webhooks/location.js";
import type * as webhooks_paystack from "../webhooks/paystack.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/import_jobs_action": typeof actions_import_jobs_action;
  crons: typeof crons;
  "data/addresses": typeof data_addresses;
  "data/agent_payment_requests": typeof data_agent_payment_requests;
  "data/agent_zones": typeof data_agent_zones;
  "data/banners": typeof data_banners;
  "data/cart": typeof data_cart;
  "data/categories": typeof data_categories;
  "data/clearance_batching": typeof data_clearance_batching;
  "data/clearance_cart": typeof data_clearance_cart;
  "data/clearance_products": typeof data_clearance_products;
  "data/coverage": typeof data_coverage;
  "data/directions": typeof data_directions;
  "data/dispatch": typeof data_dispatch;
  "data/files": typeof data_files;
  "data/geocode": typeof data_geocode;
  "data/import_jobs": typeof data_import_jobs;
  "data/incentives": typeof data_incentives;
  "data/industry": typeof data_industry;
  "data/insights": typeof data_insights;
  "data/legal_acceptances": typeof data_legal_acceptances;
  "data/marketing": typeof data_marketing;
  "data/notifications": typeof data_notifications;
  "data/order_items": typeof data_order_items;
  "data/orders": typeof data_orders;
  "data/payments": typeof data_payments;
  "data/paystack_subaccounts": typeof data_paystack_subaccounts;
  "data/picker_assignment": typeof data_picker_assignment;
  "data/picker_orders": typeof data_picker_orders;
  "data/platform_settings": typeof data_platform_settings;
  "data/prescription_rejection_reasons": typeof data_prescription_rejection_reasons;
  "data/prescriptions": typeof data_prescriptions;
  "data/products": typeof data_products;
  "data/push_tokens": typeof data_push_tokens;
  "data/ratings": typeof data_ratings;
  "data/rider_analytics": typeof data_rider_analytics;
  "data/riders": typeof data_riders;
  "data/schedules": typeof data_schedules;
  "data/shift_utils": typeof data_shift_utils;
  "data/shipments": typeof data_shipments;
  "data/stock_alerts": typeof data_stock_alerts;
  "data/stock_reservation": typeof data_stock_reservation;
  "data/tracking": typeof data_tracking;
  "data/transactions": typeof data_transactions;
  "data/user_notifications": typeof data_user_notifications;
  "data/vendors": typeof data_vendors;
  "data/wishlist": typeof data_wishlist;
  http: typeof http;
  "lib/account_completion": typeof lib_account_completion;
  "lib/delivery_code": typeof lib_delivery_code;
  "lib/geo": typeof lib_geo;
  "lib/paystack": typeof lib_paystack;
  "lib/permissions": typeof lib_permissions;
  "lib/roles": typeof lib_roles;
  "lib/schedule": typeof lib_schedule;
  "lib/status_mapping": typeof lib_status_mapping;
  "user/clerk": typeof user_clerk;
  "user/roles": typeof user_roles;
  "user/users": typeof user_users;
  validators: typeof validators;
  "webhooks/agent_scan": typeof webhooks_agent_scan;
  "webhooks/location": typeof webhooks_location;
  "webhooks/paystack": typeof webhooks_paystack;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
