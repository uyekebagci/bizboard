"use client";

/**
 * v1.6.13: Hamburger sidebar — tüm kısayollar tek alfabetik liste.
 *
 * Davranış:
 *  - Desktop (≥lg): persistent sol panel (240px); açık/kapalı kullanıcı tercihi
 *    `bizboard.preferences.sidebarOpen` localStorage'da
 *  - Mobile + tablet (<lg): off-canvas overlay; backdrop click veya item click ile kapanır
 *  - Klavye: Cmd/Ctrl+B aç/kapat
 *  - 10+ item olduğunda arama input'u görünür (`Intl.Collator("tr")` ile filter)
 *  - SidebarItem: icon + label + active state + (opsiyonel) count badge
 *  - Sıralama: alfabetik (TR locale, "ç" "c"den sonra, "i" / "ı" doğru ayrım)
 *
 * Admin item'lar yalnız `profile?.role === "admin"` iken görünür.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Plus, BarChart3, User, HandCoins,
  CreditCard, Banknote, Package, FolderOpen, Users, Receipt,
  ShieldCheck, FileSearch, History, Repeat, ChevronLeft, Menu,
  Search, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bizboard.preferences.sidebarOpen";

interface SidebarLink {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Opsiyonel count badge — sayısal kaynak veriyle bind edilebilir (notif vs.). */
  count?: number;
}

/** v1.6.13: tüm route'lar — sidebar tek panelinde alfabetik gösterilir. */
const ALL_LINKS: SidebarLink[] = [
  { href: "/dashboard",                  label: "Ana Sayfa",     icon: LayoutDashboard },
  { href: "/dashboard/alacaklar",        label: "Alacaklar",     icon: HandCoins },
  { href: "/dashboard/documents",        label: "Belgeler",      icon: FolderOpen },
  { href: "/dashboard/counterparts",     label: "Cari Hesap",    icon: Users },
  { href: "/dashboard/inventory",        label: "Envanter",      icon: Package },
  { href: "/dashboard/finance",          label: "Finans",        icon: BarChart3 },
  { href: "/dashboard/businesses",       label: "Isletmeler",    icon: Building2 },
  { href: "/dashboard/add",              label: "Isletme Ekle",  icon: Plus },
  { href: "/dashboard/add-transaction",  label: "Islem Ekle",    icon: Receipt },
  { href: "/dashboard/transactions",     label: "Islemler",      icon: Receipt },
  { href: "/dashboard/nakit",            label: "Nakit",         icon: Banknote },
  { href: "/dashboard/pos-cihazlari",    label: "POS",           icon: CreditCard },
  { href: "/dashboard/profile",          label: "Profil",        icon: User },
  { href: "/dashboard/reports",          label: "Raporlar",      icon: BarChart3 },
  { href: "/dashboard/change-password",  label: "Sifre Degistir", icon: ShieldCheck },
  // Admin
  { href: "/admin",                      label: "Admin Paneli",       icon: ShieldCheck, adminOnly: true },
  { href: "/admin/audit",                label: "Admin: Audit Log",   icon: FileSearch, adminOnly: true },
  { href: "/admin/debt-migration",       label: "Admin: Borc Migrate", icon: History,   adminOnly: true },
  { href: "/admin/my-companies",         label: "Admin: Sirketlerim", icon: Building2,  adminOnly: true },
  { href: "/admin/recurring",            label: "Admin: Recurring",   icon: Repeat,     adminOnly: true },
];

const SEARCH_THRESHOLD = 10;

interface Props {
  /** Mobile/tablet kontrolü için harici state — TopBar hamburger tetikler. */
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function Sidebar({ mobileOpen, onMobileOpenChange }: Props) {
  const profile = useAppStore((s) => s.profile);
  const pathname = usePathname();
  const [desktopOpen, setDesktopOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {}
    return true;
  });
  const [query, setQuery] = useState("");

  // Cmd/Ctrl+B toggle (desktop = desktopOpen; mobile = mobileOpen)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (window.matchMedia("(min-width: 1024px)").matches) {
          setDesktopOpen((v) => {
            try { window.localStorage.setItem(STORAGE_KEY, v ? "0" : "1"); } catch {}
            return !v;
          });
        } else {
          onMobileOpenChange(!mobileOpen);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileOpenChange]);

  function toggleDesktop() {
    setDesktopOpen((v) => {
      try { window.localStorage.setItem(STORAGE_KEY, v ? "0" : "1"); } catch {}
      return !v;
    });
  }

  const visible = useMemo(() => {
    const role = profile?.role;
    const items = ALL_LINKS.filter((l) => !l.adminOnly || role === "admin");

    // Alfabetik (TR locale)
    const collator = new Intl.Collator("tr", { sensitivity: "base" });
    items.sort((a, b) => collator.compare(a.label, b.label));

    if (!query.trim()) return items;
    const q = query.trim().toLocaleLowerCase("tr");
    return items.filter((l) => l.label.toLocaleLowerCase("tr").includes(q));
  }, [profile?.role, query]);

  const showSearch = visible.length >= SEARCH_THRESHOLD || query !== "";

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Sidebar'i kapat"
          onClick={() => onMobileOpenChange(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-[100dvh] bg-surface-900 border-r border-surface-700 transition-transform duration-200 ease-out",
          "w-60",
          // mobile/tablet (<lg) off-canvas
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
          // desktop persistent: collapse'da daralt
          !desktopOpen && "lg:w-0 lg:border-r-0",
        )}
        aria-label="Yan menu"
      >
        <div className={cn("flex flex-col h-full overflow-hidden", !desktopOpen && "lg:hidden")}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
            <Link
              href="/dashboard"
              onClick={() => onMobileOpenChange(false)}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-white">CATI</span>
            </Link>
            <button
              type="button"
              onClick={() => onMobileOpenChange(false)}
              className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors lg:hidden"
              aria-label="Kapat"
            >
              <X size={16} className="text-surface-300" />
            </button>
            <button
              type="button"
              onClick={toggleDesktop}
              className="hidden lg:flex p-1.5 rounded-lg hover:bg-surface-700 transition-colors"
              aria-label="Sidebar'i daralt"
              title="Daralt (Cmd/Ctrl+B)"
            >
              <ChevronLeft size={16} className="text-surface-300" />
            </button>
          </div>

          {/* Search (10+ items'da aktif) */}
          {showSearch && (
            <div className="px-3 pt-3 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ara..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-sm text-white placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Items */}
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-xs text-surface-400 text-center">
                Eslesen kisayol yok
              </p>
            ) : (
              <ul className="space-y-0.5">
                {visible.map((item) => (
                  <li key={item.href}>
                    <SidebarItem
                      item={item}
                      active={pathname === item.href}
                      onClick={() => onMobileOpenChange(false)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </nav>

          {/* Footer hint */}
          <div className="hidden lg:block px-3 py-2 border-t border-surface-700 shrink-0">
            <p className="text-[10px] text-surface-500">
              <kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700 text-surface-400">⌘</kbd>
              {" + "}
              <kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700 text-surface-400">B</kbd>
              {" "}ile ac/kapat
            </p>
          </div>
        </div>
      </aside>

      {/* Desktop'ta sidebar kapalıyken küçük "aç" tuşu (kenar bandı) */}
      {!desktopOpen && (
        <button
          type="button"
          onClick={toggleDesktop}
          className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-50 p-1.5 bg-surface-800 border border-l-0 border-surface-700 rounded-r-md text-surface-300 hover:text-white hover:bg-surface-700"
          aria-label="Sidebar'i ac"
          title="Ac (Cmd/Ctrl+B)"
        >
          <Menu size={16} />
        </button>
      )}
    </>
  );
}

function SidebarItem({
  item, active, onClick,
}: {
  item: SidebarLink;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
        active
          ? "bg-brand-700/30 text-white"
          : "text-surface-300 hover:bg-surface-800 hover:text-white",
      )}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-brand-500" aria-hidden />
      )}
      <Icon size={16} className={active ? "text-brand-300" : "text-surface-400"} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.count != null && item.count > 0 && (
        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
          {item.count > 99 ? "99+" : item.count}
        </span>
      )}
    </Link>
  );
}
