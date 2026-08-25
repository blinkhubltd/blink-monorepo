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

export default function IncentivesTable() {
  const incentiveConfigs = useQuery(api.data.incentives.getIncentiveConfigsNew, {});
  const deleteIncentiveConfig = useMutation(
    api.data.incentives.deleteIncentiveConfigNew,
  );

  const handleDelete = async (id: Id<"incentive_configs">) => {
    try {
      await deleteIncentiveConfig({ id });
      toast.success("Incentive configuration deleted");
    } catch (error) {
      console.error("Error deleting incentive configuration:", error);
      toast.error(
        getConvexErrorMessage(
          error,
          "Failed to delete incentive configuration",
        ),
      );
    }
  };

  if (!incentiveConfigs) {
    return <div>Loading incentive configurations...</div>;
  }

  if (incentiveConfigs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No incentive configurations found
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead>Daily Threshold</TableHead>
            <TableHead>Daily Bonus / Extra</TableHead>
            <TableHead>Effective From</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incentiveConfigs.map((config: any) => {
            const isActive = config.effective_from <= Date.now();
            return (
              <TableRow key={config._id}>
                <TableCell>
                  <Badge
                    variant={config.role === "RIDER" ? "default" : "secondary"}
                  >
                    {config.role}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {config.threshold_daily}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatKES(config.bonus_per_extra_daily)}
                </TableCell>
                <TableCell>
                  {new Date(config.effective_from).toLocaleDateString()}
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
                    onClick={() => handleDelete(config._id)}
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
