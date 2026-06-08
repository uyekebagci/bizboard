"use client";

/**
 * WP 4b51cf42: Client-side proaktif idle logout.
 *
 * <p>Backend zaten idle (30dk) + absolute (12s) cap'i UYGULAR — bu yalnız UX
 * iyileştirmesi: idle bir sekmeyi bir sonraki API çağrısını beklemeden, süre
 * dolunca proaktif olarak login'e atar. Kullanıcı etkileşiminde (mouse/klavye/
 * touch/scroll) sayaç sıfırlanır.</p>
 *
 * <p>Authoritative değildir — gerçek reddi backend RefreshTokenService verir.
 * Bu sadece "idle sekme açık kalmasın" içindir. forceLogout mevcut hard-logout
 * pattern'ini (token temizle + çoklu sekme sinyali + login'e yönlendir) kullanır.</p>
 */

import { useEffect, useRef } from "react";
import { forceLogout, getToken } from "@/lib/api/client";

// Backend default idle 30 dk ile hizalı.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];

export function useIdleLogout(enabled: boolean = true) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    function fireLogoutIfIdle() {
      // Token zaten yoksa (login sayfası vb.) bir şey yapma.
      if (getToken()) {
        forceLogout();
      }
    }

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fireLogoutIfIdle, IDLE_TIMEOUT_MS);
    }

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset(); // ilk sayaç

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled]);
}
