"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ApiError,
  clearToken,
  getToken,
  refreshAccessToken,
  subscribeTokenChange,
} from "@/lib/api/client";
import { logger } from "@/lib/logger";

/**
 * Bootstrap akışı:
 *  - Sayfa yüklendiğinde access token bellekte YOK (memory).
 *  - Backend HttpOnly refresh cookie varsa silent refresh dener.
 *  - Public route'larda (auth/login) bootstrap atlanır.
 *  - Silent refresh başarısızsa login'e yönlendirilir.
 *
 * Ayrıca:
 *  - window.onerror & unhandledrejection → logger.error
 *  - Access token expiry'sine yakın proactive refresh (silent)
 *  - Multi-tab: storage event ile logout senkronu
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [bootstrapped, setBootstrapped] = useState(false);
  const bootstrappingRef = useRef(false);

  // ── Bootstrap: silent refresh on mount ──────────────────────────────
  useEffect(() => {
    if (bootstrappingRef.current) return;
    bootstrappingRef.current = true;

    const isPublic = pathname?.startsWith("/auth/");

    async function bootstrap() {
      if (getToken()) {
        setBootstrapped(true);
        return;
      }
      if (isPublic) {
        setBootstrapped(true);
        return;
      }
      try {
        await refreshAccessToken();
      } catch (err) {
        // v1.6.23.2: SİLENT REFRESH FAIL — HER TÜRLÜ HATAYI LOGIN'E AT.
        //
        // Önceki davranış: yalnız 401'de login'e redirect; 500/403/network
        // error'larda sadece logla. Bu durumda bb_session cookie hala duruyor
        // (middleware geçer), accessToken null, kullanıcı "logged in görünüyor"
        // ama API'lara erişemiyordu. Bug: zombie state — kullanıcı sayfayı
        // refresh edince login'e gönderilmiyor.
        //
        // Yeni davranış: refresh fail = oturum yok demektir. Local state'i
        // temizle + login'e hard-redirect. 401 ya da network/5xx fark etmez.
        if (err instanceof ApiError && err.status === 401) {
          logger.info("auth", "Bootstrap: refresh 401 — redirecting to login");
        } else {
          // Network error, 500, 403, vb. — yine de logout flow'a sok.
          logger.error("auth", "Bootstrap: silent refresh failed (non-401)", undefined, err);
        }
        if (typeof document !== "undefined") {
          document.cookie = "bb_session=; path=/; max-age=0; samesite=lax; secure";
        }
        router.replace("/auth/login");
      } finally {
        setBootstrapped(true);
      }
    }

    void bootstrap();
    // pathname değişimi için yeniden çalıştırma yok — yalnız mount'ta bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Multi-tab senkron: bir tabda logout olursa diğerinde de oturum kapansın ──
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (ev.key === "bb_logout_signal" && ev.newValue) {
        clearToken();
        router.replace("/auth/login");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [router]);

  // ── Token değişiminde diğer tab'lere sinyal yolla ──
  useEffect(() => {
    const unsub = subscribeTokenChange((tok) => {
      if (!tok) {
        try {
          localStorage.setItem("bb_logout_signal", String(Date.now()));
        } catch {
          /* ignore */
        }
      }
    });
    return unsub;
  }, []);

  // ── Window-level error handlers → logger ──
  useEffect(() => {
    function onError(event: ErrorEvent) {
      logger.error(
        "boundary",
        "window.onerror",
        {
          source: event.filename,
          line: event.lineno,
          column: event.colno,
        },
        event.error ?? event.message
      );
    }
    function onRejection(event: PromiseRejectionEvent) {
      logger.error(
        "boundary",
        "unhandledrejection",
        {},
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason))
      );
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!bootstrapped) {
    // Boş ekran yerine basit bir splash. Çok kısa süreli — refresh ~100ms.
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#212529",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: "3px solid rgba(255,255,255,0.2)",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
