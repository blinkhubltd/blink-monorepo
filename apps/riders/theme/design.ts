const LIGHT_THEME = {
  colors: {
    primary: "#FFA000",
    primaryLight: "#FFD54F",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceSecondary: "#F5F5F5",
    text: "#212121",
    textSecondary: "#757575",
    textTertiary: "#9E9E9E",
    inactive: "#BDBDBD",
    border: "#E0E0E0",
    success: "#4CAF50",
    warning: "#FF9800",
    error: "#F44336",
    info: "#2196F3",
    // Feature-specific tokens
    clearance: "#5C6BC0",
    clearanceLight: "#EEF0FA",
    clearanceBorder: "#B0BAE8",
    prescription: "#F59E0B",
    prescriptionBg: "#FEF3C7",
    prescriptionText: "#92400E",
  },
  buttonText: {
    primary: "#000000",
    secondary: "#212121",
    outline: "#FFA000",
  },
  STATUS_COLORS: {
    Pending: "#FF9800",
    Confirmed: "#2196F3",
    Processing: "#9C27B0",
    Pickup: "#00BCD4",
    AwaitingPickup: "#00BCD4",
    PickedUp: "#009688",
    Delivery: "#FFA000",
    Delivered: "#4CAF50",
    Cancelled: "#F44336",
    Refunded: "#FF5722",
    Paid: "#4CAF50",
    Unpaid: "#FF9800",
  },
};

const DARK_THEME = {
  colors: {
    primary: "#FFC107",
    primaryLight: "#FFD54F",
    background: "#121212",
    surface: "#1E1E1E",
    surfaceSecondary: "#2C2C2C",
    text: "#FFFFFF",
    textSecondary: "#B3B3B3",
    textTertiary: "#808080",
    inactive: "#666666",
    border: "#333333",
    success: "#4CAF50",
    warning: "#FF9800",
    error: "#F44336",
    info: "#2196F3",
    // Feature-specific tokens
    clearance: "#7986CB",
    clearanceLight: "#1A1F3A",
    clearanceBorder: "#3F4B8C",
    prescription: "#FFC107",
    prescriptionBg: "#2D2100",
    prescriptionText: "#FFD54F",
  },
  buttonText: {
    primary: "#000000",
    secondary: "#FFFFFF",
    outline: "#FFC107",
  },
  STATUS_COLORS: {
    Pending: "#FF9800",
    Confirmed: "#2196F3",
    Processing: "#9C27B0",
    Pickup: "#00BCD4",
    AwaitingPickup: "#00BCD4",
    PickedUp: "#009688",
    Delivery: "#FFC107",
    Delivered: "#4CAF50",
    Cancelled: "#F44336",
    Refunded: "#FF5722",
    Paid: "#4CAF50",
    Unpaid: "#FF9800",
  },
};

const SHARED = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  shadow: {
    card: {
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
    },
  },
  badge: {
    small: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      fontSize: 10,
      fontWeight: "600" as const,
    },
    medium: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      fontSize: 11,
      fontWeight: "600" as const,
    },
    large: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      fontSize: 12,
      fontWeight: "700" as const,
    },
  },
  TAB_BOTTOM_PADDING: 120,
};

export type ThemeColors = typeof LIGHT_THEME.colors;
export type Theme = typeof LIGHT_THEME & typeof SHARED;

export const LIGHT = { ...LIGHT_THEME, ...SHARED };
export const DARK = { ...DARK_THEME, ...SHARED };

// Static light-theme export kept for backward compatibility
const THEME = LIGHT;

if (!THEME || !THEME.colors || !THEME.colors.primary) {
  throw new Error("THEME is not properly defined");
}

export { THEME };
export default THEME;
