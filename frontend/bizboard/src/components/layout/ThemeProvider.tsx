"use client";

/**
 * Çift tema FAZ 1 (Yol B): hafif, bağımlılıksız ThemeProvider.
 *
 * <p>Davranış (architect tasarımı): attribute="class" (<html class="dark">),
 * defaultTheme="dark", system tema KAPALI, localStorage persist. next-themes
 * paketi yerine ~kendi içinde tutulan minimal provider — canlı prod'da yeni
 * bağımlılık eklemeden aynı sözleşmeyi sağlar.</p>
 *
 * <p>FOUC: ilk boyama öncesi {@code <html>} class'ı layout.tsx'teki inline
 * script ile set edilir; bu provider mount'ta yalnız senkronize eder.</p>
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "cati-theme";
const DEFAULT_THEME: Theme = "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyThemeClass(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* localStorage erişilemezse default */
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // İlk render SSR ile uyumlu olsun diye default'tan başlar; mount'ta storage'a senkron olur.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const initial = readStoredTheme();
    setThemeState(initial);
    applyThemeClass(initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyThemeClass(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* persist edilemezse sessiz */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Provider dışında çağrılırsa güvenli no-op fallback (build/SSR güvenliği).
    return { theme: DEFAULT_THEME, toggleTheme: () => {}, setTheme: () => {} };
  }
  return ctx;
}
