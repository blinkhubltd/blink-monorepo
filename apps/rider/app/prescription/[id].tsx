import { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CircleCheck, Flag, ImageOff, Maximize2 } from "lucide-react-native";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { ImageViewer } from "../../components/ImageViewer";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { FIXTURE_PRESCRIPTION } from "../../lib/data/fixtures";

export default function PrescriptionReviewRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const review = { ...FIXTURE_PRESCRIPTION, id: id ?? FIXTURE_PRESCRIPTION.id };
  const images = review.imageUrls;

  async function decide(approved: boolean) {
    setSubmitting(true);
    try {
      // approvePrescription / rejectPrescription go here.
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Prescription review" />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          <Card className="flex-row items-center justify-between">
            <View className="flex-1 pr-space-4">
              <Text weight="bold" className="text-strong">
                {review.productName}
              </Text>
              <Text variant="muted" size="sm">
                {review.dosageNote} · Order #{review.orderReference}
              </Text>
            </View>
            <Badge variant="warning" label="Requires ID check" />
          </Card>

          {/* The prescription itself, tappable to open full screen. */}
          {images.length > 0 ? (
            <View className="gap-space-3">
              <Text variant="eyebrow" size="label">
                Prescription
              </Text>
              <View className="flex-row flex-wrap gap-space-3">
                {images.map((uri, index) => (
                  <Pressable
                    key={uri}
                    accessibilityRole="button"
                    accessibilityLabel={`Open prescription image ${index + 1} of ${images.length}`}
                    onPress={() => setViewerIndex(index)}
                    className="relative active:opacity-80"
                  >
                    <OptimizedImage
                      source={{ uri }}
                      className="h-[140px] w-[110px]"
                      contentFit="cover"
                    />
                    <View className="absolute bottom-space-2 right-space-2 h-space-7 w-space-7 items-center justify-center rounded-pill bg-ink-950/70">
                      <Maximize2 size={14} strokeWidth={2} className="text-white" />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <Card className="items-center gap-space-3 py-space-7">
              <ImageOff size={28} strokeWidth={2} className="text-subtle" />
              <Text variant="muted" size="sm" className="text-center">
                No prescription image was attached to this order.
              </Text>
            </Card>
          )}

          <Text variant="muted" size="sm">
            Confirm the customer&rsquo;s ID matches the name on the prescription
            before handing over.
          </Text>

          <View className="gap-space-3">
            <Button
              full
              size="lg"
              label="Approve item"
              loading={submitting}
              // Approving with nothing to look at is not a check. The reference
              // app enabled this regardless.
              disabled={images.length === 0}
              icon={
                <CircleCheck
                  size={18}
                  strokeWidth={2}
                  className="text-primary-foreground"
                />
              }
              onPress={() => void decide(true)}
            />
            <Button
              full
              variant="ghost"
              label="Flag issue"
              disabled={submitting}
              icon={<Flag size={18} strokeWidth={2} className="text-strong" />}
              onPress={() => void decide(false)}
            />
            {images.length === 0 ? (
              <Text variant="muted" size="caption" className="text-center">
                Flag the order so the hub can request a prescription.
              </Text>
            ) : null}
          </View>
        </View>
      </Screen>

      <ImageViewer
        visible={viewerIndex !== null}
        uri={viewerIndex === null ? null : (images[viewerIndex] ?? null)}
        caption={
          viewerIndex === null
            ? undefined
            : `${viewerIndex + 1} of ${images.length}`
        }
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}
