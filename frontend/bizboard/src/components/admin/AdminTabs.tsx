"use client";

/**
 * Admin Paneli — Daxa sekme şeridi (segment/pill nav).
 *
 * <p>Önceki tasarım: 7 adet `btn-secondary` link + amber "Yeni Kullanıcı"
 * butonu kart başlığında tek satırda sıkışıyordu (sığmıyor, düzensiz). Bu
 * bileşen, admin alt-sayfalarını tek-tip Daxa segment şeridine çevirir:
 * `v2-sunken` zemin, eşit boşluk, taşmada yatay-scroll (no-scrollbar), aktif
 * sekme accent (lime). "Yeni Kullanıcı" SEKME DEĞİL → ayrı accent aksiyon
 * butonu (sağda, page tarafından render edilir).</p>
 *
 * <p>Salt görsel — route'lar/erişim (Sidebar adminOnly + sayfa-içi guard)
 * değişmedi. Çift tema + a11y (aria-current, focus ring, klavye).</p>
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Building2,
  ArrowLeftRight,
  Repeat,
  ScrollText,
  Send,
  BellRing,
  PieChart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Admin sekmeleri — sıra kullanıcının belirttiği şeritle aynı. */
const ADMIN_TABS: AdminTab[] = [
  { href: "/admin", label: "Kullanıcılar", icon: Users },
  { href: "/admin/my-companies", label: "Firmalarım", icon: Building2 },
  { href: "/admin/debt-migration", label: "Borç Migration", icon: ArrowLeftRight },
  { href: "/admin/recurring", label: "Recurring", icon: Repeat },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/telegram", label: "Telegram", icon: Send },
  { href: "/admin/financial-alerts", label: "Finansal Alarmlar", icon: BellRing },
  { href: "/admin/profit-share", label: "Kâr-Payı", icon: PieChart },
];

/**
 * "/admin" tam eşleşme ister (yoksa tüm alt-route'larda aktif görünürdü);
 * alt-sayfalar prefix eşleşmesiyle aktif olur (ör. /admin/telegram/manual-send
 * → Telegram sekmesi).
 */
function isTabActive(tabHref: string, pathname: string): boolean {
  if (tabHref === "/admin") return pathname === "/admin";
  return pathname === tabHref || pathname.startsWith(`${tabHref}/`);
}

export function AdminTabs({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sekmeleri"
      className={cn(
        "v2-sunken flex items-center gap-1 p-1 rounded-2xl overflow-x-auto no-scrollbar",
        className,
      )}
    >
      {ADMIN_TABS.map(({ href, label, icon: Icon }) => {
        const active = isTabActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              active
                ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold shadow-sm"
                : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))] hover:bg-[rgb(var(--v2-card))]",
            )}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default AdminTabs;
