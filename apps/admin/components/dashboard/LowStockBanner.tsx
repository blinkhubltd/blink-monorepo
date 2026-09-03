"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon as AlertTriangle,
  PackageIcon as Package,
  ViewIcon as Eye,
  XIcon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@repo/ui/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Id } from "@repo/backend/dataModel";

interface LowStockBannerProps {
  className?: string;
}

export function LowStockBanner({ className }: LowStockBannerProps) {
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  // Get vendor ID(s) for managers
  const vendorId = user?.manager_details?.vendor_id?.[0] ?? undefined;

  // Fetch stock alerts. The permission check is server-side now
  // (`hasPermission(ctx, "products:READ")`) — `userRole` was a client-supplied
  // string the query used to trust as-is.
  const stockAlerts = useQuery(
    api.data.stock_alerts.getStockAlerts,
    user
      ? {
          vendorId: vendorId,
        }
      : "skip",
  );

  // Don't show banner if user doesn't have permission or no issues
  if (
    !user ||
    !stockAlerts?.showAlerts ||
    stockAlerts.totalIssues === 0 ||
    !isVisible
  ) {
    return null;
  }

  const {
    lowStockProducts,
    outOfStockProducts,
    totalLowStock,
    totalOutOfStock,
    totalIssues,
  } = stockAlerts;

  // Determine the primary issue to display
  const primaryIssue =
    outOfStockProducts.length > 0 ? outOfStockProducts[0] : lowStockProducts[0];
  const isOutOfStock = outOfStockProducts.length > 0;

  // totalIssues is a separate count from the two arrays, so it can be non-zero
  // while both are empty — a filtered query, or a count computed over a wider
  // set than the one returned. Every message below reads primaryIssue.name, so
  // without this the banner throws instead of rendering.
  if (!primaryIssue) return null;

  // Create the banner message
  const getBannerMessage = () => {
    if (totalIssues === 1) {
      if (isOutOfStock) {
        return `${primaryIssue.name} is out of stock`;
      } else {
        return `${primaryIssue.name} is low on stock (${primaryIssue.quantity} remaining)`;
      }
    } else {
      const otherCount = totalIssues - 1;
      if (isOutOfStock) {
        return `${primaryIssue.name} and ${otherCount} other${otherCount > 1 ? "s" : ""} are out of stock`;
      } else {
        return `${primaryIssue.name} and ${otherCount} other${otherCount > 1 ? "s" : ""} are low on stock`;
      }
    }
  };

  const getStockBadge = (quantity: number) => {
    if (quantity === 0) {
      return (
        <Badge variant="destructive" className="text-xs">
          Out of Stock
        </Badge>
      );
    } else if (quantity <= 5) {
      return (
        <Badge
          variant="outline"
          className="text-xs border-orange-300 text-orange-700"
        >
          Low Stock
        </Badge>
      );
    }
    return null;
  };

  return (
    <>
      <div
        className={`bg-orange-50 border-l-4 border-orange-400 px-4 py-3 text-orange-800 ${className}`}
      >
        <div className="flex gap-2 md:items-center">
          <div className="flex grow gap-3 md:items-center">
            <HugeiconsIcon icon={AlertTriangle}
              className="shrink-0 text-orange-600 max-md:mt-0.5"
              size={16}
              aria-hidden="true" />
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Package} size={14} className="text-orange-600" />
                <p className="text-sm font-medium">{getBannerMessage()}</p>
                {totalIssues > 1 && (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-orange-100 text-orange-800"
                  >
                    {totalIssues} items
                  </Badge>
                )}
              </div>
              {totalIssues > 1 && (
                <div className="flex gap-2 max-md:flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-orange-700 border-orange-300 hover:bg-orange-100"
                    onClick={() => setShowDialog(true)}
                  >
                    <HugeiconsIcon icon={Eye} size={12} className="mr-1" />
                    View all
                  </Button>
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            className="group -my-1.5 -me-2 size-8 shrink-0 p-0 hover:bg-transparent"
            onClick={() => setIsVisible(false)}
            aria-label="Close banner"
          >
            <HugeiconsIcon icon={XIcon}
              size={16}
              className="opacity-60 transition-opacity group-hover:opacity-100 text-orange-600"
              aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Stock Issues Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={AlertTriangle} className="h-5 w-5 text-orange-600" />
              Stock Issues
              <Badge
                variant="secondary"
                className="bg-orange-100 text-orange-800"
              >
                {totalIssues} items
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Products that are out of stock or running low on inventory
              {user?.role === "HUB MANAGER" && primaryIssue.vendor && (
                <span className="block mt-1 text-xs text-muted-foreground">
                  Showing items for: {primaryIssue.vendor.name}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  {user?.role !== "HUB MANAGER" && (
                    <TableHead>Vendor</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Out of stock items first */}
                {outOfStockProducts.map((product: any) => (
                  <TableRow key={product._id} className="bg-red-50">
                    <TableCell>
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          SKU: {product.sku}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {product.category?.name || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-red-600">0</span>
                    </TableCell>
                    <TableCell>{getStockBadge(product.quantity)}</TableCell>
                    {user?.role !== "HUB MANAGER" && (
                      <TableCell>
                        <span className="text-sm">
                          {product.vendor?.name || "—"}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                ))}

                {/* Low stock items */}
                {lowStockProducts.map((product: any) => (
                  <TableRow key={product._id} className="bg-orange-50">
                    <TableCell>
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          SKU: {product.sku}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {product.category?.name || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-orange-600">
                        {product.quantity}
                      </span>
                    </TableCell>
                    <TableCell>{getStockBadge(product.quantity)}</TableCell>
                    {user?.role !== "HUB MANAGER" && (
                      <TableCell>
                        <span className="text-sm">
                          {product.vendor?.name || "—"}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {totalOutOfStock > 0 && (
                <span className="text-red-600 font-medium">
                  {totalOutOfStock} out of stock
                </span>
              )}
              {totalOutOfStock > 0 && totalLowStock > 0 && " • "}
              {totalLowStock > 0 && (
                <span className="text-orange-600 font-medium">
                  {totalLowStock} low stock
                </span>
              )}
            </div>
            <Button onClick={() => setShowDialog(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
