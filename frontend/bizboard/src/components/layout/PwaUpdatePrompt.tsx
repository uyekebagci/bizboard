"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * Service worker yenilemesini takip eden bilesen.
 *
 * Mevcut konfigurasyonda next-pwa `skipWaiting: true` + `clientsClaim: true`
 * ile kuruldu: yeni SW yuklenir yuklenmez aktive olur. Bu durumda "waiting"
 * state'i pratik olarak gerceklesmez, asagidaki prompt UI'i nadiren cikar.
 * Buradaki esas mekanizma `controllerchange` listener'i — yeni SW kontrolu
 * eline alinca window.location.reload() ile sayfayi yeniler. Boylece deploy
 * sonrasi kullanici hiçbir butona basmadan fresh surumu gorur.
 *
 * skipWaiting: false akisina geri donulurse asagidaki prompt UI'i devreye
 * girer ve kullanici manuel "Yenile" ile guncellemeyi tetikler.
 */
export function PwaUpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let mounted = true;

    function trackWaiting(reg: ServiceWorkerRegistration) {
      if (reg.waiting) {
        if (mounted) setWaiting(reg.waiting);
      }
      // updatefound: yeni SW kuruluyor.
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            // Yeni SW hazır, ama eski aktif. waiting durumuna girdi.
            if (mounted) setWaiting(installing);
          }
        });
      });
    }

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg;
      trackWaiting(reg);
    });

    // Controller değişti = yeni SW aktive oldu = sayfayı yenileyelim.
    const onControllerChange = () => {
      // Tek sefer reload — birden çok controllerchange tetiklenirse refresh loop olmasın.
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      void registration; // referans tut, garbage collect olmasin
    };
  }, []);

  if (!waiting) return null;

  function handleReload() {
    waiting?.postMessage({ type: "SKIP_WAITING" });
    // controllerchange handler reload yapacak
  }

  function handleDismiss() {
    setWaiting(null);
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] max-w-sm w-[calc(100vw-2rem)] mx-auto"
    >
      <div className="bg-surface-800 border border-surface-600 shadow-card-hover rounded-2xl px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
          <RefreshCw size={18} className="text-surface-100" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-surface-100">Yeni surum hazir</p>
          <p className="text-xs text-surface-300">
            Yenilemek icin sayfayi tekrar yukleyin.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReload}
          className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium"
        >
          Yenile
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Kapat"
          className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-700"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
