"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CancelCircleIcon as XCircleIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  EllipsisIcon,
} from "@hugeicons/core-free-icons";
import { useMemo, useState, useId, useRef } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { cn, formatKES } from "@/lib/utils";
import type { Id } from "@repo/backend/dataModel";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@repo/ui/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { ClearanceForm } from "./ClearanceForm";

export type ClearanceProduct = {
  _id: Id<"clearance_products">;
  name: string;
  slug: string;
  sku: string;
  brand?: string;
  category_id: Id<"categories">;
  industry_id?: Id<"industry">;
  vendor_id: Id<"vendors">;
  original_price: number;
  clearance_price: number;
  discount_percentage: number;
  quantity: number;
  expiry_date: number;
  display_end_date: number;
  status: "Active" | "Inactive" | "Sold Out" | "Expired";
  description?: string;
  barcode?: string;
  images?: (string | null)[];
  unit_value?: number;
  unit_type?: string;
  imageUrl?: string | null;
  tags?: ("Featured" | "Offer")[];
  vendor?: {
    _id: Id<"vendors">;
    name: string;
    imageUrl?: string | null;
    coordinates?: { lat: number; lng: number };
  } | null;
};

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-100 text-green-800 border-green-200",
  Inactive: "bg-gray-100 text-gray-800 border-gray-200",
  "Sold Out": "bg-orange-100 text-orange-800 border-orange-200",
  Expired: "bg-red-100 text-red-800 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_COLORS[status])}
    >
      {status}
    </Badge>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface ClearanceTableProps {
  products: ClearanceProduct[];
  categoryIdToName: Map<string, string>;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (v: string) => void;
  vendorFilter?: string;
  onVendorFilterChange?: (v: string) => void;
  categoryFilter?: string;
  onCategoryFilterChange?: (v: string) => void;
  industryFilter?: string;
  onIndustryFilterChange?: (v: string) => void;
  categories?: { _id: string; name: string }[];
  vendors?: { _id: string; name: string; status: string }[];
  industries?: { _id: string; name: string }[];
  onUpdateProduct: (values: any) => Promise<void>;
  onDeactivateProduct: (id: Id<"clearance_products">) => Promise<void>;
  onFileUpload?: (files: File[]) => Promise<string[]>;
  canUpdate: boolean;
  canCreate: boolean;
  paginationMeta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
  isLoading?: boolean;
}

export function ClearanceTable({
  products,
  categoryIdToName,
  searchQuery = "",
  onSearchQueryChange,
  statusFilter = "all",
  onStatusFilterChange,
  vendorFilter = "all",
  onVendorFilterChange,
  categoryFilter = "all",
  onCategoryFilterChange,
  industryFilter = "all",
  onIndustryFilterChange,
  categories = [],
  vendors = [],
  industries = [],
  onUpdateProduct,
  onDeactivateProduct,
  onFileUpload,
  canUpdate,
  canCreate,
  paginationMeta,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
}: ClearanceTableProps) {
  const id = useId();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);

  const columns: ColumnDef<ClearanceProduct>[] = useMemo(
    () => [
      {
        header: "Name",
        accessorKey: "name",
        cell: ({ row }) => (
          <div className="min-w-[160px]">
            <div className="font-medium">{row.getValue("name")}</div>
            {row.original.brand && (
              <div className="text-xs text-blue-600 font-medium">
                {row.original.brand}
              </div>
            )}
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.sku}
            </div>
          </div>
        ),
        size: 200,
        enableHiding: false,
      },
      {
        header: "Vendor",
        accessorKey: "vendor",
        cell: ({ row }) => (
          <div className="max-w-[140px] truncate font-medium">
            {row.original.vendor?.name ?? "—"}
          </div>
        ),
        size: 140,
      },
      {
        header: "Category",
        accessorKey: "category_id",
        cell: ({ row }) => (
          <div className="max-w-[120px] truncate">
            {categoryIdToName.get(row.original.category_id as string) ?? "—"}
          </div>
        ),
        size: 120,
      },
      {
        header: "Original",
        accessorKey: "original_price",
        cell: ({ row }) => (
          <div className="text-left text-muted-foreground line-through text-sm">
            {formatKES(row.original.original_price)}
          </div>
        ),
        size: 110,
      },
      {
        header: "Clearance",
        accessorKey: "clearance_price",
        cell: ({ row }) => (
          <div className="text-left font-semibold text-green-700">
            {formatKES(row.original.clearance_price)}
          </div>
        ),
        size: 110,
      },
      {
        header: "Discount",
        accessorKey: "discount_percentage",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200 font-medium"
          >
            -{row.original.discount_percentage}%
          </Badge>
        ),
        size: 90,
      },
      {
        header: "Qty",
        accessorKey: "quantity",
        cell: ({ row }) => (
          <div className="text-left font-mono">{row.original.quantity}</div>
        ),
        size: 60,
      },
      {
        header: "Expiry",
        accessorKey: "expiry_date",
        cell: ({ row }) => (
          <div className="text-sm">{formatDate(row.original.expiry_date)}</div>
        ),
        size: 110,
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
        size: 100,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            product={row.original}
            onUpdate={onUpdateProduct}
            onDeactivate={onDeactivateProduct}
            onFileUpload={onFileUpload}
            canUpdate={canUpdate}
            canCreate={canCreate}
            categories={categories}
            vendors={vendors}
            industries={industries}
          />
        ),
        size: 60,
        enableHiding: false,
      },
    ],
    [
      categoryIdToName,
      onUpdateProduct,
      onDeactivateProduct,
      onFileUpload,
      canUpdate,
      canCreate,
      categories,
      vendors,
      industries,
    ],
  );

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    pageCount: Math.max(1, paginationMeta.totalPages),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: {
        pageIndex: paginationMeta.page - 1,
        pageSize: paginationMeta.limit,
      },
    },
    getRowId: (row) => row._id as string,
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 py-4">
        <Input
          placeholder="Search clearance products..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange?.(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => onStatusFilterChange?.(v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
            <SelectItem value="Sold Out">Sold Out</SelectItem>
            <SelectItem value="Expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        {vendors.length > 0 && (
          <Select
            value={vendorFilter}
            onValueChange={(v) => onVendorFilterChange?.(v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v._id} value={v._id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {categories.length > 0 && (
          <Select
            value={categoryFilter}
            onValueChange={(v) => onCategoryFilterChange?.(v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {industries.length > 0 && (
          <Select
            value={industryFilter}
            onValueChange={(v) => onIndustryFilterChange?.(v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {industries.map((i) => (
                <SelectItem key={i._id} value={i._id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: `${header.getSize()}px` }}
                    className="h-11"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Loading...
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No clearance products found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <Label
            htmlFor={`${id}-page-size`}
            className="text-sm whitespace-nowrap"
          >
            Rows per page
          </Label>
          <Select
            value={String(paginationMeta.limit)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger id={`${id}-page-size`} className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            Page {paginationMeta.page} of {paginationMeta.totalPages}
            {" · "}
            {paginationMeta.total} total
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={!paginationMeta.hasPrevious}
                  onClick={() => onPageChange(1)}
                >
                  <HugeiconsIcon icon={ChevronFirstIcon} size={16} />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={!paginationMeta.hasPrevious}
                  onClick={() => onPageChange(paginationMeta.page - 1)}
                >
                  <HugeiconsIcon icon={ChevronLeftIcon} size={16} />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={!paginationMeta.hasNext}
                  onClick={() => onPageChange(paginationMeta.page + 1)}
                >
                  <HugeiconsIcon icon={ChevronRightIcon} size={16} />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={!paginationMeta.hasNext}
                  onClick={() => onPageChange(paginationMeta.totalPages)}
                >
                  <HugeiconsIcon icon={ChevronLastIcon} size={16} />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}

// ── Row Actions ───────────────────────────────────────────────
function RowActions({
  product,
  onUpdate,
  onDeactivate,
  onFileUpload,
  canUpdate,
  canCreate,
  categories,
  vendors,
  industries,
}: {
  product: ClearanceProduct;
  onUpdate: (values: any) => Promise<void>;
  onDeactivate: (id: Id<"clearance_products">) => Promise<void>;
  onFileUpload?: (files: File[]) => Promise<string[]>;
  canUpdate: boolean;
  canCreate: boolean;
  categories: { _id: string; name: string }[];
  vendors: { _id: string; name: string; status: string }[];
  industries: { _id: string; name: string }[];
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);

  if (!canUpdate && !canCreate) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Actions">
            <HugeiconsIcon icon={EllipsisIcon} size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {canUpdate && (
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <HugeiconsIcon icon={EditIcon} size={16} className="mr-2" />
                Edit
              </DropdownMenuItem>
            )}
            {canCreate && product.status === "Active" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeactivateDialog(true)}
                  className="text-destructive"
                >
                  <HugeiconsIcon icon={XCircleIcon} size={16} className="mr-2" />
                  Deactivate
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Clearance Product</DialogTitle>
          </DialogHeader>
          <ClearanceForm
            categories={categories}
            vendors={vendors}
            industries={industries}
            isEditMode
            initialValues={{
              name: product.name,
              sku: product.sku,
              description: product.description || "",
              barcode: product.barcode || "",
              brand: product.brand || "",
              category_id: product.category_id as string,
              industry_id: (product.industry_id as string) || "",
              vendor_id: product.vendor_id as string,
              original_price: String(product.original_price),
              clearance_price: String(product.clearance_price),
              quantity: String(product.quantity),
              expiry_date: new Date(product.expiry_date)
                .toISOString()
                .split("T")[0],
              unit_type: product.unit_type || "",
              unit_value: product.unit_value ? String(product.unit_value) : "",
              images: product.imageUrl ? [product.imageUrl] : [],
              tags: product.tags || [],
            }}
            onSubmit={async (values) => {
              await onUpdate({ id: product._id, ...values });
              setShowEditDialog(false);
            }}
            onCancel={() => setShowEditDialog(false)}
            onFileUpload={onFileUpload}
          />
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog
        open={showDeactivateDialog}
        onOpenChange={setShowDeactivateDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate clearance product?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{product.name}&quot; will be hidden from customers. You can
              reactivate it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await onDeactivate(product._id);
                setShowDeactivateDialog(false);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
