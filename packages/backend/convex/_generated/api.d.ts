/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as addresses from "../addresses.js";
import type * as agentPaymentRequests from "../agentPaymentRequests.js";
import type * as agentScan from "../agentScan.js";
import type * as agentZones from "../agentZones.js";
import type * as banners from "../banners.js";
import type * as cart from "../cart.js";
import type * as categories from "../categories.js";
import type * as clearanceBatching from "../clearanceBatching.js";
import type * as clearanceCart from "../clearanceCart.js";
import type * as clearanceProducts from "../clearanceProducts.js";
import type * as user_clerk from "../user/clerk.js";
import type * as coverage from "../coverage.js";
import type * as crons from "../crons.js";
import type * as directions from "../directions.js";
import type * as dispatch from "../dispatch.js";
import type * as files from "../files.js";
import type * as geocode from "../geocode.js";
import type * as helpers_dbHelpers from "../helpers/dbHelpers.js";
import type * as helpers_geo from "../helpers/geo.js";
import type * as helpers_index from "../helpers/index.js";
import type * as helpers_scheduleHelpers from "../helpers/scheduleHelpers.js";
import type * as helpers_statusSync from "../helpers/statusSync.js";
import type * as helpers_userHelpers from "../helpers/userHelpers.js";
import type * as hooks_index from "../hooks/index.js";
import type * as http from "../http.js";
import type * as importJobs from "../importJobs.js";
import type * as importJobsAction from "../importJobsAction.js";
import type * as incentives from "../incentives.js";
import type * as industry from "../industry.js";
import type * as insights from "../insights.js";
import type * as legalAcceptances from "../legalAcceptances.js";
import type * as lib_accountCompletion from "../lib/accountCompletion.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_roles from "../lib/roles.js";
import type * as location from "../location.js";
import type * as marketing from "../marketing.js";
import type * as notifications from "../notifications.js";
import type * as order_items from "../order_items.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as paystackSubaccounts from "../paystackSubaccounts.js";
import type * as pickerAssignment from "../pickerAssignment.js";
import type * as pickerOrders from "../pickerOrders.js";
import type * as platformSettings from "../platformSettings.js";
import type * as prescriptionRejectionReasons from "../prescriptionRejectionReasons.js";
import type * as prescriptions from "../prescriptions.js";
import type * as products from "../products.js";
import type * as pushTokens from "../pushTokens.js";
import type * as ratings from "../ratings.js";
import type * as riderAnalytics from "../riderAnalytics.js";
import type * as riders from "../riders.js";
import type * as roles from "../roles.js";
import type * as schedules from "../schedules.js";
import type * as shiftUtils from "../shiftUtils.js";
import type * as shipments from "../shipments.js";
import type * as stockAlerts from "../stockAlerts.js";
import type * as stockReservation from "../stockReservation.js";
import type * as testNotifications from "../testNotifications.js";
import type * as tracking from "../tracking.js";
import type * as transactions from "../transactions.js";
import type * as types from "../types.js";
import type * as userNotifications from "../userNotifications.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";
import type * as vendors from "../vendors.js";
import type * as wishlist from "../wishlist.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  addresses: typeof addresses;
  agentPaymentRequests: typeof agentPaymentRequests;
  agentScan: typeof agentScan;
  agentZones: typeof agentZones;
  banners: typeof banners;
  cart: typeof cart;
  categories: typeof categories;
  clearanceBatching: typeof clearanceBatching;
  clearanceCart: typeof clearanceCart;
  clearanceProducts: typeof clearanceProducts;
  "user/clerk": typeof user_clerk;
  coverage: typeof coverage;
  crons: typeof crons;
  directions: typeof directions;
  dispatch: typeof dispatch;
  files: typeof files;
  geocode: typeof geocode;
  "helpers/dbHelpers": typeof helpers_dbHelpers;
  "helpers/geo": typeof helpers_geo;
  "helpers/index": typeof helpers_index;
  "helpers/scheduleHelpers": typeof helpers_scheduleHelpers;
  "helpers/statusSync": typeof helpers_statusSync;
  "helpers/userHelpers": typeof helpers_userHelpers;
  "hooks/index": typeof hooks_index;
  http: typeof http;
  importJobs: typeof importJobs;
  importJobsAction: typeof importJobsAction;
  incentives: typeof incentives;
  industry: typeof industry;
  insights: typeof insights;
  legalAcceptances: typeof legalAcceptances;
  "lib/accountCompletion": typeof lib_accountCompletion;
  "lib/permissions": typeof lib_permissions;
  "lib/roles": typeof lib_roles;
  location: typeof location;
  marketing: typeof marketing;
  notifications: typeof notifications;
  order_items: typeof order_items;
  orders: typeof orders;
  payments: typeof payments;
  paystackSubaccounts: typeof paystackSubaccounts;
  pickerAssignment: typeof pickerAssignment;
  pickerOrders: typeof pickerOrders;
  platformSettings: typeof platformSettings;
  prescriptionRejectionReasons: typeof prescriptionRejectionReasons;
  prescriptions: typeof prescriptions;
  products: typeof products;
  pushTokens: typeof pushTokens;
  ratings: typeof ratings;
  riderAnalytics: typeof riderAnalytics;
  riders: typeof riders;
  roles: typeof roles;
  schedules: typeof schedules;
  shiftUtils: typeof shiftUtils;
  shipments: typeof shipments;
  stockAlerts: typeof stockAlerts;
  stockReservation: typeof stockReservation;
  testNotifications: typeof testNotifications;
  tracking: typeof tracking;
  transactions: typeof transactions;
  types: typeof types;
  userNotifications: typeof userNotifications;
  users: typeof users;
  validators: typeof validators;
  vendors: typeof vendors;
  wishlist: typeof wishlist;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
