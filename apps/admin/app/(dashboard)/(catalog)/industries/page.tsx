"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChartBarLineIcon as BarChart3,
  PlusSignIcon as Plus,
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { IndustryForm, IndustryTable } from "@/components/industries";
import { Button } from "@repo/ui/components/ui/button";
import { getConvexErrorMessage } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { toast } from "sonner";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import Link from "next/link";

type IndustryFormValues = {
  name: string;
  description?: string;
  status: "Active" | "Inactive";
  image?: string;
};

export default function IndustriesPage() {
  const { isAdminUser } = useCurrentUserPermissions();
  const [showAddForm, setShowAddForm] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const statusArg =
    statusFilter === "all"
      ? undefined
      : statusFilter === "active"
        ? "Active"
        : "Inactive";

  // Queries
  const industriesData = useQuery(api.data.industry.getIndustries, {
    limit: pageSize,
    cursor: cursor,
    search: debouncedSearchQuery.trim() ? debouncedSearchQuery : undefined,
    status: statusArg,
  });

  useEffect(() => {
    setCursor(null);
    setCurrentPage(1);
    setCursors([null]);
  }, [debouncedSearchQuery, statusFilter]);

  // Mutations
  const createIndustry = useMutation(api.data.industry.createIndustry);
  const updateIndustry = useMutation(api.data.industry.updateIndustry);
  const deleteIndustry = useMutation(api.data.industry.deleteIndustry);
  const updateIndustryStatus = useMutation(api.data.industry.updateIndustryStatus);
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const backfillIndustrySearchText = useMutation(
    api.data.industry.backfillIndustrySearchText,
  );
  const [hasTriggeredSearchBackfill, setHasTriggeredSearchBackfill] =
    useState(false);

  useEffect(() => {
    if (!industriesData || hasTriggeredSearchBackfill) return;

    const needsBackfill =
      industriesData.data.some(
        (industry: { searchText?: string }) => !industry.searchText,
      ) ||
      (debouncedSearchQuery.trim().length > 0 &&
        industriesData.pagination.total > 0 &&
        industriesData.data.length === 0);

    if (!needsBackfill) return;

    setHasTriggeredSearchBackfill(true);
    void backfillIndustrySearchText()
      .then(({ updatedCount }) => {
        if (updatedCount > 0) {
          toast.message("Search index updated", {
            description: `Updated ${updatedCount} industries for search.`,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to backfill industry searchText:", error);
      });
  }, [
    industriesData,
    debouncedSearchQuery,
    hasTriggeredSearchBackfill,
    backfillIndustrySearchText,
  ]);

  const handleCreateIndustry = async (values: IndustryFormValues) => {
    try {
      await createIndustry({
        ...values,
        image: values.image as Id<"_storage"> | undefined,
      });
      toast.success("Industry created successfully");
      setShowAddForm(false);
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to create industry"));
      console.error("Error creating industry:", error);
      throw error;
    }
  };

  const handleFileUpload = async (file: File): Promise<string> => {
    const uploadUrl = await generateUploadUrl();
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
    const { storageId } = await res.json();
    return storageId;
  };

  const handleUpdateIndustry = async (
    industryId: Id<"industry">,
    values: IndustryFormValues,
  ) => {
    try {
      await updateIndustry({
        id: industryId,
        updates: {
          ...values,
          image: values.image as Id<"_storage"> | undefined,
        },
      });
      toast.success("Industry updated successfully");
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to update industry"));
      console.error("Error updating industry:", error);
      throw error;
    }
  };

  const handleDeleteIndustry = async (id: Id<"industry">) => {
    try {
      await deleteIndustry({ id });
      toast.success("Industry deleted successfully");
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to delete industry"));
      console.error("Error deleting industry:", error);
      throw error;
    }
  };

  const handleStatusUpdate = async (
    industryId: Id<"industry">,
    status: "Active" | "Inactive",
  ) => {
    try {
      await updateIndustryStatus({ id: industryId, status });
      toast.success(`Industry ${status.toLowerCase()} successfully`);
    } catch (error) {
      toast.error(
        getConvexErrorMessage(error, "Failed to update industry status"),
      );
      console.error("Error updating industry status:", error);
      throw error;
    }
  };

  const handlePageChange = (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => {
    if (!industriesData) return;

    if (direction === "first") {
      setCursor(null);
      setCurrentPage(1);
      setCursors([null]);
    } else if (direction === "prev" && currentPage > 1) {
      const newPage = currentPage - 1;
      setCursor(cursors[newPage - 1] ?? null);
      setCurrentPage(newPage);
    } else if (
      direction === "next" &&
      industriesData.pagination.hasNext &&
      industriesData.pagination.cursor
    ) {
      const newPage = currentPage + 1;
      if (!cursors[newPage - 1]) {
        setCursors([...cursors, industriesData.pagination.cursor]);
      }
      setCursor(industriesData.pagination.cursor ?? null);
      setCurrentPage(newPage);
    } else if (direction === "last") {
      // For "last", we would need to know all cursors or implement server-side logic
      // For now, we'll just go to the next page if available
      if (
        industriesData.pagination.hasNext &&
        industriesData.pagination.cursor
      ) {
        const newPage = currentPage + 1;
        if (!cursors[newPage - 1]) {
          setCursors([...cursors, industriesData.pagination.cursor]);
        }
        setCursor(industriesData.pagination.cursor ?? null);
        setCurrentPage(newPage);
      }
    }
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCursor(null);
    setCurrentPage(1);
    setCursors([null]);
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Industries</h2>
          <p className="text-muted-foreground">
            Manage industry categories for your vendors
          </p>
        </div>
        <div className="flex gap-2">
          {isAdminUser && (
            <Link href="/industries/insights">
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={BarChart3} className="w-4 h-4 mr-2" />
                View Insights
              </Button>
            </Link>
          )}
          <Button onClick={() => setShowAddForm(true)}>
            <HugeiconsIcon icon={Plus} className="mr-2 h-4 w-4" />
            Add Industry
          </Button>
        </div>
      </div>

      <IndustryTable
        industries={industriesData?.data || []}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onUpdateIndustry={handleUpdateIndustry}
        onDeleteIndustry={handleDeleteIndustry}
        onStatusUpdate={handleStatusUpdate}
        onFileUpload={handleFileUpload}
        pagination={
          industriesData
            ? {
                ...industriesData.pagination,
                currentPage,
                pageSize,
                hasPrevious: currentPage > 1,
              }
            : undefined
        }
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        isLoading={!industriesData}
      />

      {/* Add Industry Form Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Industry</DialogTitle>
            <DialogDescription>
              Create a new industry category for vendors
            </DialogDescription>
          </DialogHeader>
          <IndustryForm
            mode="create"
            onSubmit={handleCreateIndustry}
            onCancel={() => setShowAddForm(false)}
            onFileUpload={handleFileUpload}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
