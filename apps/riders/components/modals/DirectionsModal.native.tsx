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
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { useAction } from "convex/react";
import { api } from "@repo/backend";
import * as Location from "expo-location";
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
  const [riderLocation, setRiderLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [mapRegion, setMapRegion] = useState<any>(null);
  const [distance, setDistance] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [attemptedFallback, setAttemptedFallback] = useState(false);
  // Server route fallback state
  const [serverRouteLoading, setServerRouteLoading] = useState(false);
  const [serverRouteError, setServerRouteError] = useState<string | null>(null);

  // Convex action to fetch route server-side (distance/duration/polyline)
  const fetchRoute = useAction(api.data.directions.fetchRoute);

  // Prefer public key exposed via app config; fallback to server key if provided
  const GOOGLE_MAPS_APIKEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.SERVER_GOOGLE_MAPS_API_KEY ||
    "";

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["95%"], []); // near full screen
  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      // Validate customer location has valid coordinates
      if (!customerLocation.latitude || !customerLocation.longitude) {
        Alert.alert(
          "Location Error",
          "Customer location coordinates are not available. Please contact support.",
          [{ text: "OK", onPress: onClose }]
        );
        return;
      }
      getCurrentLocation();
      // Set a timeout to fallback if still loading after 6 seconds
      const timeout = setTimeout(() => {
        if (isLoadingLocation && !riderLocation && !attemptedFallback) {
          setAttemptedFallback(true);
          openExternalMapsFallback();
        }
      }, 6000);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  const getCurrentLocation = async () => {
    try {
      setIsLoadingLocation(true);

      // Request location permissions
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to show directions.",
          [{ text: "OK" }]
        );
        setIsLoadingLocation(false);
        setLocationError("Permission denied");
        return;
      }

      // Get current position
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const riderCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setRiderLocation(riderCoords);

      // Calculate region to show both locations
      const minLat = Math.min(riderCoords.latitude, customerLocation.latitude);
      const maxLat = Math.max(riderCoords.latitude, customerLocation.latitude);
      const minLng = Math.min(
        riderCoords.longitude,
        customerLocation.longitude
      );
      const maxLng = Math.max(
        riderCoords.longitude,
        customerLocation.longitude
      );

      const latDelta = Math.max((maxLat - minLat) * 1.5, 0.01);
      const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.01);

      setMapRegion({
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      });

      setIsLoadingLocation(false);
    } catch (error) {
      console.error("Error getting location:", error);
      Alert.alert(
        "Location Error",
        "Unable to get your current location. Please try again.",
        [{ text: "OK" }]
      );
      setIsLoadingLocation(false);
      setLocationError("Failed to fetch location");
    }
  };

  const openExternalMapsFallback = () => {
    const destination = `${customerLocation.latitude},${customerLocation.longitude}`;
    const label = encodeURIComponent(
      customerLocation.customerName || "Customer"
    );
    const googleMapsUrl = Platform.select({
      ios: `http://maps.apple.com/?daddr=${destination}&q=${label}`,
      android: `google.navigation:q=${destination}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    });
    try {
      Alert.alert(
        "Opening External Maps",
        "We couldn't get your location internally. Redirecting to native maps.",
        [{ text: "OK" }]
      );
      // @ts-ignore
      if (googleMapsUrl) {
        // Prefer Linking to open external app or browser
        import("react-native").then((rn) =>
          rn.Linking.openURL(googleMapsUrl as string)
        );
      }
    } catch (e) {
      console.warn("Failed to open external maps fallback", e);
    }
  };

  const handleDirectionsReady = (result: any) => {
    setDistance(result.distance.toFixed(1) + " km");
    setDuration(Math.ceil(result.duration) + " min");
  };

  // Attempt server-side route if:
  // - We have rider & customer coordinates
  // - AND (no client key OR client directions haven't produced distance within 3s)
  useEffect(() => {
    let timer: any;
    if (
      isOpen &&
      riderLocation &&
      customerLocation?.latitude &&
      customerLocation?.longitude &&
      (!GOOGLE_MAPS_APIKEY || !distance)
    ) {
      // Delay a little to allow client directions first if key exists
      timer = setTimeout(async () => {
        try {
          setServerRouteLoading(true);
          const res = await fetchRoute({
            origin: {
              lat: riderLocation.latitude,
              lng: riderLocation.longitude,
            },
            destination: {
              lat: customerLocation.latitude,
              lng: customerLocation.longitude,
            },
            mode: "driving",
          });
          if (res?.ok) {
            if (!distance && res.distance_text) setDistance(res.distance_text);
            if (!duration && res.duration_text) setDuration(res.duration_text);
            setServerRouteError(null);
          } else {
            setServerRouteError(res?.error || "Route fetch failed");
          }
        } catch (e: any) {
          setServerRouteError(e.message || "Server route error");
        } finally {
          setServerRouteLoading(false);
        }
      }, 3000);
    }
    return () => timer && clearTimeout(timer);
  }, [
    isOpen,
    riderLocation,
    customerLocation,
    GOOGLE_MAPS_APIKEY,
    distance,
    duration,
    fetchRoute,
  ]);

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

          {/* Map Container */}
          <View style={styles.mapContainer}>
            {Platform.OS === "web" && (
              <View style={styles.webFallback}>
                <Text style={styles.webFallbackTitle}>
                  Map Unavailable on Web Preview
                </Text>
                <Text style={styles.webFallbackText}>
                  Live directions require native device. Open this build on
                  Android or iOS for full navigation.
                </Text>
                <Button
                  variant="outline"
                  onPress={() => {
                    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      customerLocation.latitude +
                        "," +
                        customerLocation.longitude
                    )}`;
                    Alert.alert(
                      "Opening Google Maps",
                      "Redirecting in browser"
                    );
                    // Using window.open only on web
                    // @ts-ignore
                    window?.open(url, "_blank");
                  }}
                  style={{ marginTop: 16 }}
                >
                  <ButtonText>Open in Google Maps</ButtonText>
                </Button>
              </View>
            )}
            {Platform.OS !== "web" &&
              (isLoadingLocation ? (
                <View style={styles.loadingContainer}>
                  <Spinner size="large" />
                  <Text style={styles.loadingText}>
                    Getting your location...
                  </Text>
                  {locationError && (
                    <Text style={styles.errorText}>
                      {locationError}. Opening external maps shortly...
                    </Text>
                  )}
                  {!attemptedFallback && (
                    <Button
                      variant="outline"
                      onPress={() => {
                        setAttemptedFallback(true);
                        openExternalMapsFallback();
                      }}
                      style={{ marginTop: 16 }}
                    >
                      <ButtonText>Open Google Maps Now</ButtonText>
                    </Button>
                  )}
                </View>
              ) : riderLocation && mapRegion ? (
                <MapView
                  style={styles.map}
                  region={mapRegion}
                  provider={PROVIDER_GOOGLE}
                  showsUserLocation={true}
                  showsMyLocationButton={false}
                  showsTraffic={true}
                  loadingEnabled={true}
                >
                  {/* Rider Location Marker */}
                  <Marker
                    coordinate={riderLocation}
                    title="Your Location"
                    description="You are here"
                    pinColor={THEME.colors.primary}
                  >
                    <View style={styles.riderMarker}>
                      <Ionicons name="navigate-outline" size={20} color="white" />
                    </View>
                  </Marker>

                  {/* Customer Location Marker */}
                  <Marker
                    coordinate={customerLocation}
                    title={customerLocation.customerName}
                    description={customerLocation.address}
                    pinColor={THEME.colors.success}
                  >
                    <View style={styles.customerMarker}>
                      <Ionicons name="location-outline" size={20} color="white" />
                    </View>
                  </Marker>

                  {/* Directions */}
                  {GOOGLE_MAPS_APIKEY && (
                    <MapViewDirections
                      origin={riderLocation}
                      destination={customerLocation}
                      apikey={GOOGLE_MAPS_APIKEY}
                      strokeWidth={4}
                      strokeColor={THEME.colors.primary}
                      optimizeWaypoints={true}
                      onReady={handleDirectionsReady}
                      onError={(errorMessage) => {
                        console.error("Directions error:", errorMessage);
                      }}
                    />
                  )}
                </MapView>
              ) : (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>
                    Unable to load map. Please check your location settings.
                  </Text>
                  <Button
                    variant="outline"
                    onPress={getCurrentLocation}
                    style={{ marginTop: 16 }}
                  >
                    <ButtonText>Retry</ButtonText>
                  </Button>
                  <Button
                    variant="outline"
                    onPress={openExternalMapsFallback}
                    style={{ marginTop: 12 }}
                  >
                    <ButtonText>Open External Maps</ButtonText>
                  </Button>
                </View>
              ))}
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
                {serverRouteLoading && (
                  <VStack style={styles.statItem}>
                    <Text style={styles.statLabel}>
                      Fetching server route...
                    </Text>
                  </VStack>
                )}
              </HStack>
              {serverRouteError && (
                <Text style={styles.errorTextSmall}>
                  Fallback route error: {serverRouteError}
                </Text>
              )}
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
