"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileUpIcon as FileUp,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  TrendingUpIcon,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { CategoryForm } from "@/components/categories/CategoryForm";
import { CategoryTable } from "@/components/categories/CategoryTable";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";

import type React from "react";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { toast } from "sonner";
import { CategoryImport } from "@/components/categories/CategoryImport";

export default function CategoriesPage() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { categories: allCategories } = useDashboardData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPage = Number(searchParams.get("page") ?? "1");
  const initialLimit = Number(searchParams.get("limit") ?? "10");
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [limit, setLimit] = useState(
    [5, 10, 25, 50].includes(initialLimit) ? initialLimit : 10,
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "inactive" | "all"
  >("all");
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const currentCursor = cursorStack[cursorStack.length - 1] ?? null;
  const paged = useQuery(api.data.categories.getCategories, {
    limit,
    cursor: currentCursor,
    search: debouncedSearchQuery.trim() ? debouncedSearchQuery : undefined,
    status:
      statusFilter === "active" || statusFilter === "inactive"
        ? statusFilter
        : undefined,
  });
  const isLoading = !paged;
  const createCategory = useMutation(api.data.categories.createCategory);
  const updateCategory = useMutation(api.data.categories.updateCategory);
  const deleteCategory = useMutation(api.data.categories.deleteCategory);
  const backfillCategoriesSearchText = useMutation(
    api.data.categories.backfillCategoriesSearchText,
  );

  const parentOptions = useMemo(() => allCategories, [allCategories]);

  const categoryStats = useMemo(() => {
    const total = allCategories.length;
    const active = allCategories.filter(
      (cat) => cat.status === "active",
    ).length;
    const rootCategories = allCategories.filter(
      (cat) => !cat.parent_category_id,
    ).length;
    const childCategories = total - rootCategories;

    return { total, active, rootCategories, childCategories };
  }, [allCategories]);

  const handlePageChange = (nextPage: number) => {
    const safe = Math.max(1, nextPage);
    if (safe === 1) {
      setCursorStack([null]);
      setPage(1);
    } else if (safe === page + 1 && paged?.pagination.cursor) {
      setCursorStack((prev) => [...prev, paged.pagination.cursor as string]);
      setPage((p) => p + 1);
    } else if (safe === page - 1 && cursorStack.length > 1) {
      setCursorStack((prev) => prev.slice(0, -1));
      setPage((p) => Math.max(1, p - 1));
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(safe));
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
  };

  const handleLimitChange = (nextLimit: number) => {
    setLimit(nextLimit);
    setPage(1);
    setCursorStack([null]);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("limit", String(nextLimit));
    router.replace(`?${params.toString()}`);
  };

  useEffect(() => {
    // Reset pagination when search changes
    setCursorStack([null]);
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
  }, [debouncedSearchQuery, router, searchParams, limit]);

  useEffect(() => {
    // Reset pagination when status filter changes
    setCursorStack([null]);
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (!paged || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      (paged.data as any[]).some((c) => !c.searchText) ||
      (debouncedSearchQuery.trim().length > 0 &&
        paged.pagination.total > 0 &&
        paged.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    backfillCategoriesSearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.success("Search index updated", {
            description: `Updated ${updatedCount} categories for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill categories searchText:", error);
      });
  }, [
    paged,
    hasTriggeredSearchBackfill,
    debouncedSearchQuery,
    backfillCategoriesSearchText,
  ]);

  const handleCreateCategory = async (values: any) => {
    await createCategory(values);
    setShowAddDialog(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">
            Organize your products with hierarchical categories up to 3 levels
            deep.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <HugeiconsIcon icon={FileUp} className="mr-2 h-4 w-4" />
                Import Excel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Import Categories from Excel</DialogTitle>
                <DialogDescription>
                  Upload an Excel file to bulk-create categories.
                </DialogDescription>
              </DialogHeader>
              <CategoryImport
                categories={allCategories}
                onClose={() => setShowImportDialog(false)}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="text-yellow-400">
                <HugeiconsIcon icon={PlusIcon} className="mr-2 h-4 w-4 text-yellow-400" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Category</DialogTitle>
                <DialogDescription>
                  Add a new category to organize your products. Categories can
                  be nested up to 3 levels deep.
                </DialogDescription>
              </DialogHeader>
              <CategoryForm
                categories={parentOptions}
                onSubmit={handleCreateCategory}
                onCancel={() => setShowAddDialog(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Categories
            </CardTitle>
            <HugeiconsIcon icon={FolderIcon} className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoryStats.total}</div>
            <p className="text-xs text-muted-foreground">
              All categories in system
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Categories
            </CardTitle>
            <HugeiconsIcon icon={TrendingUpIcon} className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoryStats.active}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Root Categories
            </CardTitle>
            <HugeiconsIcon icon={FolderIcon} className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {categoryStats.rootCategories}
            </div>
            <p className="text-xs text-muted-foreground">
              Top-level categories
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Child Categories
            </CardTitle>
            <HugeiconsIcon icon={FolderOpenIcon} className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {categoryStats.childCategories}
            </div>
            <p className="text-xs text-muted-foreground">Nested categories</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Categories</CardTitle>
          <CardDescription>
            Manage your category hierarchy. Categories are displayed in a tree
            structure showing parent-child relationships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryTable
            categories={paged?.data ?? []}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onUpdateCategory={async (category) => {
              await updateCategory(category);
            }}
            onDeleteCategory={async (id) => {
              await deleteCategory({ id });
            }}
            paginationMeta={{
              page,
              limit,
              total: paged?.pagination.total ?? 0,
              totalPages: paged?.pagination.totalPages ?? 1,
              hasNext: paged?.pagination.hasNext ?? false,
              hasPrevious: page > 1,
            }}
            onPageChange={handlePageChange}
            onPageSizeChange={handleLimitChange}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
