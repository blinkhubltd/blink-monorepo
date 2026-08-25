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
  FolderIcon,
  FolderOpenIcon,
  Grid3X2Icon as Columns3Icon,
  ListFilterIcon,
  TrashIcon,
} from "@hugeicons/core-free-icons";
import type React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
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

import { cn } from "@/lib/utils";
import type { Id } from "@repo/backend/dataModel";
import { Badge } from "@repo/ui/components/ui/badge";
import { CategoryForm } from "./CategoryForm";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
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
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";

type Category = {
  _id: Id<"categories">;
  name: string;
  slug: string;
  parent_category_id?: Id<"categories">;
  description?: string;
  image?: Id<"_storage">;
  status: "active" | "inactive";
  sort_order: number;
  created_at?: number;
  updated_at?: number;
};

type CategoryNode = Category & { children: CategoryNode[]; level: number };

const multiColumnFilterFn = (
  row: any,
  columnId: string,
  filterValue: string,
) => {
  const searchableRowContent =
    `${row.original.name} ${row.original.slug}`.toLowerCase();
  const searchTerm = (filterValue ?? "").toLowerCase();
  return searchableRowContent.includes(searchTerm);
};

export function CategoryTable({
  categories,
  searchQuery = "",
  onSearchQueryChange,
  onUpdateCategory,
  onDeleteCategory,
  onSelectionChange,
  paginationMeta,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  statusFilter,
  onStatusFilterChange,
}: {
  categories: Category[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onUpdateCategory: (category: any) => Promise<void>;
  onDeleteCategory: (id: Id<"categories">) => Promise<void>;
  onSelectionChange?: (ids: Id<"categories">[]) => void;
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
  statusFilter?: "active" | "inactive" | "all";
  onStatusFilterChange?: (value: "active" | "inactive" | "all") => void;
}) {
  const id = useId();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "sort_order",
      desc: false,
    },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);

  const hierarchicalCategories = useMemo(() => {
    const categoryMap = new Map<Id<"categories">, CategoryNode>();
    const rootCategories: CategoryNode[] = [];

    // Initialize all categories with children array and level
    categories.forEach((cat) => {
      categoryMap.set(cat._id, { ...cat, children: [], level: 0 });
    });

    // Build hierarchy
    categories.forEach((cat) => {
      const categoryWithChildren = categoryMap.get(cat._id)!;
      if (cat.parent_category_id) {
        const parent = categoryMap.get(cat.parent_category_id);
        if (parent) {
          parent.children.push(categoryWithChildren);
          categoryWithChildren.level = parent.level + 1;
        } else {
          // Parent is not in the current filtered set — treat as a root item
          rootCategories.push(categoryWithChildren);
        }
      } else {
        rootCategories.push(categoryWithChildren);
      }
    });

    // Flatten for table display while maintaining hierarchy info
    const flattenWithHierarchy = (cats: CategoryNode[]): CategoryNode[] => {
      const result: CategoryNode[] = [];
      cats.forEach((cat) => {
        result.push(cat);
        if (cat.children.length > 0) {
          result.push(...flattenWithHierarchy(cat.children));
        }
      });
      return result;
    };

    return flattenWithHierarchy(rootCategories);
  }, [categories]);

  const columns: ColumnDef<CategoryNode>[] = useMemo(
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
        header: "Category",
        accessorKey: "name",
        cell: ({ row }) => {
          const category = row.original;
          const hasChildren = category.children.length > 0;
          return (
            <div className="flex items-center gap-2">
              <div
                style={{ marginLeft: `${category.level * 24}px` }}
                className="flex items-center gap-2"
              >
                {hasChildren ? (
                  <HugeiconsIcon icon={FolderOpenIcon} size={16} className="text-muted-foreground" />
                ) : (
                  <HugeiconsIcon icon={FolderIcon} size={16} className="text-muted-foreground" />
                )}
                <div>
                  <div className="font-medium">{category.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {category.slug}
                  </div>
                </div>
              </div>
            </div>
          );
        },
        size: 300,
        filterFn: multiColumnFilterFn,
        enableHiding: false,
      },
      {
        header: "Description",
        accessorKey: "description",
        cell: ({ row }) => (
          <div
            className="max-w-xs truncate"
            title={row.getValue("description")}
          >
            {row.getValue("description") || "—"}
          </div>
        ),
        size: 200,
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
        size: 120,
      },
      {
        header: "Sort Order",
        accessorKey: "sort_order",
        cell: ({ row }) => (
          <div className="text-center">{row.getValue("sort_order")}</div>
        ),
        size: 100,
      },
      {
        header: "Children",
        accessorKey: "children",
        cell: ({ row }) => {
          const childCount = row.original.children.length;
          return (
            <div className="text-center">
              {childCount > 0 ? (
                <Badge variant="secondary" className="text-xs">
                  {childCount}
                </Badge>
              ) : (
                "—"
              )}
            </div>
          );
        },
        size: 80,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            row={row}
            onUpdateCategory={onUpdateCategory}
            onDeleteCategory={onDeleteCategory}
            categories={categories}
          />
        ),
        size: 60,
        enableHiding: false,
      },
    ],
    [onUpdateCategory, onDeleteCategory, categories],
  );

  const table = useReactTable({
    data: hierarchicalCategories,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
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
      if (next.pageSize !== paginationMeta.limit)
        onPageSizeChange(next.pageSize);
      if (next.pageIndex !== paginationMeta.page - 1)
        onPageChange(next.pageIndex + 1);
    },
    getRowId: (row) => row._id as unknown as string,
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(next);
      const currentIds = hierarchicalCategories.map(
        (c) => c._id as unknown as string,
      );
      const currentSelected = currentIds.filter((id) => Boolean(next[id]));
      onSelectionChange?.(currentSelected as unknown as Id<"categories">[]);
    },
  });

  const selectedIds = useMemo(() => {
    return table.getSelectedRowModel().rows.map((row) => row.original._id);
  }, [
    table
      .getSelectedRowModel()
      .rows.map((row) => row.id)
      .join(","),
  ]);

  const handleSelectionChange = useCallback(
    (ids: Id<"categories">[]) => {
      onSelectionChange?.(ids);
    },
    [onSelectionChange],
  );

  useEffect(() => {
    handleSelectionChange(selectedIds);
  }, [selectedIds, handleSelectionChange]);

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
              placeholder="Search by name or slug..."
              type="text"
              aria-label="Search categories"
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
            value={statusFilter ?? "all"}
            onValueChange={(val) =>
              onStatusFilterChange?.(val as "active" | "inactive" | "all")
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
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
            {table.getRowModel().rows?.length ? (
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
                  No categories found.
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
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <Badge
      className={cn(
        status === "active" &&
          "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
        status === "inactive" &&
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
      )}
    >
      {status}
    </Badge>
  );
}

function RowActions({
  row,
  onUpdateCategory,
  onDeleteCategory,
  categories,
}: {
  row: Row<CategoryNode>;
  onUpdateCategory: (category: any) => Promise<void>;
  onDeleteCategory: (id: Id<"categories">) => Promise<void>;
  categories: Category[];
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleEdit = async (data: any) => {
    await onUpdateCategory({
      id: row.original._id,
      ...data,
    });
    setShowEditDialog(false);
  };

  const handleDelete = async () => {
    await onDeleteCategory(row.original._id);
    setShowDeleteDialog(false);
  };

  const hasChildren = row.original.children.length > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex justify-end">
            <Button
              size="icon"
              variant="ghost"
              className="shadow-none"
              aria-label="Category actions"
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
              disabled={hasChildren}
            >
              <HugeiconsIcon icon={TrashIcon} size={16} className="mr-2" />
              <span>Delete</span>
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update the category information. Only modified fields will be
              saved.
            </DialogDescription>
          </DialogHeader>
          <CategoryForm
            categories={categories}
            onSubmit={handleEdit}
            onCancel={() => setShowEditDialog(false)}
            initialCategory={row.original}
            mode="edit"
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              {hasChildren ? (
                <>
                  Cannot delete "{row.original.name}" because it has{" "}
                  {row.original.children.length} child categor
                  {row.original.children.length === 1 ? "y" : "ies"}. Please
                  delete or move the child categories first.
                </>
              ) : (
                <>
                  Are you sure you want to delete "{row.original.name}"? This
                  action cannot be undone and will permanently remove the
                  category from your system.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!hasChildren && (
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Category
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
