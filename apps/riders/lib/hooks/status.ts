import { Infer } from "convex/values";
import { UsersValidator } from "@repo/backend/validators";

type User = Infer<typeof UsersValidator>;

export function validateRiderActivation(user: User): string[] {
  if (!user.rider_details) return ["Missing rider details"];

  const { status } = user.rider_details;
  if (status !== "Active") return [];

  const errors: string[] = [];
  if (!user.phone) errors.push("Phone number is required");
  if (!user.image) errors.push("Profile image is required");
  if (!user.rider_details.id_image) errors.push("ID image is required");
  if (!user.rider_details.license_image)
    errors.push("License image is required");

  return errors;
}
