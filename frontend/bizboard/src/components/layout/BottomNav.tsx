"use client";

import { LayoutDashboard, Building2, PlusCircle, BarChart3, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// v1.6.23.14 (TODO 37f116fa): FAB en sık aksiyon olmalı.
// Eski: /dashboard/add (Yeni İşletme) — ömür boyu 1-3 kez.
// Yeni: /dashboard/add-transaction (Yeni İşlem) — günde 30-50 kez.
// İşletme yaratma sidebar'da + ana sayfada ayrı buton ile erişilir.
const navItems = [
  { href: "/dashboard", label: "Ana Sayfa", icon: LayoutDashboard },
  { href: "/dashboard/businesses", label: "İşletmeler", icon: Building2 },
  { href: "/dashboard/add-transaction", label: "İşlem", icon: PlusCircle, accent: true },
  { href: "/dashboard/reports", label: "Raporlar", icon: BarChart3 },
  { href: "/dashboard/profile", label: "Profil", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav md:hidden">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        if (item.accent) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center -mt-5"
            >
              <div className="w-14 h-14 rounded-2xl v2-btn--accent flex items-center justify-center">
                <Icon size={26} />
              </div>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors",
              isActive
                ? "text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent))]"
                : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            )}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
