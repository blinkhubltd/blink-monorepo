"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon as Trash2,
  EditIcon as Edit,
  MoreHorizontalIcon as MoreHorizontal,
  PowerIcon as Power,
  PowerOffIcon as PowerOff,
  Store01Icon as Store,
} from "@hugeicons/core-free-icons";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
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
import { format } from "date-fns";
import type { Brand } from "./types";

interface BrandRowProps {
  brand: Brand;
  productCount: number;
  onEdit: (brand: Brand) => void;
  onDelete: (brand: Brand) => void;
  onToggleStatus: (brand: Brand) => void;
}

export function BrandRow({
  brand,
  productCount,
  onEdit,
  onDelete,
  onToggleStatus,
}: BrandRowProps) {
  const logoUrl = useQuery(
    api.data.files.getImageUrl,
    brand.logo ? { storageId: brand.logo } : "skip",
  );

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={brand.name}
              className="h-10 w-10 rounded-full border object-contain"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-muted text-muted-foreground">
              <HugeiconsIcon icon={Store} className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{brand.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              /brand/{brand.slug}
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell className="max-w-xs">
        <p className="truncate text-sm text-muted-foreground">
          {brand.description || "—"}
        </p>
      </TableCell>

      <TableCell>
        <span className="text-sm">{productCount}</span>
      </TableCell>

      <TableCell>
        <Badge variant={brand.status === "active" ? "default" : "secondary"}>
          {brand.status === "active" ? "Active" : "Inactive"}
        </Badge>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        {brand.created_at
          ? format(new Date(brand.created_at), "MMM dd, yyyy")
          : "—"}
      </TableCell>

      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <HugeiconsIcon icon={MoreHorizontal} className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(brand)}>
              <HugeiconsIcon icon={Edit} className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleStatus(brand)}>
              <HugeiconsIcon
                icon={brand.status === "active" ? PowerOff : Power}
                className="mr-2 h-4 w-4"
              />
              {brand.status === "active" ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(brand)}
            >
              <HugeiconsIcon icon={Trash2} className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
