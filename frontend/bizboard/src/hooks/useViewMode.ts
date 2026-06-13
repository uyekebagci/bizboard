"use client";

/**
 * UX-10 — Liste/tablo görünüm tercihi (localStorage'da kalıcı).
 *
 * Patron "Excel-vari" yoğun tarama isterken liste sayfaları kart-satır. Bu hook
 * sayfa başına bağımsız bir "card" | "table" tercihi tutar ve localStorage'a
 * yazar; SSR/ilk-render hidrasyon güvenliği için tercih `mounted` olana dek
 * varsayılan değerle döner.
 */

import { useCallback, useEffect, useState } from "react";

export type ViewMode = "card" | "table";

const PREFIX = "cati-viewmode-";

export function useViewMode(
  key: string,
  defaultMode: ViewMode = "card",
): { mode: ViewMode; setMode: (m: ViewMode) => void; toggle: () => void; mounted: boolean } {
  const storageKey = `${PREFIX}${key}`;
  const [mode, setModeState] = useState<ViewMode>(defaultMode);
  const [mounted, setMounted] = useState(false);

  // Hidrasyon güvenliği: localStorage yalnız client'ta okunur. İlk render
  // server ile aynı (defaultMode) → mismatch yok; mount sonrası tercih uygulanır.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "card" || saved === "table") setModeState(saved);
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, [storageKey]);

  const setMode = useCallback(
    (m: ViewMode) => {
      setModeState(m);
      try {
        localStorage.setItem(storageKey, m);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "card" ? "table" : "card";
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  return { mode, setMode, toggle, mounted };
}
