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

import { useState } from "react";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { ErrorBoundary } from "./ErrorBoundary";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    /* Redesign PR-1: app-bg → ambient radial gradient (::before, z-0). */
    <div className="app-bg min-h-[100dvh] bg-surface-900">
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
