"use client";

import { useProfile } from "@/hooks/useProfile";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Fetch profile on mount (sets it in global store for TopBar etc.)
  // v1.7.x: zorunlu şifre değişikliği yönlendirmesi kaldırıldı.
  useProfile();
  return <>{children}</>;
}
