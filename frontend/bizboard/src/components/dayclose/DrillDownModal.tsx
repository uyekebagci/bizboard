"use client";

/**
 * Ledger v2 (Faz B, §4 madde 5): kaçak drill-down modal'ı — variance'ın
 * kaynağına in. Hesap-bazlı sapma (hangi hesap saptı) + o günün konum
 * hareketleri (hangi işlem). Portal'lı, çift tema.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Search } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import type { DayCloseDrillDown } from "@/types";

interface Props {
  date: string | null;
  load: (date: string) => Promise<DayCloseDrillDown>;
  onClose: () => void;
}

export function DrillDownModal({ date, load, onClose }: Props) {
  const open = !!date;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [data, setData] = useState<DayCloseDrillDown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) { setData(null); return; }
    setLoading(true);
    setError(null);
    load(date)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, "Detay yüklenemedi")))
      .finally(() => setLoading(false));
  }, [date, load]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-card shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-surface-700/60">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-brand-300" />
            <h3 className="text-lg font-bold h-display text-white">Kaçak Detayı — {date}</h3>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={26} className="animate-spin text-surface-400" />
            </div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          {data && !loading && (
            <>
              {/* Özet */}
              <div className="rounded-2xl p-4 bg-surface-900/40 border border-surface-700/60 grid grid-cols-2 gap-y-1.5 text-sm">
                <span className="text-surface-300">Olması Gereken</span>
                <span className="text-right text-white font-semibold num">{formatCurrency(data.computed_closing, "TRY")}</span>
                <span className="text-surface-300">Son Kasa</span>
                <span className="text-right text-white font-semibold num">{formatCurrency(data.actual_total ?? 0, "TRY")}</span>
                <span className="text-surface-300">Eksik / Fazla</span>
                <span className={cn(
                  "text-right font-bold num",
                  (data.variance ?? 0) > 0 ? "text-red-400" : (data.variance ?? 0) < 0 ? "text-emerald-400" : "text-white",
                )}>
                  {(data.variance ?? 0) > 0 ? "+" : ""}{formatCurrency(data.variance ?? 0, "TRY")}
                </span>
              </div>

              {/* Hesap bazlı sapma */}
              <div>
                <p className="label mb-1.5">Hesap Bazlı Sapma</p>
                <div className="glass-card divide-y divide-surface-700">
                  {data.account_breakdown.length === 0 && (
                    <p className="p-3 text-xs text-surface-400">Sayım kaydı yok.</p>
                  )}
                  {data.account_breakdown.map((a) => (
                    <div key={a.account_id} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{a.account_name}</p>
                        <p className="text-[11px] text-surface-400">
                          Sayım {formatCurrency(a.counted_balance ?? 0, "TRY")} · Sistem {formatCurrency(a.computed_balance ?? 0, "TRY")}
                        </p>
                      </div>
                      {a.account_variance != null && Math.abs(a.account_variance) > 0.005 && (
                        <span className={cn("text-sm font-semibold shrink-0",
                          a.account_variance < 0 ? "text-red-400" : "text-emerald-400")}>
                          {a.account_variance > 0 ? "+" : ""}{formatCurrency(a.account_variance, "TRY")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Gün hareketleri */}
              <div>
                <p className="label mb-1.5">Gün Hareketleri ({data.movements.length})</p>
                <div className="glass-card divide-y divide-surface-700 max-h-56 overflow-y-auto">
                  {data.movements.length === 0 && (
                    <p className="p-3 text-xs text-surface-400">Bu güne ait konum hareketi yok.</p>
                  )}
                  {data.movements.map((m) => (
                    <div key={m.posting_id} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{m.account_name ?? "—"}</p>
                        <p className="text-[11px] text-surface-400 truncate">
                          {m.source_type}{m.description ? ` · ${m.description}` : ""}
                        </p>
                      </div>
                      <span className={cn("text-sm font-medium shrink-0 num",
                        m.amount < 0 ? "text-red-300" : "text-emerald-300")}>
                        {m.amount > 0 ? "+" : ""}{formatCurrency(m.amount, "TRY")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
