import { Infer } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { UsersValidator } from "../validators";
import { isRider } from "./roles";

/**
 * Server-side account completion check.
 *
 * Riders must have: first_name, last_name, phone, email, image, id_image, license_image
 * Pickers must have: first_name, last_name, phone, email, image
 *
 * Returns { complete: boolean, missing: string[], percentage: number }
 */
export async function getAccountCompletion(
  ctx: QueryCtx | MutationCtx,
  user: any,
): Promise<{ complete: boolean; missing: string[]; percentage: number }> {
  const missing: string[] = [];

  if (!user.first_name || !user.last_name) missing.push("Full name");
  if (!user.phone) missing.push("Phone number");
  if (!user.email) missing.push("Email address");
  if (!user.image) missing.push("Profile photo");

  const userIsRider = await isRider(ctx, user);
  if (userIsRider) {
    if (!user.rider_details?.id_image) missing.push("ID document");
    if (!user.rider_details?.license_image) missing.push("License document");
  }

  const total = userIsRider ? 6 : 4;
  const completed = total - missing.length;

  return {
    complete: missing.length === 0,
    missing,
    percentage: Math.round((completed / total) * 100),
  };
}

/** Quick boolean: is this account fully set up? */
export async function isAccountComplete(
  ctx: QueryCtx | MutationCtx,
  user: any,
): Promise<boolean> {
  const { complete } = await getAccountCompletion(ctx, user);
  return complete;
}

/**
 * Which required fields a rider is missing before they may go Active.
 *
 * Pure, unlike the two functions above — grouped here because it is the same
 * concern (rider profile completeness) rather than a separate one. Moved from
 * `hooks/index.ts`; `user/users.ts` calls it when a rider status changes.
 *
 * Returns `[]` for any status other than "Active": the requirements only gate
 * activation, not existence.
 */
export function validateRiderActivation(
  user: Infer<typeof UsersValidator>,
): string[] {
  if (!user.rider_details) return ["Missing rider details"];
  if (user.rider_details.status !== "Active") return [];

  const errors: string[] = [];
  if (!user.phone) errors.push("Phone number is required");
  if (!user.image) errors.push("Profile image is required");
  if (!user.rider_details.id_image) errors.push("ID image is required");
  if (!user.rider_details.license_image) {
    errors.push("License image is required");
  }
  return errors;
}
