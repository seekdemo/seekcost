"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ThemeKey } from "@/lib/theme";
import { initTheme, setStoredTheme, getStoredCustomColor, getStoredTheme } from "@/lib/theme";

interface ThemeCtx {
  theme: ThemeKey;
  customColor: string;
  setTheme: (t: ThemeKey) => void;
  setCustomColor: (hex: string) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "light",
  customColor: "#4f46e5",
  setTheme: () => {},
  setCustomColor: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>(getStoredTheme);
  const [customColor, setCustomColorState] = useState(getStoredCustomColor);

  useEffect(() => {
    initTheme();
  }, []);

  const setTheme = useCallback((t: ThemeKey) => {
    setThemeState(t);
    if (t === "custom") {
      setStoredTheme(t, customColor);
    } else {
      setStoredTheme(t);
    }
  }, [customColor]);

  const setCustomColor = useCallback((hex: string) => {
    setCustomColorState(hex);
    setThemeState("custom");
    setStoredTheme("custom", hex);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, customColor, setTheme, setCustomColor }}>
      {children}
    </ThemeContext.Provider>
  );
}
