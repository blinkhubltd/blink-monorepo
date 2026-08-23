import { Id } from "../_generated/dataModel";

export const getUserByClerkId = async (ctx: any, clerkId: string) => {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q: any) => q.eq("clerkId", clerkId))
    .unique();

  if (!user) {
    throw new Error("User not found. Please sign in again.");
  }

  return user;
};

export const getUserById = async (ctx: any, userId: Id<"users">) => {
  const user = await ctx.db.get(userId);

  if (!user) {
    throw new Error("User not found.");
  }

  return user;
};

export const getDbUserIdFromClerkId = async (
  ctx: any,
  clerkId: string
): Promise<Id<"users">> => {
  const user = await getUserByClerkId(ctx, clerkId);
  return user._id;
};

export const UserErrors = {
  NOT_FOUND: "User not found. Please sign in again.",
  INVALID_CLERK_ID: "Invalid Clerk ID provided.",
  DATABASE_ERROR: "Database error occurred while fetching user.",
} as const;
