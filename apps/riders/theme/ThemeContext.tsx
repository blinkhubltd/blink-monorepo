import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LIGHT, DARK } from "./design";

type ColorMode = "light" | "dark";

interface ThemeContextType {
  colorMode: ColorMode;
  toggleColorMode: () => void;
  theme: typeof LIGHT;
}

const ThemeContext = createContext<ThemeContextType>({
  colorMode: "light",
  toggleColorMode: () => {},
  theme: LIGHT,
});

const STORAGE_KEY = "@blink_rider_color_mode";

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorMode] = useState<ColorMode>("light");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") {
        setColorMode(saved);
      }
    });
  }, []);

  const toggleColorMode = useCallback(() => {
    setColorMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const theme = colorMode === "dark" ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ colorMode, toggleColorMode, theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext).theme;
}

export function useColorMode() {
  const { colorMode, toggleColorMode } = useContext(ThemeContext);
  return { colorMode, toggleColorMode };
}
