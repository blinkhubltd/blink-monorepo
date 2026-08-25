import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { Id } from "@repo/backend/dataModel";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { usePrescriptionForItem } from "../lib/data";

/**
 * The "Verify ID" affordance on a prescription pick-list item.
 *
 * Resolves the item's own prescription through
 * `order_items.prescription_id` and goes straight to reviewing THAT document.
 * Before that field existed the app could only send the picker to their whole
 * pending queue to work out which document applied — with two prescription items
 * and two uploads, that was a guess.
 *
 * Rows created before the field was added carry no link, so those still fall
 * back to the queue. `prescriptions.backfillOrderItemPrescriptions` removes that
 * case as it runs.
 */
export function PrescriptionItemLink({
  itemId,
}: {
  itemId: Id<"order_items">;
}) {
  const router = useRouter();
  const prescription = usePrescriptionForItem(itemId);

  if (prescription === undefined) {
    return <Skeleton className="h-space-7 w-[72px] rounded-pill" />;
  }

  const linked = prescription !== null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        linked
          ? "Review this item's prescription"
          : "Open prescriptions to verify this item"
      }
      onPress={() =>
        linked
          ? router.push({
              pathname: "/prescription/[id]",
              params: {
                id: prescription._id,
                storageId: prescription.prescription_document,
              },
            })
          : router.push("/prescriptions")
      }
      className="flex-row items-center gap-space-1 active:opacity-70"
    >
      {/*
        Different labels, because they lead to different places and a picker
        should know which. "Verify ID" goes to the exact document; "Find
        prescription" means the app could not tell which one applies.
      */}
      <Badge
        variant="warning"
        label={linked ? "Verify ID" : "Find prescription"}
      />
      <ChevronRight size={16} strokeWidth={2} className="text-subtle" />
    </Pressable>
  );
}
