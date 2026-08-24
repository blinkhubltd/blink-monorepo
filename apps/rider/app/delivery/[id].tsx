import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { CircleCheck, MapPin, Phone } from "lucide-react-native";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { IconButton } from "../../components/IconButton";
import { OtpInput } from "../../components/OtpInput";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { formatMoney } from "../../lib/format";
import { FIXTURE_DELIVERY } from "../../lib/data/fixtures";

const CODE_LENGTH = 6;

export default function DeliveryDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const delivery = { ...FIXTURE_DELIVERY, reference: id ?? FIXTURE_DELIVERY.reference };

  async function onConfirm() {
    if (code.length !== CODE_LENGTH) return;
    setConfirming(true);
    setInvalid(false);
    try {
      // verifyDeliveryCode + status transition go here.
      router.replace("/(tabs)");
    } catch {
      setInvalid(true);
      setCode("");
    } finally {
      setConfirming(false);
    }
  }

  function onCall() {
    if (!delivery.customerPhone) return;
    const scheme = Platform.OS === "ios" ? "telprompt" : "tel";
    void Linking.openURL(`${scheme}:${delivery.customerPhone.replace(/\s/g, "")}`);
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Delivery details" />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          <View className="flex-row items-center justify-between">
            <Text weight="bold" className="text-strong">
              Order #{delivery.reference}
            </Text>
            {delivery.etaMinutes !== null ? (
              <Badge variant="success" label={`ETA ${delivery.etaMinutes} min`} />
            ) : null}
          </View>

          {/*
            A real map. The reference app rendered a static placeholder and,
            separately, showed route statistics computed against the maps
            library's default origin — which is in Singapore — so every distance
            and duration shown to a Nairobi rider was wrong.
          */}
          {delivery.coordinates ? (
            <View className="h-[170px] overflow-hidden rounded-lg">
              <MapView
                provider={PROVIDER_DEFAULT}
                style={{ flex: 1 }}
                initialRegion={{
                  ...delivery.coordinates,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
                pointerEvents="none"
              >
                <Marker
                  coordinate={delivery.coordinates}
                  title={delivery.customerName}
                  description={delivery.addressLine}
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
              {delivery.addressLine}
            </Text>
          </View>

          <Card className="flex-row items-center justify-between">
            <View>
              <Text weight="semibold" size="sm" className="text-strong">
                {delivery.customerName}
              </Text>
              <Text variant="muted" size="sm">
                {delivery.customerPhone ?? "No number on file"}
              </Text>
            </View>
            {delivery.customerPhone ? (
              <IconButton
                variant="secondary"
                accessibilityLabel={`Call ${delivery.customerName}`}
                onPress={onCall}
              >
                <Phone size={20} strokeWidth={2} className="text-strong" />
              </IconButton>
            ) : null}
          </Card>

          <Text size="sm">
            {delivery.itemCount} items · {formatMoney(delivery.total)}
          </Text>

          {delivery.note ? (
            <Text variant="muted" size="sm">
              &ldquo;{delivery.note}&rdquo;
            </Text>
          ) : null}

          <View className="gap-space-3 pt-space-2">
            <Text weight="semibold" size="sm" className="text-strong">
              Ask the customer for their {CODE_LENGTH}-digit code
            </Text>
            <OtpInput
              value={code}
              onChange={(v) => {
                setCode(v);
                setInvalid(false);
              }}
              length={CODE_LENGTH}
              invalid={invalid}
              editable={!confirming}
            />
            {invalid ? (
              <Text variant="destructive" size="sm">
                That code doesn&rsquo;t match this order.
              </Text>
            ) : null}
          </View>

          <Button
            full
            size="lg"
            label="Confirm delivery"
            loading={confirming}
            disabled={code.length !== CODE_LENGTH}
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
