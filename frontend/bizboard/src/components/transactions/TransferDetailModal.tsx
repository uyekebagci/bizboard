"use client";

/**
 * v1.7.0-beta (Bankalar WP TODO 64eb9a76): Transfer detay modalı.
 *
 * <p>Tx satırına tıklandığında (kind=TRANSFER + transfer_pair_id varsa)
 * açılır — pair'in iki tarafını + meta'yı tek yerde gösterir.
 * "Transfer'i Sil" butonu pair'i atomic siler (DELETE /transfers/{pairId}).</p>
 */

import { useEffect, useState } from "react";
import { X, Loader2, AlertTriangle, ArrowRight, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { TransferDto } from "@/types";

interface Props {
  pairId: string | null;
  onClose: () => void;
  /** Silme sonrası parent refresh (tx listesi + consolidated). */
  onDeleted?: () => void;
}

export function TransferDetailModal({ pairId, onClose, onDeleted }: Props) {
  const [data, setData] = useState<TransferDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!pairId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setConfirmDelete(false);
    api.get<TransferDto>(`/transfers/${pairId}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Transfer yuklenemedi");
        logger.error("api", "transfer detail fetch failed", { pairId }, err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pairId]);

  // Esc → close
  useEffect(() => {
    if (!pairId) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pairId, onClose]);

  async function handleDelete() {
    if (!pairId) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/transfers/${pairId}`);
      toast.info("İşlem silindi");
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Silinemedi");
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  if (!pairId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl shadow-xl border border-surface-600 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40">
              TRANSFER
            </span>
            Transfer Detayı
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-surface-400" />
            </div>
          )}

          {error && !loading && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {data && !loading && (
            <>
              {/* Tutar — büyük */}
              <div className="text-center py-3 rounded-xl bg-surface-900 border border-surface-700">
                <p className="text-3xl font-bold text-white">
                  {formatCurrency(data.amount, data.currency || "TRY")}
                </p>
                <p className="text-[11px] text-surface-400 mt-1">{data.date}</p>
              </div>

              {/* From → To */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 p-3 rounded-xl border border-red-500/30 bg-red-500/[0.04]">
                  <p className="text-[10px] uppercase text-red-300/80 tracking-wider mb-1">Kaynak</p>
                  <p className="text-sm font-medium text-white truncate">{data.from_bank_account_name}</p>
                  <p className="text-[11px] text-red-300 mt-0.5">
                    −{formatCurrency(data.amount, data.currency || "TRY")}
                  </p>
                </div>
                <ArrowRight size={20} className="text-surface-400 shrink-0" />
                <div className="flex-1 min-w-0 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04]">
                  <p className="text-[10px] uppercase text-emerald-300/80 tracking-wider mb-1">Hedef</p>
                  <p className="text-sm font-medium text-white truncate">{data.to_bank_account_name}</p>
                  <p className="text-[11px] text-emerald-300 mt-0.5">
                    +{formatCurrency(data.amount, data.currency || "TRY")}
                  </p>
                </div>
              </div>

              {/* Description + meta */}
              {data.description && (
                <div className="p-3 rounded-xl border border-surface-700">
                  <p className="text-[10px] uppercase text-surface-400 mb-1">Açıklama</p>
                  <p className="text-sm text-surface-200">{data.description}</p>
                </div>
              )}

              {data.low_balance_warning && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{data.low_balance_warning}</span>
                </div>
              )}

              <p className="text-[10px] text-surface-500 text-center">
                Bu işlem 2 paired tx olarak kaydedildi (kind=TRANSFER).
                Gelir/gider raporlarında YOK; hesap detay listesinde GÖRÜNÜR.
              </p>
            </>
          )}
        </div>

        {data && !loading && (
          <div className="p-4 border-t border-surface-700">
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-200 text-center">
                  ⚠ Silersen iki taraftaki tx birden silinir, bakiyeler eski hâline döner.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="flex-1 px-3 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm disabled:opacity-50"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex-1 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {busy && <Loader2 size={12} className="animate-spin" />}
                    Evet, sil
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className={cn(
                  "w-full px-3 py-2 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5",
                  "bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20",
                )}
              >
                <Trash2 size={12} />
                Transfer'i Sil (pair)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
