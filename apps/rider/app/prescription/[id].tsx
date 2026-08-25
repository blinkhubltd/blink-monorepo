import { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CircleCheck, Flag, ImageOff, Maximize2 } from "lucide-react-native";
import type { Id } from "@repo/backend/dataModel";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { ImageViewer } from "../../components/ImageViewer";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import {
  usePrescriptionActions,
  usePrescriptionImage,
  usePrescriptionItems,
  useRejectionReasons,
} from "../../lib/data";

export default function PrescriptionReviewRoute() {
  const router = useRouter();
  const { id, storageId } = useLocalSearchParams<{
    id: string;
    storageId?: string;
  }>();

  const prescriptionId = (id ?? null) as Id<"prescriptions"> | null;
  // Carried in the route params rather than refetched: the backend has no
  // get-prescription-by-id query, only the picker's pending list.
  const imageUrl = usePrescriptionImage(
    (storageId ?? null) as Id<"_storage"> | null,
  );

  // What this prescription actually authorises, via order_items.by_prescription.
  const items = usePrescriptionItems(prescriptionId);
  const reasons = useRejectionReasons();
  const actions = usePrescriptionActions();

  const [viewerOpen, setViewerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (!prescriptionId) return;
    setSubmitting(true);
    setError(null);
    try {
      await actions.approve(prescriptionId);
      router.back();
    } catch {
      setError("Could not approve. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reject(reasonId: Id<"prescriptionRejectionReasons"> | null) {
    if (!prescriptionId) return;
    setSubmitting(true);
    setError(null);
    try {
      await actions.reject(prescriptionId, reasonId);
      router.back();
    } catch {
      setError("Could not flag this. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasImage = typeof imageUrl === "string" && imageUrl.length > 0;
  const imageLoading = imageUrl === undefined && storageId !== undefined;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Prescription review" />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          <Card className="gap-space-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-space-4">
                <Text weight="bold" className="text-strong">
                  Prescription
                </Text>
                <Text variant="muted" size="sm">
                  Check the customer&rsquo;s ID against the name on the
                  document.
                </Text>
              </View>
              <Badge variant="warning" label="Requires ID check" />
            </View>

            {/*
              The items this document authorises. Only resolvable because
              order_items now carries prescription_id — the prescriptions table
              itself has no link to a product, so before that this screen could
              not say what it was approving.
            */}
            {items === undefined ? (
              <Skeleton className="h-space-5 w-[200px]" />
            ) : items.length > 0 ? (
              <View className="gap-space-2 border-t-hairline border-border pt-space-3">
                <Text variant="eyebrow" size="label">
                  Authorises
                </Text>
                {items.map((item) => (
                  <View
                    key={item._id}
                    className="flex-row items-center justify-between"
                  >
                    <Text size="sm" weight="medium" className="flex-1 pr-space-3">
                      {item.name}
                    </Text>
                    <Text variant="muted" size="sm">
                      Qty {item.quantity}
                      {item.order_reference ? ` · #${item.order_reference}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text variant="subtle" size="caption">
                No linked items — this prescription predates item linking.
              </Text>
            )}
          </Card>

          {imageLoading ? (
            <Skeleton className="h-[220px] w-[170px] rounded-md" />
          ) : hasImage ? (
            <View className="gap-space-3">
              <Text variant="eyebrow" size="label">
                Document
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open the prescription full screen"
                onPress={() => setViewerOpen(true)}
                className="relative self-start active:opacity-80"
              >
                <OptimizedImage
                  source={{ uri: imageUrl }}
                  className="h-[220px] w-[170px]"
                  contentFit="cover"
                />
                <View className="absolute bottom-space-2 right-space-2 h-space-8 w-space-8 items-center justify-center rounded-pill bg-ink-950/70">
                  <Maximize2 size={16} strokeWidth={2} className="text-white" />
                </View>
              </Pressable>
              <Text variant="subtle" size="caption">
                Tap to zoom.
              </Text>
            </View>
          ) : (
            <Card className="items-center gap-space-3 py-space-7">
              <ImageOff size={28} strokeWidth={2} className="text-subtle" />
              <Text variant="muted" size="sm" className="text-center">
                The prescription document could not be loaded.
              </Text>
            </Card>
          )}

          {error ? (
            <Text variant="destructive" size="sm">
              {error}
            </Text>
          ) : null}

          <View className="gap-space-3">
            <Button
              full
              size="lg"
              label="Approve"
              loading={submitting && !flagging}
              // Approving with nothing to look at is not a check.
              disabled={!hasImage || submitting}
              icon={
                <CircleCheck
                  size={18}
                  strokeWidth={2}
                  className="text-primary-foreground"
                />
              }
              onPress={() => void approve()}
            />
            <Button
              full
              variant="ghost"
              label={flagging ? "Pick a reason" : "Flag issue"}
              disabled={submitting}
              icon={<Flag size={18} strokeWidth={2} className="text-strong" />}
              onPress={() => setFlagging((f) => !f)}
            />
          </View>

          {/*
            Rejecting requires a reason from `prescriptionRejectionReasons` —
            the mutation takes a reason id, and a rejection with no reason gives
            the customer nothing to act on.
          */}
          {flagging ? (
            <Card className="gap-space-3">
              <Text variant="eyebrow" size="label">
                Reason
              </Text>
              {reasons === undefined ? (
                <Skeleton className="h-space-8" />
              ) : reasons.length === 0 ? (
                <>
                  <Text variant="muted" size="sm">
                    No rejection reasons are configured. Flagging without one
                    still records the rejection.
                  </Text>
                  <Button
                    full
                    variant="destructive"
                    label="Flag without a reason"
                    loading={submitting}
                    onPress={() => void reject(null)}
                  />
                </>
              ) : (
                reasons.map((reason) => (
                  <Pressable
                    key={reason._id}
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => void reject(reason._id)}
                    className="min-h-control justify-center border-b-hairline border-border active:opacity-70"
                  >
                    <Text weight="medium" size="sm">
                      {reason.title}
                    </Text>
                    {reason.description ? (
                      <Text variant="muted" size="caption">
                        {reason.description}
                      </Text>
                    ) : null}
                  </Pressable>
                ))
              )}
            </Card>
          ) : null}
        </View>
      </Screen>

      <ImageViewer
        visible={viewerOpen}
        uri={hasImage ? imageUrl : null}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}
