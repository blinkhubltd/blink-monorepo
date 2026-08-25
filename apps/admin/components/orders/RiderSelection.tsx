import { useState } from "react";
import { Id } from "@repo/backend/dataModel";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { Label } from "@repo/ui/components/ui/label";
import { useDashboardData } from "@/providers/DashboardDataProvider";

interface RiderSelectionProps {
  orderId: Id<"orders">;
  onSelectRider: (riderId: Id<"users">) => void;
  onCancel: () => void;
}

export function RiderSelection({
  orderId,
  onSelectRider,
  onCancel,
}: RiderSelectionProps) {
  const [selectedRiderId, setSelectedRiderId] = useState<string>("");

  const { availableRiders, isLoaded } = useDashboardData();

  if (!isLoaded) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center space-x-4 p-2 border rounded-md"
          >
            <Skeleton className="h-4 w-4 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (availableRiders.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">
          No available riders found. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RadioGroup
        value={selectedRiderId}
        onValueChange={setSelectedRiderId}
        className="space-y-2 max-h-[300px] overflow-y-auto p-2"
      >
        {availableRiders.map((rider) => (
          <div
            key={rider._id}
            className="flex items-center space-x-3 p-3 border rounded-md hover:bg-accent/50"
          >
            <RadioGroupItem value={rider._id} id={`rider-${rider._id}`} />
            <Label
              htmlFor={`rider-${rider._id}`}
              className="flex-1 cursor-pointer"
            >
              <div className="font-medium">{rider.name}</div>
              <div className="text-sm text-muted-foreground">{rider.email}</div>
              {rider.phone && (
                <div className="text-sm text-muted-foreground">
                  {rider.phone}
                </div>
              )}
              <div className="mt-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {rider.rider_details?.status || "Active"}
                </span>
              </div>
            </Label>
          </div>
        ))}
      </RadioGroup>

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSelectRider(selectedRiderId as Id<"users">)}
          disabled={!selectedRiderId}
        >
          Assign Rider
        </Button>
      </div>
    </div>
  );
}
