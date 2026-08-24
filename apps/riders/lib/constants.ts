/**
 * Application constants and configuration
 * Status values are based on Convex schema definitions
 */

// App info
export const APP_NAME = 'Blink Riders';
export const APP_VERSION = '1.0.0';

// Order status (from convex/validators.ts)
export const ORDER_STATUS = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
} as const;

// Payment status (from convex/validators.ts)
export const PAYMENT_STATUS = {
  UNPAID: 'Unpaid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
} as const;

// Payment methods (from convex/validators.ts - Orders)
export const PAYMENT_METHOD = {
  CARD: 'Card',
  MOBILE_MONEY: 'Mobile Money',
  CASH_ON_DELIVERY: 'Cash on Delivery',
  BANK_TRANSFER: 'Bank Transfer',
} as const;

// Payment methods (from convex/validators.ts - Payments)
export const PAYMENT_PROVIDER = {
  CREDIT_CARD: 'Credit Card',
  MPESA: 'Mpesa',
  CASH_ON_DELIVERY: 'Cash on Delivery',
  PAYSTACK: 'Paystack',
} as const;

// Payment transaction status
export const PAYMENT_TRANSACTION_STATUS = {
  PENDING: 'Pending',
  SUCCESSFUL: 'Successful',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
} as const;

// Shipment status (from convex/validators.ts)
export const SHIPMENT_STATUS = {
  AWAITING_PICKUP: 'Awaiting Pickup',
  PICKED_UP: 'Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  FAILED_DELIVERY: 'Failed Delivery',
} as const;

// User roles (from convex/validators.ts)
export const USER_ROLES = {
  ADMIN: 'ADMIN',
  RIDER: 'RIDER',
  PICKER: 'PICKER',
  CUSTOMER: 'CUSTOMER',
  MANAGER: 'MANAGER',
} as const;

// Rider status (from convex/validators.ts)
export const RIDER_STATUS = {
  ACTIVE: 'Active',
  ON_DELIVERY: 'On Delivery',
  INACTIVE: 'Inactive',
} as const;

// Picker status (from convex/validators.ts)
export const PICKER_STATUS = {
  ACTIVE: 'Active',
  ON_ORDER: 'On Order',
  INACTIVE: 'Inactive',
} as const;

// Vehicle types (from convex/validators.ts)
export const VEHICLE_TYPE = {
  MOTORBIKE: 'Motorbike',
  BICYCLE: 'Bicycle',
  CAR: 'Car',
  VAN: 'Van',
} as const;

// Product status (from convex/validators.ts)
export const PRODUCT_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
} as const;

// Category status (from convex/validators.ts)
export const CATEGORY_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

// Vendor status (from convex/validators.ts)
export const VENDOR_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
} as const;

// Commission types (from convex/validators.ts)
export const COMMISSION_TYPE = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
} as const;

// Product tags (from convex/validators.ts)
export const PRODUCT_TAGS = {
  FEATURED: 'Featured',
  OFFER: 'Offer',
  HOT: 'Hot',
} as const;

// API endpoints
export const API_ENDPOINTS = {
  CLERK_API: 'https://api.clerk.com/v1',
  CONVEX_API: process.env.EXPO_PUBLIC_CONVEX_URL,
} as const;

// Map constants
export const MAP_CONFIG = {
  DEFAULT_LATITUDE: -1.2921,  // Nairobi coordinates as default
  DEFAULT_LONGITUDE: 36.8219,
  DEFAULT_ZOOM: 15,
  MAX_ZOOM: 20,
  MIN_ZOOM: 5,
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// Time constants (in milliseconds)
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

// Delivery time estimates (in minutes)
export const DELIVERY_TIME = {
  MIN: 30,
  MAX: 45,
  RUSH_HOUR_ADDITIONAL: 15,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  AUTH_ERROR: 'Authentication failed. Please sign in again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  NOT_FOUND: 'The requested resource was not found.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
  ACCESS_DENIED: 'Access denied. Please contact support if you believe this is an error.',
  DELIVERY_NOT_AVAILABLE: 'Delivery not available for this location.',
  ORDER_CANCELLED: 'This order has been cancelled.',
  PAYMENT_FAILED: 'Payment could not be processed.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  PROFILE_UPDATED: 'Profile updated successfully',
  ORDER_PLACED: 'Order placed successfully',
  ORDER_ACCEPTED: 'Order accepted',
  ORDER_PICKED_UP: 'Order picked up successfully',
  DELIVERY_COMPLETED: 'Delivery completed successfully',
  PAYMENT_SUCCESSFUL: 'Payment successful',
  STATUS_UPDATED: 'Status updated successfully',
} as const;

// Regular expressions for validation
export const REGEX = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s-()]+$/,
  NAME: /^[a-zA-Z\s'-]+$/,
  POSTAL_CODE: /^[\w\s-]{3,10}$/,
  VEHICLE_PLATE: /^[A-Z]{3}\s?\d{3}[A-Z]?$/i, // Kenyan format: KXX 123X
} as const;

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_PREFERENCES: 'user_preferences',
  LAST_LOCATION: 'last_location',
  DEVICE_ID: 'device_id',
  CURRENT_ORDER: 'current_order',
  RIDER_STATUS: 'rider_status',
} as const;

// Feature flags
export const FEATURES = {
  ENABLE_PUSH_NOTIFICATIONS: true,
  ENABLE_LOCATION_TRACKING: true,
  ENABLE_DARK_MODE: false,
  ENABLE_OFFLINE_MODE: false,
  ENABLE_LIVE_TRACKING: true,
  ENABLE_CHAT: false,
} as const;

// Service radius (in kilometers)
export const SERVICE_RADIUS = {
  DEFAULT: 10,
  MAX: 50,
  MIN: 1,
} as const;

// Rating
export const RATING = {
  MIN: 1,
  MAX: 5,
  DEFAULT: 5,
} as const;

// Currency
export const CURRENCY = {
  CODE: 'KES',
  SYMBOL: 'Ksh',
  DECIMAL_PLACES: 2,
} as const;
