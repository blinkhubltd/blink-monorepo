/**
 * Common database operation helpers for Convex
 * These functions provide reusable patterns for database operations
 */

import { Id } from "../_generated/dataModel";
import { getUserByClerkId } from "./userHelpers";

/**
 * Generic helper to get records by user (using Clerk ID)
 * @param ctx - Convex context
 * @param table - Table name
 * @param clerkId - Clerk user ID
 * @param options - Additional options
 * @returns Array of records for the user
 */
export const getRecordsByClerkId = async <T extends string>(
  ctx: any,
  table: T,
  clerkId: string,
  options?: {
    orderBy?: "asc" | "desc";
    limit?: number;
  }
) => {
  try {
    const user = await getUserByClerkId(ctx, clerkId);

    let query = ctx.db
      .query(table)
      .withIndex("by_user", (q: any) => q.eq("user_id", user._id));

    if (options?.orderBy) {
      query = query.order(options.orderBy);
    }

    if (options?.limit) {
      return await query.take(options.limit);
    }

    return await query.collect();
  } catch (error) {
    return [];
  }
};

/**
 * Helper to check if a record exists for a user (using Clerk ID)
 * @param ctx - Convex context
 * @param table - Table name
 * @param clerkId - Clerk user ID
 * @param additionalFilter - Additional filter function
 * @returns Boolean indicating if record exists
 */
export const recordExistsForUser = async <T extends string>(
  ctx: any,
  table: T,
  clerkId: string,
  additionalFilter?: (record: any) => boolean
): Promise<boolean> => {
  try {
    const user = await getUserByClerkId(ctx, clerkId);

    const records = await ctx.db
      .query(table)
      .withIndex("by_user", (q: any) => q.eq("user_id", user._id))
      .collect();

    if (!additionalFilter) {
      return records.length > 0;
    }

    return records.some(additionalFilter);
  } catch (error) {
    return false;
  }
};

/**
 * Common error messages for database operations
 */
export const DatabaseErrors = {
  USER_NOT_FOUND: "User not found. Please sign in again.",
  RECORD_NOT_FOUND: "Record not found.",
  PERMISSION_DENIED: "You don't have permission to access this resource.",
  INVALID_INPUT: "Invalid input provided.",
} as const;

/**
 * Helper to safely execute database operations with error handling
 * @param operation - Async operation to execute
 * @param fallbackValue - Value to return on error
 * @returns Operation result or fallback value
 */
export const safeDbOperation = async <T>(
  operation: () => Promise<T>,
  fallbackValue: T
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error("Database operation failed:", error);
    return fallbackValue;
  }
};
