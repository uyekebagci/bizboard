"use client";

/**
 * v1.6.13: Sidebar + TopBar entegrasyon shell'i.
 *
 * Server component olan `DashboardLayout` bunu çağırır; mobile sidebar açık/kapalı
 * state'i burada client-side tutulur.
 *
 * Desktop'ta sidebar 240px sol panel; mobile + tablet'te off-canvas overlay.
 * Hamburger butonu TopBar'ın solunda yalnız `<lg` ekranlarda görünür.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import { useAppStore } from "@/lib/store";
import { canAccessHref } from "@/lib/pages";

/**
 * Kullanıcı-bazlı sayfa-erişim guard'ı (navigasyon seviyesi). İzinsiz bir KATALOG
 * sayfasına gidilirse kullanıcıyı Ana Sayfa'ya yönlendirir. Default-permissive:
 * profil yüklenmeden / "all" / katalog dışı route'larda yönlendirme YOK. Admin
 * backend'de ["all"] aldığı için hiç etkilenmez. Sayfa endpoint RBAC'ı ayrıdır.
 */
function usePageAccessGuard() {
  const profile = useAppStore((s) => s.profile);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!profile || !pathname) return; // profil yüklenene kadar bekle
    if (!canAccessHref(pathname, profile.allowed_pages)) {
      router.replace("/dashboard");
    }
  }, [profile, pathname, router]);
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  usePageAccessGuard();

  return (
    /* UI v2: Daxa solid app zemini (--v2-app) — ambient gradient yerine
       içerik kartlarıyla tutarlı düz katmanlı yüzey. */
    <div className="v2-app-bg min-h-[100dvh]">
      <Sidebar mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />

      {/* Desktop'ta sidebar 240px alır; sıkı bir margin yerine padding-left ile
          ana içeriği sağa kaydırıyoruz (sidebar absolute olduğu için).
          relative z-10 → içerik ambient gradient'in (z-0) üstünde. */}
      <div className="relative z-10 lg:pl-60 transition-[padding] duration-200">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <ErrorBoundary level="route">
          <main className="flex-1 px-4 pt-4 pb-24 max-w-7xl mx-auto w-full">
            {children}
          </main>
        </ErrorBoundary>
        <BottomNav />
      </div>
    </div>
  );
}
