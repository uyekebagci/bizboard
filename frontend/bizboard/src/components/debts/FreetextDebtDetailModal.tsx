"use client";

/**
 * FreetextDebtDetailModal — counterpart_id olmayan (serbest metin) alacak satırları için
 * detay + silme modalı.
 *
 * Trigger: Alacaklar sayfasında counterpart_id = null olan bir satıra tıklanması.
 * Veri: GET /debts → counterparty adıyla + RECEIVABLE direction'ıyla + settled=false filtresi.
 * Aksiyon: her kayıt için Sil (DELETE /debts/{id} + onay adımı).
 */

import { useEffect, useState } from "react";
import { X, Trash2, CalendarClock, HandCoins, Loader2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/lib/store";
import type { Debt } from "@/types";

interface Props {
  counterpartName: string;
  onClose: () => void;
}

export function FreetextDebtDetailModal({ counterpartName, onClose }: Props) {
  const { triggerRefresh } = useAppStore();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Debt | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchDebts() {
    setLoading(true);
    setLoadError(false);
    try {
      const all = await api.get<Debt[]>("/debts");
      const filtered = (all || []).filter(
        (d) =>
          !d.counterpart_id &&
          d.direction === "RECEIVABLE" &&
          !d.is_settled &&
          (d.counterparty || "").trim().toLowerCase() ===
            counterpartName.trim().toLowerCase(),
      );
      setDebts(filtered);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDebts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterpartName]);

  async function handleDelete(debt: Debt) {
    setDeleting(true);
    try {
      await api.delete(`/debts/${debt.id}`);
      toast.info("Kayıt silindi");
      setDeleteConfirm(null);
      triggerRefresh();
      // Listeyi local olarak güncelle; modalı açık tut (birden çok kayıt olabilir).
      setDebts((prev) => prev.filter((d) => d.id !== debt.id));
    } catch (err) {
      toast.error(err);
    } finally {
      setDeleting(false);
    }
  }

  const typeLabel: Record<string, string> = {
    SENET: "Senet",
    CEK: "Çek",
    ALTIN: "Altın",
    NAKIT: "Nakit",
    DIGER: "Diğer",
  };

  return (
    <>
      {/* Ana modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`${counterpartName} alacak detayı`}
      >
        <div
          className="v2-card w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Başlık */}
          <div className="modal-header">
            <h3 className="modal-title flex items-center gap-2">
              <HandCoins size={16} className="text-amber-700 dark:text-amber-300" />
              <span className="truncate max-w-[280px]" title={counterpartName}>
                {counterpartName}
              </span>
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
              aria-label="Kapat"
            >
              <X size={16} />
            </button>
          </div>

          {/* İçerik */}
          <div className="overflow-y-auto flex-1 p-4">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-[rgb(var(--v2-muted))]" />
              </div>
            ) : loadError ? (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>Kayıtlar yüklenemedi. Lütfen tekrar deneyin.</span>
              </div>
            ) : debts.length === 0 ? (
              <p className="text-center text-sm text-[rgb(var(--v2-muted))] py-8">
                Bu kişiye ait açık alacak kaydı bulunamadı.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[rgb(var(--v2-muted))] mb-3">
                  {debts.length} açık kayıt
                </p>
                {debts.map((debt) => (
                  <div
                    key={debt.id}
                    className="v2-sunken rounded-xl p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-status-warning/10 border-status-warning/30 text-status-warning">
                          {typeLabel[debt.receivable_type ?? ""] ||
                            debt.receivable_type_other ||
                            debt.instrument_type ||
                            "Belirtilmemiş"}
                        </span>
                        {debt.due_date && (
                          <span className="flex items-center gap-1 text-[11px] text-[rgb(var(--v2-muted))]">
                            <CalendarClock size={11} />
                            {new Date(debt.due_date).toLocaleDateString("tr-TR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                      {debt.description && (
                        <p className="mt-1.5 text-xs text-[rgb(var(--v2-muted))] truncate">
                          {debt.description}
                        </p>
                      )}
                      {debt.created_by_name && (
                        <p className="mt-0.5 text-[11px] text-[rgb(var(--v2-muted))]">
                          Ekleyen: {debt.created_by_name}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <p className="text-sm font-semibold text-status-warning whitespace-nowrap">
                        {formatCurrency(debt.amount, debt.currency as "TRY" | "USD" | "GOLD")}
                      </p>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(debt)}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors",
                          "hover:bg-red-500/15 text-red-600 dark:text-red-400",
                        )}
                        title="Kaydı sil"
                        aria-label="Kaydı sil"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1 py-2.5 text-sm"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>

      {/* Silme onay modalı */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="v2-card w-full max-w-sm shadow-xl p-5">
            <h4 className="text-base font-semibold text-[rgb(var(--v2-ink))] mb-2">
              Kaydı Sil
            </h4>
            <p className="text-sm text-[rgb(var(--v2-muted))] mb-5">
              <strong className="text-[rgb(var(--v2-ink))]">{counterpartName}</strong> —{" "}
              {formatCurrency(deleteConfirm.amount, deleteConfirm.currency as "TRY" | "USD" | "GOLD")}{" "}
              alacak kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteConfirm(null)}
                className="btn-secondary flex-1 py-2.5 text-sm"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleDelete(deleteConfirm)}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-white text-sm font-semibold",
                  "inline-flex items-center justify-center gap-2",
                  "transition-all duration-150 active:translate-y-0 hover:-translate-y-px",
                  "bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-600",
                  "shadow-[0_10px_22px_-12px_rgba(224,49,49,0.7)]",
                  "disabled:opacity-50 disabled:pointer-events-none",
                )}
              >
                {deleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
