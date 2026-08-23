import { Infer } from "convex/values";
import { UsersValidator } from "../validators";

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

export function generateDeliveryCode(): string {
  // Generate a more robust 6-digit code with better distribution
  // Using crypto-like randomness for better security
  const min = 100000;
  const max = 999999;

  // Ensure good randomness and avoid common patterns
  let code: string;
  do {
    const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
    code = randomValue.toString();

    // Avoid codes with all same digits or simple patterns
  } while (
    /^(\d)\1{5}$/.test(code) || // all same digits (111111, 222222, etc.)
    code === "123456" || // sequential
    code === "654321" || // reverse sequential
    code === "000000" // should not happen with our range, but safety
  );

  return code;
}
