import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { View, StyleSheet, Dimensions, Alert, Platform } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Spinner } from "@/components/ui/spinner";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAction } from "convex/react";
import { api } from "@repo/backend";
import { THEME } from "@/theme/design";

const { width, height } = Dimensions.get("window");

interface DirectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerLocation: {
    latitude: number;
    longitude: number;
    address: string;
    customerName: string;
  };
  onMarkDelivered: () => void;
}

export function DirectionsModal({
  isOpen,
  onClose,
  customerLocation,
  onMarkDelivered,
}: DirectionsModalProps) {
  const [distance, setDistance] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [serverRouteLoading, setServerRouteLoading] = useState(false);
  const [serverRouteError, setServerRouteError] = useState<string | null>(null);

  // Convex action to fetch route server-side (distance/duration/polyline)
  const fetchRoute = useAction(api.data.directions.fetchRoute);

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["95%"], []); // near full screen
  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen && customerLocation.latitude && customerLocation.longitude) {
      // For web, we'll fetch route information from server
      fetchRouteInfo();
    }
  }, [isOpen, customerLocation]);

  const fetchRouteInfo = async () => {
    try {
      setServerRouteLoading(true);
      setServerRouteError(null);

      // Use a default location for web demo (you can modify this logic)
      const defaultLocation = {
        lat: 1.3521, // Singapore as default
        lng: 103.8198,
      };

      const res = await fetchRoute({
        origin: defaultLocation,
        destination: {
          lat: customerLocation.latitude,
          lng: customerLocation.longitude,
        },
        mode: "driving",
      });

      if (res?.ok) {
        if (res.distance_text) setDistance(res.distance_text);
        if (res.duration_text) setDuration(res.duration_text);
        setServerRouteError(null);
      } else {
        setServerRouteError(res?.error || "Route fetch failed");
      }
    } catch (e: any) {
      setServerRouteError(e.message || "Server route error");
    } finally {
      setServerRouteLoading(false);
    }
  };

  const openExternalMaps = () => {
    const destination = `${customerLocation.latitude},${customerLocation.longitude}`;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

    // For web, open in new tab
    if (Platform.OS === "web") {
      // @ts-ignore
      window?.open(googleMapsUrl, "_blank");
    } else {
      Alert.alert("Opening External Maps", "Redirecting to native maps.", [
        { text: "OK" },
      ]);
    }
  };

  if (!isOpen) return null;

  return (
    <View style={styles.sheetContainer} pointerEvents="box-none">
      <BottomSheet
        ref={sheetRef}
        snapPoints={snapPoints}
        index={0}
        enablePanDownToClose
        onClose={onClose}
        onChange={handleSheetChange}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
        keyboardBehavior="extend"
      >
        <BottomSheetView style={styles.innerContainer}>
          {/* Header */}
          <View style={styles.header}>
            <HStack style={styles.headerContent}>
              <VStack space="xs">
                <Text style={styles.title}>Directions to Customer</Text>
                <Text style={styles.subtitle}>
                  {customerLocation.customerName}
                </Text>
              </VStack>
              <Button
                variant="ghost"
                size="sm"
                onPress={onClose}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={20} color={THEME.colors.textSecondary} />
              </Button>
            </HStack>
          </View>

          {/* Map Container - Web Version */}
          <View style={styles.mapContainer}>
            <View style={styles.webFallback}>
              <Ionicons name="location-outline" size={48} color={THEME.colors.primary} style={{ marginBottom: 16 }} />
              <Text style={styles.webFallbackTitle}>Directions Available</Text>
              <Text style={styles.webFallbackText}>
                Maps integration requires native device capabilities. Use the
                button below to open directions in your browser.
              </Text>

              {serverRouteLoading && (
                <View style={styles.loadingContainer}>
                  <Spinner size="large" />
                  <Text style={styles.loadingText}>Calculating route...</Text>
                </View>
              )}

              <Button
                variant="solid"
                onPress={openExternalMaps}
                style={{ marginTop: 24, paddingHorizontal: 32 }}
              >
                <ButtonText>Open in Google Maps</ButtonText>
              </Button>

              {serverRouteError && (
                <Text style={styles.errorText}>{serverRouteError}</Text>
              )}
            </View>
          </View>

          {/* Route Info */}
          {(distance || duration) && (
            <View style={styles.routeInfo}>
              <HStack space="lg" style={styles.routeStats}>
                {distance && (
                  <VStack style={styles.statItem}>
                    <Text style={styles.statValue}>{distance}</Text>
                    <Text style={styles.statLabel}>Distance</Text>
                  </VStack>
                )}
                {duration && (
                  <VStack style={styles.statItem}>
                    <Text style={styles.statValue}>{duration}</Text>
                    <Text style={styles.statLabel}>Est. Time</Text>
                  </VStack>
                )}
              </HStack>
            </View>
          )}

          {/* Address Info */}
          <View style={styles.addressInfo}>
            <VStack space="sm">
              <Text style={styles.addressTitle}>Delivery Address</Text>
              <Text style={styles.addressText}>{customerLocation.address}</Text>
            </VStack>
          </View>

          {/* Bottom Actions */}
          <View style={styles.actions}>
            <HStack space="md" style={styles.actionButtons}>
              <Button
                variant="outline"
                style={[styles.actionButton, { flex: 1 }]}
                onPress={onClose}
              >
                <ButtonText style={{ color: THEME.colors.textSecondary }}>
                  Back to Details
                </ButtonText>
              </Button>
            </HStack>
          </View>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  innerContainer: {
    flex: 1,
  },
  sheetBackground: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handleIndicator: {
    backgroundColor: THEME.colors.border,
    width: 64,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.surfaceSecondary,
    padding: 0,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: THEME.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    backgroundColor: "#F9FAFB",
  },
  errorText: {
    fontSize: 16,
    color: THEME.colors.error,
    textAlign: "center",
    lineHeight: 24,
  },
  errorTextSmall: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.colors.error,
    textAlign: "center",
  },
  riderMarker: {
    backgroundColor: THEME.colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  customerMarker: {
    backgroundColor: THEME.colors.success,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  routeInfo: {
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  routeStats: {
    flexDirection: "row",
    justifyContent: "center",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  addressInfo: {
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  addressTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  addressText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: THEME.colors.surface,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  actionButtons: {
    flexDirection: "row",
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: THEME.colors.surface,
  },
  deliveredButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  webFallback: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  webFallbackTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: THEME.colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  webFallbackText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
