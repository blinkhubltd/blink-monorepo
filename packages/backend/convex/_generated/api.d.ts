/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_importJobsAction from "../actions/importJobsAction.js";
import type * as crons from "../crons.js";
import type * as data_addresses from "../data/addresses.js";
import type * as data_agentPaymentRequests from "../data/agentPaymentRequests.js";
import type * as data_agentZones from "../data/agentZones.js";
import type * as data_banners from "../data/banners.js";
import type * as data_cart from "../data/cart.js";
import type * as data_categories from "../data/categories.js";
import type * as data_clearanceBatching from "../data/clearanceBatching.js";
import type * as data_clearanceCart from "../data/clearanceCart.js";
import type * as data_clearanceProducts from "../data/clearanceProducts.js";
import type * as data_coverage from "../data/coverage.js";
import type * as data_directions from "../data/directions.js";
import type * as data_dispatch from "../data/dispatch.js";
import type * as data_files from "../data/files.js";
import type * as data_geocode from "../data/geocode.js";
import type * as data_importJobs from "../data/importJobs.js";
import type * as data_incentives from "../data/incentives.js";
import type * as data_industry from "../data/industry.js";
import type * as data_insights from "../data/insights.js";
import type * as data_legalAcceptances from "../data/legalAcceptances.js";
import type * as data_marketing from "../data/marketing.js";
import type * as data_notifications from "../data/notifications.js";
import type * as data_order_items from "../data/order_items.js";
import type * as data_orders from "../data/orders.js";
import type * as data_payments from "../data/payments.js";
import type * as data_paystackSubaccounts from "../data/paystackSubaccounts.js";
import type * as data_pickerAssignment from "../data/pickerAssignment.js";
import type * as data_pickerOrders from "../data/pickerOrders.js";
import type * as data_platformSettings from "../data/platformSettings.js";
import type * as data_prescriptionRejectionReasons from "../data/prescriptionRejectionReasons.js";
import type * as data_prescriptions from "../data/prescriptions.js";
import type * as data_products from "../data/products.js";
import type * as data_pushTokens from "../data/pushTokens.js";
import type * as data_ratings from "../data/ratings.js";
import type * as data_riderAnalytics from "../data/riderAnalytics.js";
import type * as data_riders from "../data/riders.js";
import type * as data_schedules from "../data/schedules.js";
import type * as data_shiftUtils from "../data/shiftUtils.js";
import type * as data_shipments from "../data/shipments.js";
import type * as data_stockAlerts from "../data/stockAlerts.js";
import type * as data_stockReservation from "../data/stockReservation.js";
import type * as data_tracking from "../data/tracking.js";
import type * as data_transactions from "../data/transactions.js";
import type * as data_userNotifications from "../data/userNotifications.js";
import type * as data_vendors from "../data/vendors.js";
import type * as data_wishlist from "../data/wishlist.js";
import type * as helpers_dbHelpers from "../helpers/dbHelpers.js";
import type * as helpers_geo from "../helpers/geo.js";
import type * as helpers_index from "../helpers/index.js";
import type * as helpers_scheduleHelpers from "../helpers/scheduleHelpers.js";
import type * as helpers_statusSync from "../helpers/statusSync.js";
import type * as helpers_userHelpers from "../helpers/userHelpers.js";
import type * as hooks_index from "../hooks/index.js";
import type * as http from "../http.js";
import type * as lib_accountCompletion from "../lib/accountCompletion.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_paystack from "../lib/paystack.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_status_mapping from "../lib/status_mapping.js";
import type * as user_clerk from "../user/clerk.js";
import type * as user_roles from "../user/roles.js";
import type * as user_users from "../user/users.js";
import type * as validators from "../validators.js";
import type * as webhooks_agentScan from "../webhooks/agentScan.js";
import type * as webhooks_location from "../webhooks/location.js";
import type * as webhooks_paystack from "../webhooks/paystack.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/importJobsAction": typeof actions_importJobsAction;
  crons: typeof crons;
  "data/addresses": typeof data_addresses;
  "data/agentPaymentRequests": typeof data_agentPaymentRequests;
  "data/agentZones": typeof data_agentZones;
  "data/banners": typeof data_banners;
  "data/cart": typeof data_cart;
  "data/categories": typeof data_categories;
  "data/clearanceBatching": typeof data_clearanceBatching;
  "data/clearanceCart": typeof data_clearanceCart;
  "data/clearanceProducts": typeof data_clearanceProducts;
  "data/coverage": typeof data_coverage;
  "data/directions": typeof data_directions;
  "data/dispatch": typeof data_dispatch;
  "data/files": typeof data_files;
  "data/geocode": typeof data_geocode;
  "data/importJobs": typeof data_importJobs;
  "data/incentives": typeof data_incentives;
  "data/industry": typeof data_industry;
  "data/insights": typeof data_insights;
  "data/legalAcceptances": typeof data_legalAcceptances;
  "data/marketing": typeof data_marketing;
  "data/notifications": typeof data_notifications;
  "data/order_items": typeof data_order_items;
  "data/orders": typeof data_orders;
  "data/payments": typeof data_payments;
  "data/paystackSubaccounts": typeof data_paystackSubaccounts;
  "data/pickerAssignment": typeof data_pickerAssignment;
  "data/pickerOrders": typeof data_pickerOrders;
  "data/platformSettings": typeof data_platformSettings;
  "data/prescriptionRejectionReasons": typeof data_prescriptionRejectionReasons;
  "data/prescriptions": typeof data_prescriptions;
  "data/products": typeof data_products;
  "data/pushTokens": typeof data_pushTokens;
  "data/ratings": typeof data_ratings;
  "data/riderAnalytics": typeof data_riderAnalytics;
  "data/riders": typeof data_riders;
  "data/schedules": typeof data_schedules;
  "data/shiftUtils": typeof data_shiftUtils;
  "data/shipments": typeof data_shipments;
  "data/stockAlerts": typeof data_stockAlerts;
  "data/stockReservation": typeof data_stockReservation;
  "data/tracking": typeof data_tracking;
  "data/transactions": typeof data_transactions;
  "data/userNotifications": typeof data_userNotifications;
  "data/vendors": typeof data_vendors;
  "data/wishlist": typeof data_wishlist;
  "helpers/dbHelpers": typeof helpers_dbHelpers;
  "helpers/geo": typeof helpers_geo;
  "helpers/index": typeof helpers_index;
  "helpers/scheduleHelpers": typeof helpers_scheduleHelpers;
  "helpers/statusSync": typeof helpers_statusSync;
  "helpers/userHelpers": typeof helpers_userHelpers;
  "hooks/index": typeof hooks_index;
  http: typeof http;
  "lib/accountCompletion": typeof lib_accountCompletion;
  "lib/geo": typeof lib_geo;
  "lib/paystack": typeof lib_paystack;
  "lib/permissions": typeof lib_permissions;
  "lib/roles": typeof lib_roles;
  "lib/status_mapping": typeof lib_status_mapping;
  "user/clerk": typeof user_clerk;
  "user/roles": typeof user_roles;
  "user/users": typeof user_users;
  validators: typeof validators;
  "webhooks/agentScan": typeof webhooks_agentScan;
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
