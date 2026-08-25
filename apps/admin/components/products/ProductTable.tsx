"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleXIcon,
  EditIcon,
  EllipsisIcon,
  FilterIcon,
  Grid3X2Icon as Columns3Icon,
  ListFilterIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  TagIcon,
  TrashIcon,
} from "@hugeicons/core-free-icons";
import type React from "react";
import { ProductForm } from "./ProductForm";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { MoveToClearanceDialog } from "@/components/clearance/MoveToClearanceDialog";

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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@repo/ui/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";

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
  DialogDescription,
  DialogFooter,
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

type Product = {
  _id: Id<"products">;
  name: string;
  slug: string;
  sku: string;
  brand?: string;
  category_id: Id<"categories">;
  price: number;
  quantity: number;
  status: "Active" | "Inactive" | "Archived";
  description?: string;
  images?: (string | null)[];
  image_storage_ids?: string[];
  upc?: number;
  vendor_id?: Id<"vendors">;
  vendor_location?: { address: string; lat: number; lng: number };
  tags?: ("Featured" | "Offer" | "Hot")[];
  external_id?: string;
  unit_value?: number;
  unit_type?: string;
  created_at?: number;
  updated_at?: number;
};

const multiColumnFilterFn: FilterFn<Product> = (row, columnId, filterValue) => {
  const searchableRowContent =
    `${row.original.name} ${row.original.sku} ${row.original.brand || ""}`.toLowerCase();
  const searchTerm = (filterValue ?? "").toLowerCase();
  return searchableRowContent.includes(searchTerm);
};

const statusFilterFn: FilterFn<Product> = (
  row,
  columnId,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true;
  const status = row.getValue(columnId) as string;
  return filterValue.includes(status);
};

const categoryFilterFn: FilterFn<Product> = (
  row,
  columnId,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true;
  const categoryId = row.getValue(columnId) as string;
  return filterValue.includes(categoryId);
};

export function ProductTable({
  products,
  categoryIdToName,
  searchQuery = "",
  onSearchQueryChange,
  statusFilter = "all",
  onStatusFilterChange,
  categoryFilter = "all",
  onCategoryFilterChange,
  vendorFilter = "all",
  onVendorFilterChange,
  onUpdateProduct,
  selectedIds,
  onSelectedIdsChange,
  onDeleteProduct,
  categories = [],
  vendors = [],
  updateSingleProductStatus,
  bulkUpdateProductStatus,
  industries = [],
  canMoveToClearance = false,
  onFileUpload,
  paginationMeta,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
}: {
  products: Product[];
  categoryIdToName: Map<string, string>;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  statusFilter?: "all" | "Active" | "Inactive" | "Archived";
  onStatusFilterChange?: (
    val: "all" | "Active" | "Inactive" | "Archived",
  ) => void;
  categoryFilter?: string;
  onCategoryFilterChange?: (val: string) => void;
  vendorFilter?: string;
  onVendorFilterChange?: (val: string) => void;
  onUpdateProduct: (product: {
    id: Id<"products">;
    name: string;
    slug: string;
    sku: string;
    category_id: Id<"categories">;
    price: number;
    quantity: number;
    status: Product["status"];
    image?: string;
    description?: string;
    upc?: number;
    vendor_id: string;
    vendor_location: { address: string; lat: number; lng: number };
    tags: ("Featured" | "Offer" | "Hot")[];
    external_id?: string;
  }) => Promise<void>;
  selectedIds: Id<"products">[];
  onSelectedIdsChange: (ids: Id<"products">[]) => void;
  onDeleteProduct?: (id: Id<"products">) => Promise<void>;
  categories?: { _id: Id<"categories">; name: string }[];
  vendors?: { _id: Id<"vendors">; name: string; status: string }[];
  updateSingleProductStatus?: (
    productId: Id<"products">,
    status: Product["status"],
  ) => Promise<void>;
  bulkUpdateProductStatus?: (
    productIds: Id<"products">[],
    status: Product["status"],
  ) => Promise<void>;
  industries?: { _id: string; name: string }[];
  canMoveToClearance?: boolean;
  onFileUpload?: (files: File[]) => Promise<string[]>;
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
}) {
  const id = useId();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "name",
      desc: false,
    },
  ]);

  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<
    Product["status"] | null
  >(null);

  const columns: ColumnDef<Product>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        size: 28,
        enableSorting: false,
        enableHiding: false,
      },
      {
        header: "Name",
        accessorKey: "name",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.getValue("name")}</div>
            {row.original.brand && (
              <div className="text-xs text-blue-600 font-medium">
                {row.original.brand}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {row.original.slug}
            </div>
          </div>
        ),
        size: 200,
        filterFn: multiColumnFilterFn,
        enableHiding: false,
      },
      {
        header: "SKU",
        accessorKey: "sku",
        cell: ({ row }) => (
          <div className="text-left font-mono text-sm">
            {row.getValue("sku")}
          </div>
        ),
        size: 120,
      },
      {
        header: "Category",
        accessorKey: "category_id",
        cell: ({ row }) => (
          <div>
            {categoryIdToName.get(
              row.original.category_id as unknown as string,
            ) ?? "—"}
          </div>
        ),
        size: 150,
        filterFn: categoryFilterFn,
      },
      {
        header: "Price",
        accessorKey: "price",
        cell: ({ row }) => {
          const amount = Number.parseFloat(row.getValue("price"));
          return <div className="text-left">{formatKES(amount)}</div>;
        },
        size: 140,
      },
      {
        header: "Quantity",
        accessorKey: "quantity",
        cell: ({ row }) => (
          <div className="text-left font-mono">{row.getValue("quantity")}</div>
        ),
        size: 100,
      },
      {
        header: "Unit",
        accessorKey: "unit",
        cell: ({ row }) => {
          const unitValue = row.original.unit_value;
          const unitType = row.original.unit_type;

          if (!unitValue || !unitType) {
            return <div className="text-left text-muted-foreground">—</div>;
          }

          return (
            <div className="text-left font-mono">
              {unitValue}
              {unitType}
            </div>
          );
        },
        size: 100,
        enableSorting: false,
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
        size: 120,
        filterFn: statusFilterFn,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            row={row}
            onUpdateProduct={onUpdateProduct}
            onDeleteProduct={onDeleteProduct}
            categories={categories}
            vendors={vendors}
            industries={industries}
            updateSingleProductStatus={updateSingleProductStatus}
            canMoveToClearance={canMoveToClearance}
            onFileUpload={onFileUpload}
          />
        ),
        size: 60,
        enableHiding: false,
      },
    ],
    [
      categoryIdToName,
      onUpdateProduct,
      onDeleteProduct,
      categories,
      vendors,
      industries,
      updateSingleProductStatus,
      canMoveToClearance,
      onFileUpload,
    ],
  );

  const handleBulkStatusUpdate = async (newStatus: Product["status"]) => {
    setPendingBulkStatus(newStatus);
    setShowBulkStatusDialog(true);
  };

  const executeBulkStatusUpdate = async () => {
    if (
      !pendingBulkStatus ||
      !bulkUpdateProductStatus ||
      selectedIds.length === 0
    ) {
      console.error("Missing requirements for bulk update:", {
        pendingBulkStatus,
        hasBulkUpdateFunction: !!bulkUpdateProductStatus,
        selectedIdsCount: selectedIds.length,
        selectedIds,
      });
      return;
    }

    // Filter out any undefined values and validate all IDs
    const validIds = selectedIds.filter(
      (id): id is Id<"products"> =>
        id != null && typeof id === "string" && id.trim() !== "",
    );

    if (validIds.length === 0) {
      console.error("No valid product IDs to update");
      return;
    }

    console.log("Executing bulk status update:", {
      status: pendingBulkStatus,
      productIds: validIds,
    });

    try {
      await bulkUpdateProductStatus(validIds, pendingBulkStatus);
      table.resetRowSelection();
      setShowBulkStatusDialog(false);
      setPendingBulkStatus(null);
    } catch (error) {
      console.error("Failed to bulk update product status:", error);
    }
  };

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
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: true,
    pageCount: Math.max(1, paginationMeta.totalPages),
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({
              pageIndex: paginationMeta.page - 1,
              pageSize: paginationMeta.limit,
            })
          : updater;
      if (next.pageSize !== paginationMeta.limit) {
        onPageSizeChange(next.pageSize);
      }
      if (next.pageIndex !== paginationMeta.page - 1) {
        onPageChange(next.pageIndex + 1);
      }
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination: {
        pageIndex: paginationMeta.page - 1,
        pageSize: paginationMeta.limit,
      },
      rowSelection,
    },
    getRowId: (row) => row._id as string,
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(next);

      const currentPageIds = products.map((p) => p._id);

      const currentPageSelectedIds = currentPageIds.filter(
        (id) => next[id as string] === true,
      );

      const globalSelectedSet = new Set(selectedIds);
      currentPageIds.forEach((id) => globalSelectedSet.delete(id));

      currentPageSelectedIds.forEach((id) => globalSelectedSet.add(id));

      const newGlobalSelection = Array.from(globalSelectedSet);

      console.log("Row selection changed:", {
        currentPageIds: currentPageIds.map((id) => id as string),
        currentPageSelectedIds: currentPageSelectedIds.map(
          (id) => id as string,
        ),
        newGlobalSelection: newGlobalSelection.map((id) => id as string),
      });

      onSelectedIdsChange(newGlobalSelection);
    },
  });

  // Sync row selection with global selected IDs
  useEffect(() => {
    const newRowSelection: Record<string, boolean> = {};
    const selectedSet = new Set(selectedIds.map((id) => id as string));

    products.forEach((product) => {
      const productId = product._id as string;
      newRowSelection[productId] = selectedSet.has(productId);
    });

    setRowSelection(newRowSelection);
  }, [products, selectedIds]);

  const uniqueStatusValues = useMemo(() => {
    const statusColumn = table.getColumn("status");
    if (!statusColumn) return [];
    const values = Array.from(statusColumn.getFacetedUniqueValues().keys());
    return values.sort();
  }, [table.getColumn("status")?.getFacetedUniqueValues()]);

  const statusCounts = useMemo(() => {
    const statusColumn = table.getColumn("status");
    if (!statusColumn) return new Map();
    return statusColumn.getFacetedUniqueValues();
  }, [table.getColumn("status")?.getFacetedUniqueValues()]);

  const selectedStatuses = useMemo(() => {
    const filterValue = table.getColumn("status")?.getFilterValue() as string[];
    return filterValue ?? [];
  }, [table.getColumn("status")?.getFilterValue()]);

  const uniqueCategoryValues = useMemo(() => {
    const columnValues = table
      .getColumn("category_id")
      ?.getFacetedUniqueValues();
    return Array.from(columnValues?.keys() ?? [])
      .filter((value) => value !== undefined && value !== "")
      .sort();
  }, [table.getColumn("category_id")?.getFacetedUniqueValues()]);

  const categoryCounts = useMemo(() => {
    return (
      table.getColumn("category_id")?.getFacetedUniqueValues() ?? new Map()
    );
  }, [table.getColumn("category_id")?.getFacetedUniqueValues()]);

  const selectedCategories = useMemo(() => {
    const filterValue = table
      .getColumn("category_id")
      ?.getFilterValue() as string[];
    return filterValue ?? [];
  }, [table.getColumn("category_id")?.getFilterValue()]);

  const handleStatusChange = (checked: boolean, value: string) => {
    const filterValue = table.getColumn("status")?.getFilterValue() as string[];
    const newFilterValue = filterValue ? [...filterValue] : [];

    if (checked) {
      newFilterValue.push(value);
    } else {
      const index = newFilterValue.indexOf(value);
      if (index > -1) {
        newFilterValue.splice(index, 1);
      }
    }

    table
      .getColumn("status")
      ?.setFilterValue(newFilterValue.length ? newFilterValue : undefined);
  };

  const handleCategoryChange = (checked: boolean, value: string) => {
    const filterValue = table
      .getColumn("category_id")
      ?.getFilterValue() as string[];
    const newFilterValue = filterValue ? [...filterValue] : [];

    if (checked) {
      newFilterValue.push(value);
    } else {
      const index = newFilterValue.indexOf(value);
      if (index > -1) {
        newFilterValue.splice(index, 1);
      }
    }

    table
      .getColumn("category_id")
      ?.setFilterValue(newFilterValue.length ? newFilterValue : undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Input
              id={`${id}-input`}
              ref={inputRef}
              className={cn(
                "peer min-w-60 ps-9",
                Boolean(searchQuery) && "pe-9",
              )}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange?.(e.target.value)}
              placeholder="Search by name, SKU, or brand..."
              type="text"
              aria-label="Search products"
            />
            <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
              <HugeiconsIcon icon={ListFilterIcon} size={16} aria-hidden="true" />
            </div>
            {Boolean(searchQuery) && (
              <button
                className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Clear filter"
                onClick={() => {
                  onSearchQueryChange?.("");
                  if (inputRef.current) {
                    inputRef.current.focus();
                  }
                }}
              >
                <HugeiconsIcon icon={CircleXIcon} size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <Select
            value={statusFilter}
            onValueChange={(val) =>
              onStatusFilterChange?.(
                val as "all" | "Active" | "Inactive" | "Archived",
              )
            }
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="Archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={categoryFilter}
            onValueChange={(val) => onCategoryFilterChange?.(val)}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat._id} value={cat._id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={vendorFilter}
            onValueChange={(val) => onVendorFilterChange?.(val)}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v._id} value={v._id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <HugeiconsIcon icon={Columns3Icon}
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <HugeiconsIcon icon={RefreshCwIcon}
                    className="-ms-1 opacity-60"
                    size={16}
                    aria-hidden="true" />
                  Update Status
                  <span className="bg-background text-muted-foreground/70 -me-1 inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium">
                    {selectedIds.length}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Update selected to:</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleBulkStatusUpdate("Active")}
                >
                  Active
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBulkStatusUpdate("Inactive")}
                >
                  Inactive
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleBulkStatusUpdate("Archived")}
                >
                  Archived
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="bg-background overflow-hidden rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: `${header.getSize()}px` }}
                      className="h-11"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <div
                          className={cn(
                            header.column.getCanSort() &&
                              "flex h-full cursor-pointer items-center justify-between gap-2 select-none",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            if (
                              header.column.getCanSort() &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {{
                            asc: (
                              <HugeiconsIcon icon={ChevronUpIcon}
                                className="shrink-0 opacity-60"
                                size={16}
                                aria-hidden="true" />
                            ),
                            desc: (
                              <HugeiconsIcon icon={ChevronDownIcon}
                                className="shrink-0 opacity-60"
                                size={16}
                                aria-hidden="true" />
                            ),
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`loading-${index}`}>
                  <TableCell>
                    <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-10 w-10 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <div className="h-5 w-12 bg-muted animate-pulse rounded-full" />
                      <div className="h-5 w-10 bg-muted animate-pulse rounded-full" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="last:py-0">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No products found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <Label htmlFor={id} className="max-sm:sr-only">
            Rows per page
          </Label>
          <Select
            value={String(paginationMeta.limit)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger id={id} className="w-fit whitespace-nowrap">
              <SelectValue placeholder="Select number of results" />
            </SelectTrigger>
            <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2">
              {[5, 10, 25, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-muted-foreground flex grow justify-end text-sm whitespace-nowrap">
          <p
            className="text-muted-foreground text-sm whitespace-nowrap"
            aria-live="polite"
          >
            <span className="text-foreground">
              {paginationMeta.total === 0
                ? 0
                : (paginationMeta.page - 1) * paginationMeta.limit + 1}
              -
              {Math.min(
                paginationMeta.page * paginationMeta.limit,
                paginationMeta.total,
              )}
            </span>{" "}
            of{" "}
            <span className="text-foreground">
              {paginationMeta.total.toString()}
            </span>
          </p>
        </div>

        <div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                  onClick={() => onPageChange(1)}
                  disabled={isLoading || !paginationMeta.hasPrevious}
                  aria-label="Go to first page"
                >
                  <HugeiconsIcon icon={ChevronFirstIcon} size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                  onClick={() => onPageChange(paginationMeta.page - 1)}
                  disabled={isLoading || !paginationMeta.hasPrevious}
                  aria-label="Go to previous page"
                >
                  <HugeiconsIcon icon={ChevronLeftIcon} size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                  onClick={() => onPageChange(paginationMeta.page + 1)}
                  disabled={isLoading || !paginationMeta.hasNext}
                  aria-label="Go to next page"
                >
                  <HugeiconsIcon icon={ChevronRightIcon} size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50 bg-transparent"
                  onClick={() => onPageChange(paginationMeta.totalPages)}
                  disabled={isLoading || !paginationMeta.hasNext}
                  aria-label="Go to last page"
                >
                  <HugeiconsIcon icon={ChevronLastIcon} size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>

      <AlertDialog
        open={showBulkStatusDialog}
        onOpenChange={setShowBulkStatusDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Product Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update {selectedIds.length} selected
              product
              {selectedIds.length === 1 ? "" : "s"} to "{pendingBulkStatus}"
              status? This action will change the status of all selected
              products.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingBulkStatus(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkStatusUpdate}>
              Update Status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: Product["status"] }) {
  return (
    <Badge
      className={cn(
        status === "Active" &&
          "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
        status === "Inactive" &&
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
        status === "Archived" &&
          "bg-muted-foreground/60 text-primary-foreground",
      )}
    >
      {status}
    </Badge>
  );
}

function EditProductForm({
  product,
  categories,
  vendors,
  onSubmit,
  onCancel,
}: {
  product: Product;
  categories: { _id: Id<"categories">; name: string }[];
  vendors: { _id: string; name: string; status: string }[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  // Transform product data to match ProductForm expected format
  const initialValues = {
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    brand: product.brand || "",
    category_id: product.category_id,
    vendor_id: product.vendor_id || "",
    price: product.price.toString(),
    quantity: product.quantity.toString(),
    description: product.description || "",
    status: product.status,
    tags: product.tags || [],
    upc: product.upc ? String(product.upc) : "",
    external_id: product.external_id || "",
    images: product.images,
  };

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <ProductForm
        categories={categories}
        vendors={vendors}
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialValues={initialValues}
        isEditMode={true}
        productId={product._id}
      />
    </div>
  );
}

function RowActions({
  row,
  onUpdateProduct,
  onDeleteProduct,
  categories,
  vendors,
  industries,
  updateSingleProductStatus,
  canMoveToClearance,
  onFileUpload,
}: {
  row: Row<Product>;
  onUpdateProduct: (product: any) => Promise<void>;
  onDeleteProduct?: (id: Id<"products">) => Promise<void>;
  categories: { _id: Id<"categories">; name: string }[];
  vendors: { _id: string; name: string; status: string }[];
  industries: { _id: string; name: string }[];
  updateSingleProductStatus?: (
    id: Id<"products">,
    status: Product["status"],
  ) => Promise<void>;
  canMoveToClearance: boolean;
  onFileUpload?: (files: File[]) => Promise<string[]>;
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearanceDialog, setShowClearanceDialog] = useState(false);

  const handleEdit = async (data: any) => {
    await onUpdateProduct(data);
    setShowEditDialog(false);
  };

  const handleDelete = async () => {
    if (onDeleteProduct) {
      await onDeleteProduct(row.original._id);
    }
    setShowDeleteDialog(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex justify-end">
            <Button
              size="icon"
              variant="ghost"
              className="shadow-none"
              aria-label="Product actions"
            >
              <HugeiconsIcon icon={EllipsisIcon} size={16} aria-hidden="true" />
            </Button>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
              <HugeiconsIcon icon={EditIcon} size={16} className="mr-2" />
              <span>Edit</span>
              <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive"
            >
              <HugeiconsIcon icon={TrashIcon} size={16} className="mr-2" />
              <span>Delete</span>
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
            {canMoveToClearance && row.original.status === "Active" && (
              <DropdownMenuItem onClick={() => setShowClearanceDialog(true)}>
                <HugeiconsIcon icon={TagIcon} size={16} className="mr-2" />
                <span>Move to Clearance</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={RotateCcwIcon} size={16} className="mr-2" />
                Change Status
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={async () => {
                      if (updateSingleProductStatus) {
                        await updateSingleProductStatus(
                          row.original._id,
                          "Active",
                        );
                      }
                    }}
                  >
                    Active
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      if (updateSingleProductStatus) {
                        await updateSingleProductStatus(
                          row.original._id,
                          "Inactive",
                        );
                      }
                    }}
                  >
                    Inactive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      if (updateSingleProductStatus) {
                        await updateSingleProductStatus(
                          row.original._id,
                          "Archived",
                        );
                      }
                    }}
                  >
                    Archived
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update the product information. Only modified fields will be
              saved.
            </DialogDescription>
          </DialogHeader>
          <EditProductForm
            product={row.original}
            categories={categories}
            vendors={vendors}
            onSubmit={handleEdit}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{row.original.name}&quot;?
              This action cannot be undone and will permanently remove the
              product from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canMoveToClearance && onFileUpload && (
        <MoveToClearanceDialog
          open={showClearanceDialog}
          onOpenChange={setShowClearanceDialog}
          product={row.original}
          categories={categories}
          vendors={vendors}
          industries={industries}
          onFileUpload={onFileUpload}
        />
      )}
    </>
  );
}
