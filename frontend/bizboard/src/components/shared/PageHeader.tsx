"use client";

/**
 * UX-07 / UX-09 — Paylaşılan sayfa başlığı (PageHeader).
 *
 * 30+ sayfada kopyalanan "geri-buton + ikon + başlık + alt-başlık + sağ aksiyon"
 * desenini tek bileşende toplar (drift/tutarsızlık giderme). Daxa v2 dili:
 * `v2-icon-btn` geri butonu, `v2-display` başlık, `--v2-muted` alt-başlık.
 * Çift tema token-tabanlı; ham renk kullanmaz.
 *
 * Akıllı geri (UX-09): `onBack` verilmezse, tarayıcı geçmişi varsa `router.back()`,
 * yoksa `fallbackHref` (varsayılan `/dashboard`) — derin-link/bildirimle gelen
 * kullanıcı beklenmedik yere düşmez.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Ana başlık (zorunlu). */
  title: string;
  /** Alt-başlık / açıklama (opsiyonel). */
  subtitle?: ReactNode;
  /** Başlık yanındaki ikon (opsiyonel) — kutu içinde tonlu zeminde. */
  icon?: LucideIcon;
  /** İkon kutusunun tint sınıfı (zemin + border + metin). Varsayılan accent. */
  iconClassName?: string;
  /** Geri butonunu göster (varsayılan true). false → ana sayfalarda gizle. */
  showBack?: boolean;
  /** Özel geri davranışı. Verilmezse akıllı default (geçmiş varsa back, yoksa fallback). */
  onBack?: () => void;
  /** Akıllı geri için fallback rota (geçmiş yoksa). Varsayılan `/dashboard`. */
  fallbackHref?: string;
  /** Sağ taraftaki aksiyon(lar) — buton vb. */
  actions?: ReactNode;
  /** Başlık boyutu — yoğun sayfalar için `sm`. Varsayılan `md` (text-xl). */
  size?: "sm" | "md" | "lg";
  /** Ek sınıf (kapsayıcı). */
  className?: string;
}

const TITLE_SIZE: Record<NonNullable<PageHeaderProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
};

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconClassName = "bg-accent/15 border-accent/30 text-accent-strong dark:text-accent",
  showBack = true,
  onBack,
  fallbackHref = "/dashboard",
  actions,
  size = "md",
  className,
}: PageHeaderProps) {
  const router = useRouter();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    // UX-09 akıllı geri: geçmiş varsa geri dön, yoksa mantıklı parent rotaya git.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="v2-icon-btn v2-press shrink-0 mt-0.5"
            aria-label="Geri"
            title="Geri"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        )}
        {Icon && (
          <div
            className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
              iconClassName,
            )}
          >
            <Icon size={20} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className={cn("v2-display", TITLE_SIZE[size])}>{title}</h1>
          {subtitle && (
            <p className="text-xs text-[rgb(var(--v2-muted))] mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export default PageHeader;
