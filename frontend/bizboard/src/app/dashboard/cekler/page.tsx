"use client";

/**
 * v1.6.22 (WP-5): Yaklaşan çekler sayfası.
 *
 * Veri: GET /cheques?from=&to= (default bugün → bugün + 30 gün)
 *
 * Sütunlar: vade, tutar, kimden/kime, tahsil bankası, çek no, durum.
 * Sort: vade ASC. Filtre: kalan gün <= N (chip'ler 7/15/30/60). Aksiyon:
 * "Tahsil edildi" (settle) butonu — PATCH /debts/{id}/settle.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, CalendarClock, Check, AlertTriangle, FileText, Plus,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { Debt } from "@/types";
import { ChequeAddModal } from "@/components/cheques/ChequeAddModal";

export default function ChequesPage() {
  const router = useRouter();
  const { refreshKey, triggerRefresh } = useAppStore();
  const [list, setList] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  async function refresh(targetDays: number) {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + targetDays * 86400_000).toISOString().slice(0, 10);
      const r = await api.get<Debt[]>(`/cheques?from=${today}&to=${to}`);
      setList(r || []);
      setError(null);
    } catch (err) {
      logger.error("api", "cheques fetch failed", undefined, err);
      setError("Çek listesi yuklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(days); }, [days, refreshKey]);

  async function handleSettle(d: Debt) {
    setBusyId(d.id);
    try {
      await api.patch(`/debts/${d.id}/settle`, {});
      await refresh(days);
      // BUG fix: consolidated dashboard alacaklar/verecekler widget'ları
      // bu mutation'dan haberdar olsun.
      triggerRefresh();
      toast.success("Çek kapatıldı");
    } catch (err) {
      logger.error("api", "cheque settle failed", { id: d.id }, err);
      toast.error(err);
    } finally {
      setBusyId(null);
    }
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const total = list.reduce((a, x) => a + (x.amount || 0), 0);
  const overdue = list.filter((c) => c.cheque_due_date && c.cheque_due_date < today);

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
        <div className="flex items-center gap-2 flex-1">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
            <FileText size={20} className="text-accent-strong dark:text-accent" />
          </div>
          <div>
            <h1 className="v2-display text-xl">Çekler</h1>
            <p className="text-xs text-[rgb(var(--v2-muted))]">Yaklaşan vadeler (açık çekler)</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="v2-btn v2-btn--ink v2-press flex items-center gap-1.5"
        >
          <Plus size={16} />
          Çek Ekle
        </button>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Toplam</p>
          <p className="mt-1 text-lg font-bold num text-[rgb(var(--v2-ink))]">{formatCurrency(total, "TRY")}</p>
        </div>
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Kayıt</p>
          <p className="mt-1 text-lg font-bold text-[rgb(var(--v2-ink))]">{list.length}</p>
        </div>
        <div className="v2-card p-3">
          <p className="v2-eyebrow text-[10px]">Vadesi Geçen</p>
          <p className={cn("mt-1 text-lg font-bold", overdue.length > 0 ? "text-status-danger" : "text-[rgb(var(--v2-muted))]")}>
            {overdue.length}
          </p>
        </div>
      </section>

      {/* Filter chips */}
      <div className="flex gap-2">
        {[7, 15, 30, 60].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              days === d
                ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                : "v2-sunken text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]",
            )}
          >
            {d} gun
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-accent-strong dark:text-accent" />
        </div>
      ) : list.length === 0 ? (
        <div className="v2-card p-8 text-center">
          <CalendarClock size={32} className="mx-auto text-[rgb(var(--v2-muted))] mb-2" />
          <p className="text-[rgb(var(--v2-ink))] font-medium">
            {days} gün içinde vadeli çek yok
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-3 v2-btn v2-btn--ink v2-press inline-flex items-center gap-1.5"
          >
            <Plus size={16} />
            Çek Ekle
          </button>
        </div>
      ) : (
        <section className="v2-card divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
          {list.map((c) => {
            const dueStr = c.cheque_due_date;
            const isOverdue = dueStr && dueStr < today;
            return (
              <div key={c.id} className={cn(
                "p-4 flex items-start justify-between gap-3",
                isOverdue && "bg-status-danger/5",
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate">
                      {c.counterparty}
                    </p>
                    {isOverdue && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-status-danger/15 text-status-danger">
                        Geçti
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
                    {dueStr && (
                      <>
                        Vade {new Date(dueStr).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                      </>
                    )}
                    {c.cheque_collector_bank && <> · {c.cheque_collector_bank}</>}
                    {c.cheque_no && <> · #{c.cheque_no}</>}
                  </p>
                  {c.description && (
                    <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-1 truncate">{c.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                  <p className={cn(
                    "text-sm font-semibold num",
                    isOverdue ? "text-status-danger" : "text-[rgb(var(--v2-ink))]",
                  )}>
                    {formatCurrency(c.amount, c.currency || "TRY")}
                  </p>
                  <button
                    onClick={() => handleSettle(c)}
                    disabled={busyId === c.id}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-accent/15 text-accent-strong dark:text-accent hover:bg-accent/25 border border-accent/30 disabled:opacity-50 v2-press"
                  >
                    {busyId === c.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Check size={10} />
                    )}
                    Tahsil edildi
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* v1.7.x: + Çek Ekle modal */}
      {showAddModal && (
        <ChequeAddModal
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
