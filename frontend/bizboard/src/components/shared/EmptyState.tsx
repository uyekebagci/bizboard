"use client";

/**
 * UX-06 — Paylaşılan boş-durum (EmptyState).
 *
 * 30+ sayfada kopyalanan `v2-card p-8 text-center + icon + metin` desenini
 * tek bileşende toplar; metinleri TR-tutarlı kılar. Daxa v2 dili, çift tema.
 *
 * Kullanım:
 *   <EmptyState icon={HandCoins} title="Açık alacağınız yok"
 *     description="..." action={<button .../>} />
 *
 * `bare` → kart sarmalayıcı olmadan (zaten bir kart içindeyken).
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Üstteki ikon (opsiyonel ama önerilir). */
  icon?: LucideIcon;
  /** Ana mesaj (zorunlu). */
  title: string;
  /** Açıklama / ikincil metin (opsiyonel). */
  description?: ReactNode;
  /** Aksiyon — CTA buton(lar)ı (opsiyonel). */
  action?: ReactNode;
  /** Kart sarmalayıcısız render (zaten kart içindeyse). Varsayılan false. */
  bare?: boolean;
  /** Dikey boşluk varyantı. Varsayılan `md`. */
  size?: "sm" | "md";
  /** Ek sınıf. */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bare = false,
  size = "md",
  className,
}: EmptyStateProps) {
  const pad = size === "sm" ? "p-6" : "p-8";
  return (
    <div className={cn(bare ? "text-center" : `v2-card ${pad} text-center`, className)}>
      {Icon && (
        <Icon
          size={32}
          aria-hidden="true"
          className="mx-auto text-[rgb(var(--v2-muted))] mb-2"
        />
      )}
      <p className="text-[rgb(var(--v2-ink))] font-medium">{title}</p>
      {description && (
        <p className="text-[rgb(var(--v2-muted))] text-sm mt-1 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-3 flex items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
