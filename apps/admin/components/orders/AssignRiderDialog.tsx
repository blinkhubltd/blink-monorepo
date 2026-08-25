import { useState } from "react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Label } from "@repo/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { useDashboardData } from "@/providers/DashboardDataProvider";

export function AssignRiderDialog({
  orderId,
  open,
  onOpenChange,
  onSuccess,
}: {
  orderId: Id<"orders">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const [selectedRiderId, setSelectedRiderId] = useState<string>("");
  const assignRider = useMutation(api.data.orders.assignRider);
  const { availableRiders, isLoaded } = useDashboardData();

  const handleAssignRider = async () => {
    if (!selectedRiderId) {
      toast.error("Please select a rider");
      return;
    }

    try {
      await assignRider({
        orderId,
        riderId: selectedRiderId as Id<"users">,
      });

      toast.success("Rider assigned successfully");

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error assigning rider:", error);
      toast.error(
        getConvexErrorMessage(
          error,
          "Failed to assign rider. Please try again.",
        ),
      );
    }
  };

  const isLoading = !isLoaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Rider</DialogTitle>
          <DialogDescription>
            Select a rider to assign to this order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-primary" />
            </div>
          ) : availableRiders.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              No available riders found.
            </div>
          ) : (
            <RadioGroup
              value={selectedRiderId}
              onValueChange={setSelectedRiderId}
              className="space-y-2"
            >
              {availableRiders.map((rider) => (
                <div key={rider._id} className="flex items-center space-x-2">
                  <RadioGroupItem value={rider._id} id={`rider-${rider._id}`} />
                  <Label
                    htmlFor={`rider-${rider._id}`}
                    className="cursor-pointer"
                  >
                    <div className="font-medium">{rider.name}</div>
                    <div className="text-sm text-gray-500">{rider.email}</div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssignRider}
            disabled={!selectedRiderId || isLoading}
          >
            {isLoading ? "Assigning..." : "Assign Rider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
