"use client";

import { useEffect, useState } from "react";

/**
 * UI v2 — `prefers-reduced-motion: reduce` medya sorgusunu izler.
 *
 * <p>Motion primitive'leri (AnimatedNumber, Reveal) bu hook ile kullanıcının
 * hareket azaltma tercihine saygı duyar: true ise animasyon yapılmaz, son
 * değere/duruma anında geçilir.</p>
 *
 * <p>SSR güvenli: ilk render `false` döner (no-FOUC), mount'ta gerçek değere
 * senkronlanır. CSS katmanı zaten `@media (prefers-reduced-motion)` ile
 * korunduğu için bu hook yalnız JS-sürücülü hareket (count-up) için gerekir.</p>
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    // Safari <14 fallback (addListener).
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  return reduced;
}
