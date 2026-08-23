import { v } from "convex/values";

type Resource = "orders" | "products" | "categories";

export const RiderDetails = {
  id_image: v.id("_storage"),
  license_image: v.id("_storage"),
  phone_number: v.string(),
  profile_photo: v.id("_storage"),
};
