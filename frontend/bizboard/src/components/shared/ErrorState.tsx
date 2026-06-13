"use client";

/**
 * UX-08 — Paylaşılan hata-durumu (ErrorState).
 *
 * Ağ/yükleme hatasında boş-durumdan AYRI bir görünüm: "Veri yüklenemedi —
 * Tekrar dene". Eskiden `.catch(() => [])` ile hata sessizce yutuluyor, kullanıcı
 * "hata mı, gerçekten boş mu" ayırt edemiyordu. Daxa v2 dili, çift tema.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  /** Ana mesaj. Varsayılan "Veri yüklenemedi". */
  title?: string;
  /** Açıklama (opsiyonel). */
  description?: ReactNode;
  /** "Tekrar dene" callback'i. Verilirse buton görünür. */
  onRetry?: () => void;
  /** Tekrar-dene butonu metni. Varsayılan "Tekrar dene". */
  retryLabel?: string;
  /** Yeniden deneme sürüyor mu (buton disable + spinner). */
  retrying?: boolean;
  /** Kart sarmalayıcısız render. Varsayılan false. */
  bare?: boolean;
  /** Ek sınıf. */
  className?: string;
}

export function ErrorState({
  title = "Veri yüklenemedi",
  description = "Bağlantı veya sunucu kaynaklı bir sorun oldu. Lütfen tekrar deneyin.",
  onRetry,
  retryLabel = "Tekrar dene",
  retrying = false,
  bare = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(bare ? "text-center" : "v2-card p-8 text-center", className)}
    >
      <AlertTriangle
        size={32}
        aria-hidden="true"
        className="mx-auto text-status-danger mb-2"
      />
      <p className="text-[rgb(var(--v2-ink))] font-medium">{title}</p>
      {description && (
        <p className="text-[rgb(var(--v2-muted))] text-sm mt-1 max-w-md mx-auto">
          {description}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="v2-btn v2-btn--ink v2-press mt-3 inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={retrying ? "animate-spin" : undefined}
          />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export default ErrorState;
