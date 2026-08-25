"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon as Calendar,
  Clock01Icon as Clock,
  Delete02Icon as Trash2,
  EditIcon as Edit,
  MoreHorizontalIcon as MoreHorizontal,
  PowerIcon as Power,
  PowerOffIcon as PowerOff,
  ViewIcon as Eye,
} from "@hugeicons/core-free-icons";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { TableCell, TableRow } from "@repo/ui/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Banner } from "./types";
import Image from "next/image";

interface BannerRowProps {
  banner: Banner;
  categories: any[] | undefined;
  products: any[] | undefined;
  vendors: any[] | undefined;
  onEdit: (banner: Banner) => void;
  onDelete: (banner: Banner) => void;
  onView: (banner: Banner) => void;
  onToggleStatus: (banner: Banner) => void;
}

export function BannerRow({
  banner,
  categories,
  products,
  vendors,
  onEdit,
  onDelete,
  onView,
  onToggleStatus,
}: BannerRowProps) {
  // Query image for this specific banner
  const imageUrl = useQuery(
    api.data.files.getImageUrl,
    banner.image ? { storageId: banner.image } : "skip"
  );

  // Helper function to get category name
  const getCategoryName = (categoryId?: Id<"categories">) => {
    if (!categoryId || !categories) return "General";
    const category = categories.find((cat) => cat._id === categoryId);
    return category ? category.name : "Unknown Category";
  };

  // Helper function to get product name
  const getProductName = (productId?: Id<"products">) => {
    if (!productId || !products) return null;
    const product = products.find((p) => p._id === productId);
    return product
      ? `${product.name}${product.brand ? ` - ${product.brand}` : ""}`
      : "Unknown Product";
  };

  // Helper function to get vendor name
  const getVendorName = (vendorId?: Id<"vendors">) => {
    if (!vendorId || !vendors) return null;
    const vendor = vendors.find((v) => v._id === vendorId);
    return vendor ? vendor.name : "Unknown Vendor";
  };

  const getBannerStatus = (banner: Banner) => {
    const now = Date.now();
    const isActive = banner.status === "active";
    const isLive = now >= banner.start_date && now <= banner.end_date;
    const isFuture = now < banner.start_date;
    const isExpired = now > banner.end_date;

    if (!isActive)
      return {
        label: "Inactive",
        variant: "secondary" as const,
        isLive: false,
      };
    if (isExpired)
      return {
        label: "Expired",
        variant: "destructive" as const,
        isLive: false,
      };
    if (isFuture)
      return { label: "Scheduled", variant: "outline" as const, isLive: false };
    if (isLive)
      return { label: "Live", variant: "default" as const, isLive: true };

    return { label: "Active", variant: "default" as const, isLive: false };
  };

  const formatDateTime = (timestamp: number) => {
    return format(new Date(timestamp), "MMM dd, yyyy 'at' h:mm a");
  };

  const status = getBannerStatus(banner);

  return (
    <TableRow key={banner._id}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="relative w-16 h-10 bg-gray-100 rounded border overflow-hidden flex-shrink-0">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={banner.header || "Banner"}
                fill
                className="object-cover"
                sizes="64px"
              />
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                <span className="text-xs text-gray-800">No Image</span>
              </div>
            )}
          </div>
          <div>
            <div className="font-medium text-sm">
              {banner.header || "No header"}
            </div>
            <div className="text-xs text-muted-foreground">
              CTA: {banner.cta_text || "No CTA"}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <div className="text-sm">{banner.sub_header || "No sub-header"}</div>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <Badge variant={banner.categoryId ? "secondary" : "outline"}>
            {getCategoryName(banner.categoryId)}
          </Badge>
          {!banner.categoryId && (
            <div className="text-xs text-muted-foreground">
              Displays on home screen
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          {banner.promo_type ? (
            <>
              <Badge
                variant={
                  banner.promo_type === "product" ? "default" : "outline"
                }
                className="capitalize"
              >
                {banner.promo_type}
              </Badge>
              <div className="text-xs text-muted-foreground">
                {banner.promo_type === "product" &&
                  banner.product_id &&
                  getProductName(banner.product_id)}
                {banner.promo_type === "brand" && banner.brand && banner.brand}
              </div>
            </>
          ) : (
            <Badge variant="outline">General</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1">
            <HugeiconsIcon icon={Calendar} className="h-3 w-3" />
            <span>Start: {formatDateTime(banner.start_date)}</span>
          </div>
          <div className="flex items-center gap-1">
            <HugeiconsIcon icon={Clock} className="h-3 w-3" />
            <span>End: {formatDateTime(banner.end_date)}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant={status.variant}
          className={cn("gap-1", status.isLive && "animate-pulse bg-green-600")}
        >
          {status.isLive && <div className="w-2 h-2 bg-current rounded-full" />}
          {status.label}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {banner.updated_at
          ? formatDateTime(banner.updated_at)
          : banner.created_at
            ? formatDateTime(banner.created_at)
            : "—"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <HugeiconsIcon icon={MoreHorizontal} className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(banner)} className="gap-2">
              <HugeiconsIcon icon={Eye} className="h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(banner)} className="gap-2">
              <HugeiconsIcon icon={Edit} className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onToggleStatus(banner)}
              className="gap-2"
            >
              {banner.status === "active" ? (
                <>
                  <HugeiconsIcon icon={PowerOff} className="h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={Power} className="h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(banner)}
              className="gap-2 text-destructive"
            >
              <HugeiconsIcon icon={Trash2} className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
