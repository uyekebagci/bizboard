"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Fetch profile on mount (sets it in global store for TopBar etc.)
  const { profile } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  // Force password change yonlendirmesi: kullanici bootstrap'tan sonra
  // force_password_change=true ise change-password ekrani disindaki tum
  // sayfalardan oraya yonlendirilir.
  useEffect(() => {
    if (!profile) return;
    if (profile.force_password_change && pathname !== "/dashboard/change-password") {
      router.replace("/dashboard/change-password");
    }
  }, [profile, pathname, router]);

  return <>{children}</>;
}
