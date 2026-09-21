import type { Id } from "@repo/backend/dataModel";

export type Brand = {
  _id: Id<"brands">;
  name: string;
  slug: string;
  searchText?: string;
  description?: string;
  logo?: Id<"_storage">;
  status: "active" | "inactive";
  created_at?: number;
  updated_at?: number;
};

export type BrandFormValues = {
  name: string;
  slug?: string;
  description?: string;
  logo?: Id<"_storage">;
  status: "active" | "inactive";
};
