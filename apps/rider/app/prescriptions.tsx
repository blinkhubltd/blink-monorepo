import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, FileCheck2 } from "lucide-react-native";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { usePendingPrescriptions } from "../lib/data";
import { formatClock } from "../lib/format";

/**
 * Prescriptions awaiting this picker's review.
 *
 * This screen exists because of the data model, not the design. A prescription
 * is a document keyed by customer + vendor with its own picker assignment — it
 * is NOT attached to an order item, so "the prescription for this item" cannot
 * be resolved. The pick list therefore links here, and the picker matches the
 * customer themselves.
 *
 * Closing that gap properly means giving `order_items` a prescription reference,
 * which is a backend change with a migration.
 */
export default function PrescriptionsRoute() {
  const router = useRouter();
  const items = usePendingPrescriptions();

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Prescriptions" />
      <Screen scroll={items !== undefined && items.length > 0}>
        {items === undefined ? (
          <View className="gap-space-4">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="h-[72px]">
                <Skeleton className="h-space-5 w-[160px]" />
              </Card>
            ))}
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            tone="success"
            icon={
              <FileCheck2 size={32} strokeWidth={2} className="text-success" />
            }
            title="Nothing to verify"
            body="Prescriptions assigned to you for review will appear here."
          />
        ) : (
          <View className="gap-space-4 pb-space-7">
            <Text variant="muted" size="sm">
              Match the customer&rsquo;s ID to the name on the prescription
              before approving.
            </Text>
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/prescription/[id]",
                    params: { id: item.id, storageId: item.storageId },
                  })
                }
                className="active:opacity-70"
              >
                <Card className="flex-row items-center gap-space-4">
                  <View className="flex-1">
                    <Text weight="semibold" size="sm" className="text-strong">
                      {item.customerName.length > 0
                        ? item.customerName
                        : "Unknown customer"}
                    </Text>
                    <Text variant="muted" size="sm">
                      Uploaded {formatClock(item.uploadedAt)}
                    </Text>
                  </View>
                  <Badge variant="warning" label="Pending" />
                  <ChevronRight
                    size={18}
                    strokeWidth={2}
                    className="text-subtle"
                  />
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </Screen>
    </View>
  );
}
