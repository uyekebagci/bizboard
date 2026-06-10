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
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-surface-100">Günlük Kapanışlar</h1>
          <p className="text-xs text-surface-400">Kasa kapanış geçmişi + bugünün durumu</p>
        </div>
      </div>

      {/* Today preview / actions */}
      {preview && (
        <section className={cn(
          "card p-4 border",
          !todayClosed && "border-amber-500/30 bg-amber-500/5",
          todayClosed && "border-emerald-500/20 bg-emerald-500/5",
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {todayClosed ? (
                  <Lock size={14} className="text-emerald-400" />
                ) : (
                  <CalendarCheck size={14} className="text-amber-400" />
                )}
                <h2 className="text-sm font-semibold text-surface-100">
                  {todayClosed ? "Bugün Kapatıldı" : "Bugün Henüz Kapatılmadı"}
                </h2>
                {today?.is_auto && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-300 border border-surface-600">
                    OTO
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-surface-100">
                {formatCurrency(preview.computed_closing, "TRY")}
              </p>
              <p className="text-[11px] text-surface-400 mt-0.5">
                Açılış {formatCurrency(preview.opening_balance, "TRY")}
                {" · Net akış "}
                {preview.net_flow >= 0 ? "+" : ""}{formatCurrency(preview.net_flow, "TRY")}
              </p>
              {todayClosed && today?.difference != null && today.difference !== 0 && (
                <p className={cn(
                  "mt-2 text-xs font-medium",
                  today.difference < 0 ? "text-red-400" : "text-emerald-400",
                )}>
                  Fark: {today.difference > 0 ? "+" : ""}{formatCurrency(today.difference, "TRY")}
                  {today.reason_category && (
                    <span className="text-surface-400"> ({today.reason_category})</span>
                  )}
                </p>
              )}
            </div>
            {!todayClosed && (
              <button
                onClick={() => setShowCloseModal(true)}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors shrink-0"
              >
                Günü Kapat
              </button>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Archive list */}
      {loading && closings.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : closings.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CalendarCheck size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Geçmiş kapanış kaydı yok</p>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs text-surface-400">
              <span>Toplam {totalElements} kayıt</span>
            </div>
            <div className="glass-card divide-y divide-surface-700">
              {closings.map((c) => <ClosingRow key={c.id} closing={c} isAdmin={profile?.role === "admin"} />)}
            </div>
          </section>

          {/* Pagination */}
          {(page > 0 || hasNext) && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => list(page - 1, 50)}
                disabled={page === 0 || loading}
                className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-40 text-surface-300"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-surface-400">Sayfa {page + 1}</span>
              <button
                onClick={() => list(page + 1, 50)}
                disabled={!hasNext || loading}
                className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-40 text-surface-300"
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
          <p className="text-sm font-medium text-surface-100">
            {new Date(closing.closing_date).toLocaleDateString("tr-TR", {
              day: "numeric", month: "long", year: "numeric", weekday: "short",
            })}
          </p>
          <StatusBadge status={closing.status} isAuto={closing.is_auto} />
        </div>
        <p className="text-[11px] text-surface-400 mt-0.5">
          Hesaplanan {formatCurrency(closing.computed_closing, "TRY")}
          {closing.actual_balance != null && (
            <> · Sayım {formatCurrency(closing.actual_balance, "TRY")}</>
          )}
        </p>
        {closing.reason_category && (
          <p className="text-[11px] text-amber-300 mt-0.5">
            <AlertCircle size={10} className="inline mr-1" />
            {closing.reason_category}
            {closing.reason_note && <span className="text-surface-400"> — {closing.reason_note.slice(0, 80)}</span>}
          </p>
        )}
      </div>
      {diff != null && diff !== 0 && (
        <span className={cn(
          "text-sm font-semibold shrink-0",
          diff < 0 ? "text-red-400" : "text-emerald-400",
        )}>
          {diff > 0 ? "+" : ""}{formatCurrency(diff, "TRY")}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status, isAuto }: { status: string; isAuto: boolean }) {
  const cls = status === "CLOSED"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : status === "REOPENED"
    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
    : "bg-surface-700 text-surface-300 border-surface-600";
  const label = status === "CLOSED"
    ? (isAuto ? "OTO KAPALI" : "KAPALI")
    : status === "REOPENED" ? "YENİDEN AÇILDI" : "BEKLİYOR";
  return (
    <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border", cls)}>
      {label}
    </span>
  );
}
