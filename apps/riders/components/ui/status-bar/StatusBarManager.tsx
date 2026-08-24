import React from "react";
import { Platform, StatusBar as RNStatusBar } from "react-native";

interface StatusBarManagerProps {
  style?: "auto" | "inverted" | "light" | "dark";
  backgroundColor?: string;
  translucent?: boolean;
}

/**
 * StatusBarManager — one place to set status bar appearance across the app.
 *
 * ── Why this no longer uses expo-status-bar ───────────────────────────────
 *
 * `expo-status-bar` has no SDK 55 release. It stopped following Expo's unified
 * versioning after SDK 51 (1.12.1) and its next publish is 57.0.1, so there is
 * nothing to install for this SDK. Its job is now covered by React Native's own
 * `StatusBar` and by `expo-system-ui`.
 *
 * This component already drove the Android side through `RNStatusBar` in an
 * effect and only delegated the declarative render to Expo's wrapper, so the
 * port is a narrowing rather than a rewrite: the effect now handles both
 * platforms and the component renders nothing.
 *
 * Behaviour notes:
 *
 *   - `backgroundColor` and `translucent` are Android-only in React Native, as
 *     they were through Expo's wrapper. On iOS the bar sits over the app's own
 *     background, which is what `edgeToEdgeEnabled: true` now expects.
 *   - Expo resolved `style="auto"` against the colour scheme and `"inverted"`
 *     against the current bar style. React Native has no equivalent, so both are
 *     mapped explicitly below. Every call site in the app passes "light" or
 *     "dark", so neither case is reachable today — mapping them means a future
 *     caller gets a defined result instead of a silent difference.
 */
export const StatusBarManager: React.FC<StatusBarManagerProps> = ({
  style = "dark",
  backgroundColor = "#FFFFFF",
  translucent = false,
}) => {
  React.useEffect(() => {
    const barStyle: "dark-content" | "light-content" =
      style === "light" || style === "inverted"
        ? "light-content"
        : "dark-content";

    RNStatusBar.setBarStyle(barStyle, true);

    if (Platform.OS === "android") {
      RNStatusBar.setBackgroundColor(backgroundColor, true);
      RNStatusBar.setTranslucent(translucent);
    }
  }, [style, backgroundColor, translucent]);

  return null;
};

export default StatusBarManager;
