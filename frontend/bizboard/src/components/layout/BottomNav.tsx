"use client";

import { LayoutDashboard, Building2, PlusCircle, BarChart3, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Ana Sayfa", icon: LayoutDashboard },
  { href: "/dashboard/businesses", label: "Isletmeler", icon: Building2 },
  { href: "/dashboard/add", label: "Ekle", icon: PlusCircle, accent: true },
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
              <div className="w-14 h-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-glow">
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
                ? "text-brand-600"
                : "text-surface-500 hover:text-surface-700"
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
