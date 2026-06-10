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
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <FileText size={20} className="text-purple-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-100">Çekler</h1>
            <p className="text-xs text-surface-400">Yaklaşan vadeler (açık çekler)</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
        >
          <Plus size={16} />
          Çek Ekle
        </button>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Toplam</p>
          <p className="mt-1 text-lg font-bold text-purple-300">{formatCurrency(total, "TRY")}</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Kayıt</p>
          <p className="mt-1 text-lg font-bold text-surface-100">{list.length}</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[10px] text-surface-400 uppercase">Vadesi Geçen</p>
          <p className={cn("mt-1 text-lg font-bold", overdue.length > 0 ? "text-red-300" : "text-surface-400")}>
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
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              days === d
                ? "bg-purple-500/20 border-purple-400 text-purple-200"
                : "bg-surface-700 border-surface-600 text-surface-300",
            )}
          >
            {d} gun
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-purple-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CalendarClock size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">
            {days} gün içinde vadeli çek yok
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
          >
            <Plus size={16} />
            Çek Ekle
          </button>
        </div>
      ) : (
        <section className="glass-card divide-y divide-surface-700">
          {list.map((c) => {
            const dueStr = c.cheque_due_date;
            const isOverdue = dueStr && dueStr < today;
            return (
              <div key={c.id} className={cn(
                "p-4 flex items-start justify-between gap-3",
                isOverdue && "bg-red-500/5",
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-surface-100 truncate">
                      {c.counterparty}
                    </p>
                    {isOverdue && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                        Geçti
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-surface-400 mt-0.5">
                    {dueStr && (
                      <>
                        Vade {new Date(dueStr).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                      </>
                    )}
                    {c.cheque_collector_bank && <> · {c.cheque_collector_bank}</>}
                    {c.cheque_no && <> · #{c.cheque_no}</>}
                  </p>
                  {c.description && (
                    <p className="text-[11px] text-surface-400 mt-1 truncate">{c.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                  <p className={cn(
                    "text-sm font-semibold",
                    isOverdue ? "text-red-300" : "text-purple-300",
                  )}>
                    {formatCurrency(c.amount, c.currency || "TRY")}
                  </p>
                  <button
                    onClick={() => handleSettle(c)}
                    disabled={busyId === c.id}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 disabled:opacity-50"
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
