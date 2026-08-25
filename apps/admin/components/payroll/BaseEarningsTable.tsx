"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon as Trash2 } from "@hugeicons/core-free-icons";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { toast } from "sonner";
import { Id } from "@repo/backend/dataModel";
import { formatKES, getConvexErrorMessage } from "@/lib/utils";

export default function BaseEarningsTable() {
  const baseEarnings = useQuery(api.data.incentives.getBaseEarnings, {});
  const deleteBaseEarnings = useMutation(api.data.incentives.deleteBaseEarnings);

  const handleDelete = async (id: Id<"base_earnings">) => {
    try {
      await deleteBaseEarnings({ id });
      toast.success("Base earnings configuration deleted");
    } catch (error) {
      console.error("Error deleting base earnings:", error);
      toast.error(
        getConvexErrorMessage(
          error,
          "Failed to delete base earnings configuration",
        ),
      );
    }
  };

  if (!baseEarnings) {
    return <div>Loading base earnings history...</div>;
  }

  if (baseEarnings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No base earnings configurations found
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead>Monthly Amount</TableHead>
            <TableHead>Effective From</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {baseEarnings.map((earning: any) => {
            const isActive = earning.effective_from <= Date.now();
            return (
              <TableRow key={earning._id}>
                <TableCell>
                  <Badge
                    variant={earning.role === "RIDER" ? "default" : "secondary"}
                  >
                    {earning.role}
                  </Badge>
                </TableCell>
                <TableCell>{formatKES(earning.monthly_base_amount)}</TableCell>
                <TableCell>
                  {new Date(earning.effective_from).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {new Date(earning.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge variant={isActive ? "default" : "outline"}>
                    {isActive ? "Active" : "Pending"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(earning._id)}
                    className="h-8 w-8 p-0"
                  >
                    <HugeiconsIcon icon={Trash2} className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
