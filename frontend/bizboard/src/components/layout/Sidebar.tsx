"use client";

/**
 * v1.6.13+: Hamburger sidebar — tüm kısayollar tek alfabetik liste.
 * v1.6.17+: Desktop'ta her zaman **sabit** (collapse yok). TopBar'dan logo
 * kaldırıldığı için marka adı + version yalnız burada görünür.
 *
 * Davranış:
 *  - Desktop (≥lg): persistent sol panel (240px), collapse yok
 *  - Mobile + tablet (<lg): off-canvas overlay; backdrop click / item click ile kapanır
 *  - Klavye: Cmd/Ctrl+B → mobile overlay aç/kapat (desktop'ta no-op)
 *  - 10+ item olduğunda arama input'u görünür (`Intl.Collator("tr")` ile filter)
 *  - SidebarItem: icon + label + active state + (opsiyonel) count badge
 *  - Sıralama: alfabetik (TR locale)
 *  - Admin item'lar yalnız `profile?.role === "admin"` iken görünür
 *  - Version etiketi (header altında) tüm kullanıcılarda görünür
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Plus, BarChart3, User, HandCoins,
  CreditCard, Banknote, Package, FolderOpen, Users, Receipt,
  ShieldCheck, FileSearch, History, Repeat, CalendarCheck, FileText, Wallet,
  Search, X, Smartphone, ChevronDown, ChevronRight, Pin, Landmark,
} from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import type { LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BETA_LABEL } from "@/lib/version";

interface SidebarLink {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Opsiyonel count badge — sayısal kaynak veriyle bind edilebilir (notif vs.). */
  count?: number;
}

/** v1.6.13: tüm route'lar — sidebar tek panelinde alfabetik gösterilir.
 *  v1.6.23.17: "Isletmeler" ve "Isletme Ekle" kaldırıldı.
 *   - İşletme listesi artık üstteki BusinessesSection dropdown'ında (pin'li üstte).
 *   - İşletme ekleme sadece ana sayfada (BusinessGrid'in üst butonu). */
const ALL_LINKS: SidebarLink[] = [
  { href: "/dashboard",                  label: "Ana Sayfa",     icon: LayoutDashboard },
  { href: "/dashboard/alacaklar",        label: "Alacaklar",     icon: HandCoins },
  // v1.7.x (UI Fix WP TODO 1d5d526b): Verecekler sayfası — PAYABLE muadili.
  { href: "/dashboard/verecekler",       label: "Verecekler",    icon: HandCoins },
  // v1.6.23.22 (UI Fix WP TODO cb3fa697): Banka Hesapları herkese görünür
  // (tenant izolasyonu backend'de) — eski "Admin: Hesap Havuzu" buraya taşındı.
  { href: "/dashboard/hesaplar",         label: "Banka Hesaplari", icon: Wallet },
  { href: "/dashboard/documents",        label: "Belgeler",      icon: FolderOpen },
  { href: "/dashboard/counterparts",     label: "Cari Hesap",    icon: Users },
  { href: "/dashboard/cekler",           label: "Cekler",        icon: FileText },
  { href: "/dashboard/inventory",        label: "Envanter",      icon: Package },
  { href: "/dashboard/finance",          label: "Finans",        icon: BarChart3 },
  // v1.7.x WP 8b961444: Firmalarım — admin tüm firmaları yönetir, non-admin yalnız erişim verilenleri görür.
  { href: "/dashboard/firmalarim",       label: "Firmalarim",    icon: Building2 },
  { href: "/dashboard/kapanislar",       label: "Kapanislar",    icon: CalendarCheck },
  { href: "/dashboard/kisiler",          label: "Kisiler",       icon: User },
  { href: "/dashboard/add-transaction",  label: "Islem Ekle",    icon: Receipt },
  { href: "/dashboard/transactions",     label: "Islemler",      icon: Receipt },
  { href: "/dashboard/nakit",            label: "Nakit",         icon: Banknote },
  // Vergi Takvimi Modülü (WP 57481770): TR vergi son tarihleri + bildirim.
  { href: "/dashboard/vergi-takvimi",    label: "Vergi Takvimi", icon: Landmark },
  { href: "/dashboard/pos-cihazlari",    label: "POS",           icon: CreditCard },
  { href: "/dashboard/profile",          label: "Profil",        icon: User },
  // v1.6.23.12 (WP 3c8401f6): Telefon takibi (DGR'nin fiziki telefonları)
  { href: "/dashboard/telefonlar",       label: "Telefonlar",    icon: Smartphone },
  { href: "/dashboard/reports",          label: "Raporlar",      icon: BarChart3 },
  { href: "/dashboard/change-password",  label: "Sifre Degistir", icon: ShieldCheck },
  // Admin
  { href: "/admin",                      label: "Admin Paneli",       icon: ShieldCheck, adminOnly: true },
  { href: "/admin/audit",                label: "Admin: Audit Log",   icon: FileSearch, adminOnly: true },
  { href: "/admin/debt-migration",       label: "Admin: Borc Migrate", icon: History,   adminOnly: true },
  { href: "/admin/my-companies",         label: "Admin: Sirketlerim", icon: Building2,  adminOnly: true },
  { href: "/admin/recurring",            label: "Admin: Recurring",   icon: Repeat,     adminOnly: true },
  { href: "/dashboard/pos-cihazlari/yonetim", label: "Admin: POS Yonetim", icon: CreditCard, adminOnly: true },
];

const SEARCH_THRESHOLD = 10;

interface Props {
  /** Mobile/tablet kontrolü için harici state — TopBar hamburger tetikler. */
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

// v1.6.23.18: shortcut pin localStorage key (BusinessesSection key'inden ayrı).
const SHORTCUT_PIN_KEY = "bb_pinned_sidebar_v1";

function loadShortcutPins(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SHORTCUT_PIN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveShortcutPins(pins: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHORTCUT_PIN_KEY, JSON.stringify(pins));
  } catch {
    /* quota */
  }
}

export function Sidebar({ mobileOpen, onMobileOpenChange }: Props) {
  const profile = useAppStore((s) => s.profile);
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  // v1.6.23.18: tüm sidebar kısayolları için pin (BusinessesSection ile aynı pattern).
  const [shortcutPins, setShortcutPins] = useState<Record<string, number>>({});

  useEffect(() => {
    setShortcutPins(loadShortcutPins());
  }, []);

  function toggleShortcutPin(href: string) {
    setShortcutPins((prev) => {
      const next = { ...prev };
      if (next[href]) delete next[href];
      else next[href] = Date.now();
      saveShortcutPins(next);
      return next;
    });
  }

  // Cmd/Ctrl+B → mobile overlay aç/kapat (desktop'ta sidebar zaten sabit, no-op).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        // Yalnız <lg ekranda anlamlı.
        if (!window.matchMedia("(min-width: 1024px)").matches) {
          e.preventDefault();
          onMobileOpenChange(!mobileOpen);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileOpenChange]);

  const visible = useMemo(() => {
    const role = profile?.role;
    let items = ALL_LINKS.filter((l) => !l.adminOnly || role === "admin");

    // v1.6.23.18: pinli üstte (ilk pinlenen önce), kalanı alfabetik (TR locale)
    const collator = new Intl.Collator("tr", { sensitivity: "base" });
    items.sort((a, b) => {
      const ap = shortcutPins[a.href];
      const bp = shortcutPins[b.href];
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      if (ap && bp) return ap - bp;
      return collator.compare(a.label, b.label);
    });

    if (!query.trim()) return items;
    const q = query.trim().toLocaleLowerCase("tr");
    return items.filter((l) => l.label.toLocaleLowerCase("tr").includes(q));
  }, [profile?.role, query, shortcutPins]);

  const showSearch = visible.length >= SEARCH_THRESHOLD || query !== "";
  // v1.7.x BETA: semantic versiyon yerine sabit etiket. Beta sonrası
  // formatVersion(process.env.NEXT_PUBLIC_APP_VERSION) geri açılacak.
  const versionLabel = BETA_LABEL;

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
          "fixed top-0 left-0 z-50 h-[100dvh] w-60 bg-surface-900 border-r border-surface-700 transition-transform duration-200 ease-out",
          // mobile/tablet (<lg): hamburger ile aç-kapat
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // desktop (≥lg): her zaman sabit
          "lg:translate-x-0",
        )}
        aria-label="Yan menu"
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header — logo + marka adı + version badge (herkes görür) */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
            <Link
              href="/dashboard"
              onClick={() => onMobileOpenChange(false)}
              className="flex items-center gap-2.5"
              aria-label="CATI ana sayfa"
            >
              {/* Redesign PR-1: gradient logo kutusu + glow. */}
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-glow"
                style={{ background: "linear-gradient(135deg,#4263eb,#4c6ef5 55%,#6741d9)" }}>
                <span className="text-white font-bold text-sm">Ç</span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-lg text-white leading-none h-display">ÇATI</span>
                {versionLabel && (
                  <span
                    className="mt-0.5 text-[10px] italic text-yellow-400 font-mono leading-none tracking-tight"
                    title="Beta sürümü"
                  >
                    {versionLabel}
                  </span>
                )}
              </div>
            </Link>
            {/* Mobile-only kapatma */}
            <button
              type="button"
              onClick={() => onMobileOpenChange(false)}
              className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors lg:hidden"
              aria-label="Kapat"
            >
              <X size={16} className="text-surface-300" />
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
              <>
                {/* v1.6.23.17: İşletmeler dropdown EN ÜSTTE — pinli üstte,
                    sonra alfabetik kalanlar. Sabit menü itemleri ALTTA. */}
                <BusinessesSection
                  currentPath={pathname || ""}
                  onItemClick={() => onMobileOpenChange(false)}
                />

                <ul className="space-y-0.5 mt-3 pt-3 border-t border-surface-700">
                  {visible.map((item) => (
                    <li key={item.href}>
                      <SidebarItem
                        item={item}
                        active={pathname === item.href}
                        pinned={!!shortcutPins[item.href]}
                        onTogglePin={() => toggleShortcutPin(item.href)}
                        onClick={() => onMobileOpenChange(false)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}

function SidebarItem({
  item, active, pinned, onTogglePin, onClick,
}: {
  item: SidebarLink;
  active: boolean;
  /** v1.6.23.18: pin state — pinli ise dolu Pin ikon, kalanı outline. */
  pinned?: boolean;
  onTogglePin?: () => void;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <div className={cn("relative flex items-stretch", active && "nav-item-active")}>
      {/* Redesign PR-1: aktif ray (sol kenarda dikey brand çubuk). */}
      <span
        className="nav-rail absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand-500"
        aria-hidden="true"
      />
      <Link
        href={item.href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-l-lg text-sm transition-colors flex-1 min-w-0",
          active
            ? "bg-gradient-to-r from-brand-500/20 to-brand-500/[0.04] text-white font-semibold"
            : "text-surface-300 hover:bg-surface-800 hover:text-white",
          pinned && "border-l-2 border-brand-500 -ml-[2px] pl-[10px]"
        )}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={16} className={active ? "text-brand-300" : "text-surface-400"} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.count != null && item.count > 0 && (
          <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
            {item.count > 99 ? "99+" : item.count}
          </span>
        )}
      </Link>
      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(); }}
          className={cn(
            "shrink-0 px-2 rounded-r-lg flex items-center justify-center transition-colors",
            pinned
              ? "text-brand-400 hover:text-brand-300 hover:bg-surface-700"
              : "text-surface-500 hover:text-white hover:bg-surface-700"
          )}
          aria-label={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
          title={pinned ? "Sabitlemeyi kaldır" : "Sabitle (üste taşı)"}
        >
          {pinned ? <Pin size={12} fill="currentColor" /> : <Pin size={12} />}
        </button>
      )}
    </div>
  );
}

// v1.6.23.15 (TODO 815006ad): Sidebar'da işletmeler collapsible bölümü + pin.
// Pin durumu localStorage'da tutulur (backend persistence ileride eklenebilir).

const PIN_STORAGE_KEY = "bb_pinned_businesses_v1";

function loadPins(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePins(pins: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
  } catch {
    /* ignore quota */
  }
}

function BusinessesSection({
  currentPath,
  onItemClick,
}: {
  currentPath: string;
  onItemClick: () => void;
}) {
  const { businesses } = useBusinesses();
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("bb_sidebar_biz_open") !== "false";
  });
  const [pins, setPins] = useState<Record<string, number>>({});

  useEffect(() => {
    setPins(loadPins());
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("bb_sidebar_biz_open", next ? "true" : "false");
    }
  }

  function togglePin(id: string) {
    setPins((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = Date.now();
      }
      savePins(next);
      return next;
    });
  }

  const sorted = useMemo(() => {
    const collator = new Intl.Collator("tr", { sensitivity: "base" });
    const items = [...(businesses || [])];
    items.sort((a, b) => {
      const ap = pins[a.id];
      const bp = pins[b.id];
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      if (ap && bp) return ap - bp; // ilk pinlenen üstte
      return collator.compare(a.name, b.name);
    });
    return items;
  }, [businesses, pins]);

  if (!businesses || businesses.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wider text-surface-400 hover:text-white"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1 text-left">İşletmeler</span>
        <span className="text-surface-500 normal-case tracking-normal text-[10px]">
          {sorted.length}
        </span>
      </button>
      {open && (
        <ul className="space-y-0.5 mt-1">
          {sorted.map((b) => {
            const active = currentPath === `/business/${b.id}`;
            const pinned = !!pins[b.id];
            return (
              <li key={b.id} className="relative flex items-stretch">
                {/* v1.6.23.17: Pin butonu kesin görünür — Link'in DIŞINDA
                    flex sibling olarak, opacity yok, her zaman gösterilir.
                    Önceki version'larda absolute + opacity yüzünden gizliydi. */}
                <Link
                  href={`/business/${b.id}`}
                  onClick={onItemClick}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-1.5 rounded-l-lg text-sm transition-colors flex-1 min-w-0",
                    active
                      ? "bg-brand-700/30 text-white"
                      : "text-surface-300 hover:bg-surface-800 hover:text-white",
                    pinned && "border-l-2 border-brand-500 -ml-[2px] pl-[10px]"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Building2 size={14} className={active ? "text-brand-300" : "text-surface-400"} />
                  <span className="flex-1 truncate text-[13px]">{b.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(b.id); }}
                  className={cn(
                    "shrink-0 px-2 rounded-r-lg flex items-center justify-center transition-colors",
                    pinned
                      ? "text-brand-400 hover:text-brand-300 hover:bg-surface-700"
                      : "text-surface-500 hover:text-white hover:bg-surface-700"
                  )}
                  aria-label={pinned ? "Unpin" : "Pin"}
                  title={pinned ? "Sabitlemeyi kaldır" : "Sabitle (üste taşı)"}
                >
                  {pinned ? <Pin size={12} fill="currentColor" /> : <Pin size={12} />}
                </button>
              </li>
            );
          })}
          {/* v1.6.23.18: İşletmeler dropdown sonuna sabit "İşletme Ekle" kısayolu. */}
          <li className="mt-1 pt-1 border-t border-surface-700/50">
            <Link
              href="/dashboard/add"
              onClick={onItemClick}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-brand-300 hover:bg-brand-700/20 hover:text-brand-200 transition-colors"
            >
              <Plus size={14} />
              <span className="flex-1 truncate text-[13px]">Yeni İşletme</span>
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
