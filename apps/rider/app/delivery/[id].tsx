import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { CircleCheck, MapPin, Phone } from "lucide-react-native";
import type { Id } from "@repo/backend/dataModel";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { IconButton } from "../../components/IconButton";
import { OtpInput } from "../../components/OtpInput";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { formatMoney } from "../../lib/format";
import { useConfirmDelivery, useDelivery } from "../../lib/data";

const CODE_LENGTH = 6;

export default function DeliveryDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const shipmentId = (id ?? null) as Id<"shipments"> | null;

  const model = useDelivery(shipmentId);
  const confirmDelivery = useConfirmDelivery();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function onConfirm() {
    if (!model || !shipmentId) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmDelivery({
        mode: model.mode,
        shipmentId,
        orderId: model.orderId,
        code,
      });
      if (result.ok) {
        router.replace("/(tabs)/deliveries");
        return;
      }
      setError(
        result.invalidCode
          ? "That code doesn’t match this order."
          : (result.message ?? "Could not confirm the delivery."),
      );
      if (result.invalidCode) setCode("");
    } catch {
      setError("Could not confirm the delivery. Check your connection.");
    } finally {
      setConfirming(false);
    }
  }

  if (model === undefined) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Delivery details" />
        <Screen>
          <View className="gap-space-4">
            <Skeleton className="h-space-6 w-[160px]" />
            <Skeleton className="h-[170px] rounded-lg" />
            <Card className="h-[90px]" />
            <Skeleton className="h-space-5 w-[200px]" />
          </View>
        </Screen>
      </View>
    );
  }

  if (model === null) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Delivery details" />
        <Screen>
          <Card className="items-center gap-space-3 py-space-8">
            <Text weight="semibold" className="text-strong">
              Delivery not available
            </Text>
            <Text variant="muted" size="sm" className="text-center">
              It may have been reassigned to another rider.
            </Text>
          </Card>
        </Screen>
      </View>
    );
  }

  const { detail, mode } = model;
  const needsCode = mode === "delivery_code";
  const canConfirm = needsCode ? code.length === CODE_LENGTH : true;

  function onCall() {
    if (!detail.customerPhone) return;
    const scheme = Platform.OS === "ios" ? "telprompt" : "tel";
    void Linking.openURL(`${scheme}:${detail.customerPhone.replace(/\s/g, "")}`);
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Delivery details" />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          <View className="flex-row items-center justify-between">
            <Text weight="bold" className="text-strong">
              Order #{detail.reference}
            </Text>
            {detail.verified ? (
              <Badge variant="success" label="Verified" />
            ) : null}
          </View>

          {/*
            A real map, and only when the address actually carries usable
            coordinates. The reference app showed route statistics computed
            against the maps library's default origin — in Singapore — so every
            distance a Nairobi rider saw was wrong.
          */}
          {detail.coordinates ? (
            <View className="h-[170px] overflow-hidden rounded-lg">
              <MapView
                provider={PROVIDER_DEFAULT}
                style={{ flex: 1 }}
                initialRegion={{
                  ...detail.coordinates,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
                pointerEvents="none"
              >
                <Marker
                  coordinate={detail.coordinates}
                  title={detail.customerName}
                  description={detail.addressLine}
                />
              </MapView>
            </View>
          ) : (
            <View className="h-[170px] items-center justify-center rounded-lg bg-secondary">
              <Text variant="muted" size="sm">
                No location on this order
              </Text>
            </View>
          )}

          <View className="flex-row items-center gap-space-3">
            <MapPin size={16} strokeWidth={2} className="text-subtle" />
            <Text size="sm" className="flex-1">
              {detail.addressLine}
            </Text>
          </View>

          <Card className="flex-row items-center justify-between">
            <View className="flex-1 pr-space-4">
              <Text weight="semibold" size="sm" className="text-strong">
                {detail.customerName}
              </Text>
              <Text variant="muted" size="sm">
                {detail.customerPhone ?? "No number on file"}
              </Text>
            </View>
            {detail.customerPhone ? (
              <IconButton
                variant="secondary"
                accessibilityLabel={`Call ${detail.customerName}`}
                onPress={onCall}
              >
                <Phone size={20} strokeWidth={2} className="text-strong" />
              </IconButton>
            ) : null}
          </Card>

          <Text size="sm">{formatMoney(detail.total)}</Text>

          {detail.note ? (
            <Text variant="muted" size="sm">
              &ldquo;{detail.note}&rdquo;
            </Text>
          ) : null}

          {/*
            Which confirmation the backend will accept depends on the order's
            payment mode: verifyDeliveryCode throws for anything that is not
            pay_now, so a payment-on-delivery order has no code to ask for.
            Asking for one the backend would reject leaves the rider stuck at the
            door with no way forward.
          */}
          {needsCode ? (
            <View className="gap-space-3 pt-space-2">
              <Text weight="semibold" size="sm" className="text-strong">
                Ask the customer for their {CODE_LENGTH}-digit code
              </Text>
              <OtpInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setError(null);
                }}
                length={CODE_LENGTH}
                invalid={error !== null}
                editable={!confirming}
              />
            </View>
          ) : (
            <Card className="gap-space-2">
              <Text weight="semibold" size="sm" className="text-strong">
                Payment on delivery
              </Text>
              <Text variant="muted" size="sm">
                Collect {formatMoney(detail.total)} before handing the order
                over, then confirm below.
              </Text>
            </Card>
          )}

          {error ? (
            <Text variant="destructive" size="sm">
              {error}
            </Text>
          ) : null}

          <Button
            full
            size="lg"
            label="Confirm delivery"
            loading={confirming}
            disabled={!canConfirm}
            icon={
              <CircleCheck
                size={18}
                strokeWidth={2}
                className="text-primary-foreground"
              />
            }
            onPress={() => void onConfirm()}
          />
        </View>
      </Screen>
    </View>
  );
}
