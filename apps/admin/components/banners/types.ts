// helpers/index.ts existed only to re-export Id from the generated dataModel;
// the rest of it was unreachable and was deleted in the restructure.
import type { Id } from "@repo/backend/dataModel";

export type Banner = {
  _id: Id<"banners">;
  image: Id<"_storage">;
  header?: string;
  sub_header?: string;
  cta_text?: string;
  promo_type?: "product" | "brand" | "blink";
  product_id?: Id<"products">;
  brand?: string;
  categoryId?: Id<"categories">;
  status: "active" | "inactive";
  start_date: number;
  end_date: number;
  textOverlayPos?: "top-left" | "top-right" | "bottom-left";
  created_at?: number;
  updated_at?: number;
};

export type BannerFormValues = {
  image: Id<"_storage">;
  header?: string;
  sub_header?: string;
  cta_text?: string;
  promo_type?: "product" | "brand" | "blink";
  product_id?: Id<"products">;
  brand?: string;
  categoryId?: Id<"categories">;
  status: "active" | "inactive";
  start_date: number;
  end_date: number;
  textOverlayPos?: "top-left" | "top-right" | "bottom-left";
};
