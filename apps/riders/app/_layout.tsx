import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "@/global.css";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StatusBarManager } from "@/components/ui/status-bar";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Slot, usePathname } from "expo-router";
import { View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import AuthWrapper from "@/components/AuthWrapper";
import BlinkSplash from "@/components/BlinkSplash";
import { LocationProvider } from "@/lib/location/provider";
import { DataProvider } from "@/providers/DataProvider";
import NotificationProvider from "@/providers/NotificationProvider";
import { PrescriptionProvider } from "@/providers/PrescriptionProvider";
import { AppThemeProvider, useColorMode } from "@/theme/ThemeContext";

export {
  ErrorBoundary,
} from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  const [appError, setAppError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      console.error("Font loading error:", error);
      setAppError("Font loading failed: " + error.message);
      if (__DEV__) throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(console.warn);
    }
  }, [loaded]);

  if (appError) {
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}
      >
        <Text style={{ color: "red", fontSize: 16, textAlign: "center", marginBottom: 10 }}>
          App Error:
        </Text>
        <Text style={{ color: "black", fontSize: 14, textAlign: "center" }}>
          {appError}
        </Text>
      </View>
    );
  }

  return (
    <AppThemeProvider>
      <RootLayoutNav fontsLoaded={loaded} />
    </AppThemeProvider>
  );
}

function RootLayoutNav({ fontsLoaded }: { fontsLoaded: boolean }) {
  const pathname = usePathname();
  const { colorMode } = useColorMode();
  const [showSplash, setShowSplash] = useState(true);
  const [navError, setNavError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (navError) {
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}
      >
        <Text style={{ color: "red", fontSize: 16, textAlign: "center", marginBottom: 10 }}>
          Navigation Error:
        </Text>
        <Text style={{ color: "black", fontSize: 14, textAlign: "center" }}>
          {navError}
        </Text>
        <Text style={{ color: "gray", fontSize: 12, textAlign: "center", marginTop: 10 }}>
          Current path: {pathname}
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexClientProvider>
        <StatusBarManager
          style={colorMode === "dark" ? "light" : "dark"}
          backgroundColor={colorMode === "dark" ? "#121212" : "#FFFFFF"}
          translucent={false}
        />
        <GluestackUIProvider mode={colorMode}>
          <ThemeProvider value={colorMode === "dark" ? DarkTheme : DefaultTheme}>
            <LocationProvider>
              <AuthWrapper>
                <NotificationProvider>
                  <DataProvider>
                    <PrescriptionProvider>
                      <Slot />
                    </PrescriptionProvider>
                  </DataProvider>
                </NotificationProvider>
              </AuthWrapper>
              {(showSplash || !fontsLoaded) && (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                  pointerEvents="none"
                >
                  <BlinkSplash />
                </View>
              )}
            </LocationProvider>
          </ThemeProvider>
        </GluestackUIProvider>
      </ConvexClientProvider>
    </GestureHandlerRootView>
  );
}
