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
  LayoutDashboard, Building2, BarChart3, User, HandCoins,
  CreditCard, Banknote, Package, FolderOpen, Users, Receipt,
  ShieldCheck, FileSearch, History, Repeat, CalendarCheck, FileText, Wallet,
  Search, X, Smartphone, Pin, Landmark, Tags, Sparkles, Lock, PieChart, Bot,
  ClipboardCheck, ScanLine, TrendingUp, Bell, AlarmClock,
} from "lucide-react";
import { SidebarBusinessesSection } from "./SidebarBusinessesSection";
import type { LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BETA_LABEL } from "@/lib/version";

/** Gruplu sidebar bölümleri (mockup gibi curated his). */
type NavGroup = "genel" | "cari" | "kasa" | "operasyon" | "yonetim";

interface SidebarLink {
  href: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  adminOnly?: boolean;
  /** Opsiyonel count badge — sayısal kaynak veriyle bind edilebilir (notif vs.). */
  count?: number;
}

/** Bölüm sırası + başlıkları. "yonetim" yalnız admin'de render olur (item'lar adminOnly). */
const GROUP_ORDER: { key: NavGroup; label: string }[] = [
  { key: "genel",     label: "Genel" },
  { key: "cari",      label: "Cari & Borçlar" },
  { key: "kasa",      label: "Kasa & Banka" },
  { key: "operasyon", label: "Operasyon" },
  { key: "yonetim",   label: "Yönetim" },
];

/** v1.6.13: tüm route'lar — artık GRUPLU bölümlerde (pin + arama korunur).
 *  Profil + Şifre Değiştir TopBar avatar dropdown'a taşındı (burada YOK).
 *  İşletme listesi üstteki BusinessesSection dropdown'ında. */
const ALL_LINKS: SidebarLink[] = [
  // ── Genel ──
  { href: "/dashboard",                  label: "Ana Sayfa",     icon: LayoutDashboard, group: "genel" },
  { href: "/dashboard/firmalarim",       label: "Firmalarım",    icon: Building2,       group: "genel" },
  { href: "/dashboard/add-transaction",  label: "İşlem Ekle",    icon: Receipt,         group: "genel" },
  { href: "/dashboard/transactions",     label: "İşlemler",      icon: Receipt,         group: "genel" },
  { href: "/dashboard/categories",       label: "Kategoriler",   icon: Tags,            group: "genel" },
  { href: "/dashboard/finance",          label: "Finans",        icon: BarChart3,       group: "genel" },
  { href: "/dashboard/reports",          label: "Raporlar",      icon: BarChart3,       group: "genel" },
  { href: "/dashboard/ai",               label: "AI Asistan",    icon: Bot,             group: "genel" },
  { href: "/dashboard/e-fatura",         label: "e-Fatura",      icon: Receipt,         group: "genel" },
  { href: "/dashboard/reports/forecast", label: "Nakit Tahmin",  icon: TrendingUp,      group: "genel" },
  { href: "/dashboard/reports/butce",    label: "Bütçe",         icon: Wallet,          group: "genel" },
  { href: "/dashboard/bildirimler",      label: "Bildirimler",   icon: Bell,            group: "genel" },
  { href: "/dashboard/hatirlaticilar",   label: "Hatırlatıcılar", icon: AlarmClock,     group: "genel" },
  // ── Cari & Borçlar ──
  { href: "/dashboard/counterparts",     label: "Cari Hesap",    icon: Users,           group: "cari" },
  { href: "/dashboard/alacaklar",        label: "Alacaklar",     icon: HandCoins,       group: "cari" },
  { href: "/dashboard/verecekler",       label: "Verecekler",    icon: HandCoins,       group: "cari" },
  { href: "/dashboard/krediler",         label: "Krediler",      icon: Landmark,        group: "cari" },
  // Legacy "Çekler" (/dashboard/cekler, Debt-tabanlı) kanonik Çek/Senet
  // (Instrument/Ledger v2) ile birleştirildi; eski route /cek-senet'e redirect.
  { href: "/dashboard/cek-senet",        label: "Çek/Senet",     icon: FileText,        group: "cari" },
  // ── Kasa & Banka ──
  { href: "/dashboard/hesaplar",         label: "Banka Hesapları", icon: Wallet,        group: "kasa" },
  { href: "/dashboard/nakit",            label: "Nakit",         icon: Banknote,        group: "kasa" },
  { href: "/dashboard/pos-cihazlari",    label: "POS",           icon: CreditCard,      group: "kasa" },
  { href: "/dashboard/pos-kar",          label: "POS Kâr",       icon: Sparkles,        group: "kasa" },
  { href: "/dashboard/operator-kasalari", label: "Operatör Kasaları", icon: Lock,       group: "kasa" },
  { href: "/dashboard/aylik-kar",        label: "Aylık Kâr",     icon: PieChart,        group: "kasa" },
  { href: "/dashboard/kapanislar",       label: "Kapanışlar",    icon: CalendarCheck,   group: "kasa" },
  { href: "/dashboard/gun-kapanisi",     label: "Gün Kapanışı",  icon: CalendarCheck,   group: "kasa" },
  { href: "/dashboard/banka-import",     label: "Banka İçe Aktar", icon: Landmark,      group: "kasa" },
  // ── Operasyon ──
  { href: "/dashboard/inventory",        label: "Envanter",      icon: Package,         group: "operasyon" },
  { href: "/dashboard/ayni-varlik",      label: "Ayni Varlık",   icon: Package,         group: "operasyon" },
  { href: "/dashboard/belge-tarama",     label: "Belge Tarama (OCR)", icon: ScanLine,   group: "operasyon" },
  { href: "/dashboard/documents",        label: "Belgeler",      icon: FolderOpen,      group: "operasyon" },
  { href: "/dashboard/kisiler",          label: "Kişiler",       icon: User,            group: "operasyon" },
  { href: "/dashboard/telefonlar",       label: "Telefonlar",    icon: Smartphone,      group: "operasyon" },
  { href: "/dashboard/vergi-takvimi",    label: "Vergi Takvimi", icon: Landmark,        group: "operasyon" },
  // ── Yönetim (yalnız admin) ──
  { href: "/dashboard/onaylar",          label: "Onay Kuyruğu",        icon: ClipboardCheck, group: "yonetim", adminOnly: true },
  { href: "/admin",                      label: "Admin Paneli",        icon: ShieldCheck, group: "yonetim", adminOnly: true },
  { href: "/admin/audit",                label: "Admin: Denetim Kaydı", icon: FileSearch, group: "yonetim", adminOnly: true },
  { href: "/admin/debt-migration",       label: "Admin: Borç Taşıma",  icon: History,     group: "yonetim", adminOnly: true },
  { href: "/admin/my-companies",         label: "Admin: Şirketlerim",  icon: Building2,   group: "yonetim", adminOnly: true },
  { href: "/admin/recurring",            label: "Admin: Tekrarlayan",  icon: Repeat,      group: "yonetim", adminOnly: true },
  { href: "/dashboard/pos-cihazlari/yonetim", label: "Admin: POS Yönetim", icon: CreditCard, group: "yonetim", adminOnly: true },
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

  const role = profile?.role;
  const isSearching = query.trim() !== "";

  // Role'e göre erişilebilir tüm item'lar (route/erişim KORUNUR — adminOnly filtre aynı).
  const accessible = useMemo(
    () => ALL_LINKS.filter((l) => !l.adminOnly || role === "admin"),
    [role],
  );

  // ARAMA modu: düz filtrelenmiş liste (grup başlıkları gürültü yapmasın).
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = query.trim().toLocaleLowerCase("tr");
    return accessible.filter((l) => l.label.toLocaleLowerCase("tr").includes(q));
  }, [accessible, query, isSearching]);

  // GRUPLU mod: pinli'ler üstte ayrı küme + GROUP_ORDER'a göre bölümler.
  const pinned = useMemo(
    () => accessible
      .filter((l) => shortcutPins[l.href])
      .sort((a, b) => shortcutPins[a.href] - shortcutPins[b.href]),
    [accessible, shortcutPins],
  );
  const groupedSections = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      ...g,
      // pinli olanlar yukarıda gösterildiği için gruptan düşürülür (tekrar yok).
      items: accessible.filter((l) => l.group === g.key && !shortcutPins[l.href]),
    })).filter((s) => s.items.length > 0);
  }, [accessible, shortcutPins]);

  // 10+ erişilebilir item varsa arama görünür (eskisiyle aynı eşik).
  const showSearch = accessible.length >= SEARCH_THRESHOLD || isSearching;
  const hasAny = isSearching ? searchResults.length > 0 : accessible.length > 0;
  // v1.7.x BETA: semantic versiyon yerine sabit etiket. Beta sonrası
  // formatVersion(process.env.NEXT_PUBLIC_APP_VERSION) geri açılacak.
  const versionLabel = BETA_LABEL;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Menüyü kapat"
          onClick={() => onMobileOpenChange(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "v2-sidebar fixed top-0 left-0 z-50 h-[100dvh] w-60 transition-transform duration-200 ease-out",
          // mobile/tablet (<lg): hamburger ile aç-kapat
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // desktop (≥lg): her zaman sabit
          "lg:translate-x-0",
        )}
        aria-label="Yan menü"
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header — logo + marka adı + version badge (herkes görür) */}
          <div className="flex items-center justify-between px-4 py-4 shrink-0 v2-sidebar-divider">
            <Link
              href="/dashboard"
              onClick={() => onMobileOpenChange(false)}
              className="group flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              aria-label="ÇATI ana sayfa"
            >
              {/* Daxa logo plakası: katmanlı ink zemin + accent harf + iç ring.
                  Aksan noktası "çatı" metaforu (ev/şirket) hissini verir. */}
              <span className="v2-logo-tile relative w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5">
                <span className="font-extrabold text-lg leading-none -tracking-[0.02em]">Ç</span>
                {/* Sağ-üst accent nokta (Daxa imza işareti). */}
                <span className="v2-logo-dot absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" aria-hidden="true" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="font-extrabold text-[18px] tracking-tight text-[rgb(var(--v2-ink))] leading-none">ÇATI</span>
                {versionLabel && (
                  <span
                    className="v2-logo-beta mt-1.5 inline-flex items-center self-start px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase leading-none tracking-[0.08em]"
                    title="Beta sürümü"
                  >
                    {versionLabel}
                  </span>
                )}
              </span>
            </Link>
            {/* Mobile-only kapatma */}
            <button
              type="button"
              onClick={() => onMobileOpenChange(false)}
              className="v2-icon-btn !p-2 lg:hidden"
              aria-label="Kapat"
            >
              <X size={16} />
            </button>
          </div>

          {/* Search (10+ items'da aktif) */}
          {showSearch && (
            <div className="px-3 pt-3 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ara..."
                  className="w-full py-2 pl-8 pr-3 text-sm rounded-xl v2-sunken text-[rgb(var(--body-text))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
          )}

          {/* Items — GRUPLU bölümler (arama modunda düz liste) */}
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            {!hasAny ? (
              <p className="px-3 py-4 text-xs text-[rgb(var(--v2-muted))] text-center">
                {isSearching ? "Eşleşen kısayol yok" : "Kısayol yok"}
              </p>
            ) : isSearching ? (
              /* Arama: düz filtrelenmiş sonuç (grup başlığı yok). */
              <ul className="space-y-0.5">
                {searchResults.map((item) => (
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
            ) : (
              <>
                {/* İşletmeler dropdown EN ÜSTTE (pinli/alfabetik kendi içinde). */}
                <SidebarBusinessesSection
                  currentPath={pathname || ""}
                  onItemClick={() => onMobileOpenChange(false)}
                />

                {/* Sabitlenenler (pin) — gruplu yapının üstünde ayrı küme. */}
                {pinned.length > 0 && (
                  <NavSection title="Sabitlenenler">
                    {pinned.map((item) => (
                      <SidebarItem
                        key={item.href}
                        item={item}
                        active={pathname === item.href}
                        pinned
                        onTogglePin={() => toggleShortcutPin(item.href)}
                        onClick={() => onMobileOpenChange(false)}
                      />
                    ))}
                  </NavSection>
                )}

                {/* Curated gruplar */}
                {groupedSections.map((section) => (
                  <NavSection key={section.key} title={section.label}>
                    {section.items.map((item) => (
                      <SidebarItem
                        key={item.href}
                        item={item}
                        active={pathname === item.href}
                        pinned={false}
                        onTogglePin={() => toggleShortcutPin(item.href)}
                        onClick={() => onMobileOpenChange(false)}
                      />
                    ))}
                  </NavSection>
                ))}
              </>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}

/** Gruplu bölüm: küçük büyük-harf başlık + item listesi. */
function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="px-3 mb-1.5 v2-eyebrow">{title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
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
    <div className={cn("v2-nav-item group relative flex items-stretch", active && "v2-nav-active")}>
      {/* Daxa nav-rail: sol kenarda dikey accent çubuk (aktifte görünür). */}
      <span
        className="v2-nav-rail absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full"
        aria-hidden="true"
      />
      <Link
        href={item.href}
        onClick={onClick}
        className={cn(
          "v2-nav-link flex items-center gap-3 px-3 py-2.5 rounded-l-xl text-sm transition-colors flex-1 min-w-0",
          !active && "v2-nav-hover",
        )}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={18} className={cn("shrink-0", active ? "text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent))]" : "text-[rgb(var(--v2-muted))]")} />
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
            "shrink-0 px-2 rounded-r-xl flex items-center justify-center transition-all",
            pinned
              ? "text-[rgb(var(--accent-strong))] dark:text-[rgb(var(--accent))]"
              : "text-[rgb(var(--v2-muted))] opacity-0 group-hover:opacity-100 hover:text-[rgb(var(--v2-ink))]",
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

