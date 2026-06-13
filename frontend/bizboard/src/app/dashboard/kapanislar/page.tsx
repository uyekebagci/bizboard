"use client";

/**
 * v1.6.19 (WP-2): Kapanış arşivi.
 *
 * - Üstte: bugünün durumu (preview kart) + "Günü Kapat" butonu (kapatılmamışsa)
 * - Altta: paginated geçmiş — tarih + status + computed + actual + difference
 * - Admin: kapanmış bir gün için ⋮ aksiyonu ile "Yeniden aç" (TODO: v2)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, CalendarCheck, Lock, AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useCashClosing } from "@/hooks/useCashClosing";
import { CloseTodayModal } from "@/components/closing/CloseTodayModal";
import { formatCurrency, cn } from "@/lib/utils";
import type { CashClosing } from "@/types";

export default function KapanislarPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  // v1.6.23.21 (Security WP): cash closing artık tenant-scoped — kullanıcının
  // ilk erişebildiği işletmeyi default kabul ediyoruz. Multi-tenant UI'da
  // business selector eklenmesi gerek (TODO).
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;
  const {
    preview, today,
    closings, page, hasNext, totalElements,
    loading, error,
    list, refresh,
  } = useCashClosing(businessId);
  const [showCloseModal, setShowCloseModal] = useState(false);

  useEffect(() => { void list(0, 50); }, [list]);

  const todayClosed = today?.status === "CLOSED";

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="v2-icon-btn v2-press"
          aria-label="Geri"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="v2-display text-xl">Günlük Kapanışlar</h1>
          <p className="text-xs text-[rgb(var(--v2-muted))]">Kasa kapanış geçmişi + bugünün durumu</p>
        </div>
      </div>

      {/* Today preview / actions */}
      {preview && (
        <section className={cn(
          "v2-card p-4",
          !todayClosed && "border-status-warning/30 bg-status-warning/5",
          todayClosed && "border-accent/20 bg-accent/5",
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {todayClosed ? (
                  <Lock size={14} className="text-accent-strong dark:text-accent" />
                ) : (
                  <CalendarCheck size={14} className="text-status-warning" />
                )}
                <h2 className="text-sm font-semibold text-[rgb(var(--v2-ink))]">
                  {todayClosed ? "Bugün Kapatıldı" : "Bugün Henüz Kapatılmadı"}
                </h2>
                {today?.is_auto && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full v2-sunken text-[rgb(var(--v2-muted))]">
                    OTO
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-[rgb(var(--v2-ink))]">
                {formatCurrency(preview.computed_closing, "TRY")}
              </p>
              <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
                Açılış {formatCurrency(preview.opening_balance, "TRY")}
                {" · Net akış "}
                {preview.net_flow >= 0 ? "+" : ""}{formatCurrency(preview.net_flow, "TRY")}
              </p>
              {todayClosed && today?.difference != null && today.difference !== 0 && (
                <p className={cn(
                  "mt-2 text-xs font-medium",
                  today.difference < 0 ? "text-status-danger" : "text-accent-strong dark:text-accent",
                )}>
                  Fark: {today.difference > 0 ? "+" : ""}{formatCurrency(today.difference, "TRY")}
                  {today.reason_category && (
                    <span className="text-[rgb(var(--v2-muted))]"> ({today.reason_category})</span>
                  )}
                </p>
              )}
            </div>
            {!todayClosed && (
              <button
                onClick={() => setShowCloseModal(true)}
                className="v2-btn v2-btn--accent v2-press text-sm shrink-0"
              >
                Günü Kapat
              </button>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">
          {error}
        </div>
      )}

      {/* Archive list */}
      {loading && closings.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : closings.length === 0 ? (
        <div className="v2-card p-8 text-center">
          <CalendarCheck size={32} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-[rgb(var(--v2-ink))] font-medium">Geçmiş kapanış kaydı yok</p>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[rgb(var(--v2-muted))]">
              <span>Toplam {totalElements} kayıt</span>
            </div>
            <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
              {closings.map((c) => <ClosingRow key={c.id} closing={c} isAdmin={profile?.role === "admin"} />)}
            </div>
          </section>

          {/* Pagination */}
          {(page > 0 || hasNext) && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => list(page - 1, 50)}
                disabled={page === 0 || loading}
                className="v2-icon-btn v2-press disabled:opacity-40"
                aria-label="Önceki sayfa"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-[rgb(var(--v2-muted))]">Sayfa {page + 1}</span>
              <button
                onClick={() => list(page + 1, 50)}
                disabled={!hasNext || loading}
                className="v2-icon-btn v2-press disabled:opacity-40"
                aria-label="Sonraki sayfa"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {showCloseModal && preview && businessId && (
        <CloseTodayModal
          preview={preview}
          businessId={businessId}
          onClose={() => setShowCloseModal(false)}
          onClosed={() => { void refresh(); void list(0, 50); }}
        />
      )}
    </div>
  );
}

function ClosingRow({ closing, isAdmin }: { closing: CashClosing; isAdmin: boolean }) {
  const diff = closing.difference;
  return (
    <div className="p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[rgb(var(--v2-ink))]">
            {new Date(closing.closing_date).toLocaleDateString("tr-TR", {
              day: "numeric", month: "long", year: "numeric", weekday: "short",
            })}
          </p>
          <StatusBadge status={closing.status} isAuto={closing.is_auto} />
        </div>
        <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
          Hesaplanan {formatCurrency(closing.computed_closing, "TRY")}
          {closing.actual_balance != null && (
            <> · Sayım {formatCurrency(closing.actual_balance, "TRY")}</>
          )}
        </p>
        {closing.reason_category && (
          <p className="text-[11px] text-status-warning mt-0.5">
            <AlertCircle size={10} className="inline mr-1" />
            {closing.reason_category}
            {closing.reason_note && <span className="text-[rgb(var(--v2-muted))]"> — {closing.reason_note.slice(0, 80)}</span>}
          </p>
        )}
      </div>
      {diff != null && diff !== 0 && (
        <span className={cn(
          "text-sm font-semibold shrink-0",
          diff < 0 ? "text-status-danger" : "text-accent-strong dark:text-accent",
        )}>
          {diff > 0 ? "+" : ""}{formatCurrency(diff, "TRY")}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status, isAuto }: { status: string; isAuto: boolean }) {
  const cls = status === "CLOSED"
    ? "bg-accent/15 text-accent-strong dark:text-accent border-accent/30"
    : status === "REOPENED"
    ? "bg-status-warning/15 text-status-warning border-status-warning/30"
    : "v2-sunken text-[rgb(var(--v2-muted))]";
  const label = status === "CLOSED"
    ? (isAuto ? "OTO KAPALI" : "KAPALI")
    : status === "REOPENED" ? "YENİDEN AÇILDI" : "BEKLİYOR";
  return (
    <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border", cls)}>
      {label}
    </span>
  );
}
