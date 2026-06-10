"use client";

/**
 * v1.6.19 (WP-2): "Günü kapat" modal.
 *
 * Akış:
 *  1. Hesaplanan değer (computed_closing) büyük yazı ile readonly gösterilir.
 *  2. Kullanıcı physical sayım sonucu (actualBalance) girer — zorunlu.
 *  3. Fark canlı hesaplanır + renklendirilir (eksik kırmızı, fazla yeşil, sıfır nötr).
 *  4. Fark != 0 ise kategori (Kayıp / Yanlış Girim / Yuvarlama / Diğer) + açıklama zorunlu.
 *  5. "Kapat" — POST /closings/today.
 */

import { useMemo, useState } from "react";
import { X, Loader2, AlertTriangle, Check } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { formatCurrency, formatMoneyInput, parseMoneyInput, cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { CashClosing, CashClosingPreview, CashClosingReason } from "@/types";

const REASONS: { value: CashClosingReason; label: string }[] = [
  { value: "LOSS",       label: "Kayıp" },
  { value: "MIS_ENTRY",  label: "Yanlış Girim" },
  { value: "ROUNDING",   label: "Yuvarlama" },
  { value: "OTHER",      label: "Diğer" },
];

interface Props {
  preview: CashClosingPreview;
  /** v1.6.23.21 (Security WP): cash closing artık tenant-scoped — zorunlu. */
  businessId: string;
  onClose: () => void;
  onClosed: (closing: CashClosing) => void;
}

export function CloseTodayModal({ preview, businessId, onClose, onClosed }: Props) {
  const [actualInput, setActualInput] = useState("");
  const [reason, setReason] = useState<CashClosingReason | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actual = useMemo(() => parseMoneyInput(actualInput), [actualInput]);
  const difference = useMemo(() => actual - preview.computed_closing, [actual, preview.computed_closing]);
  const hasDiff = actualInput !== "" && difference !== 0;
  const isPositive = difference > 0;
  const isNegative = difference < 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!actualInput) { setError("Fiziksel sayım zorunlu"); return; }
    if (hasDiff && !reason) { setError("Fark var — kategori seçin"); return; }
    if (hasDiff && !note.trim()) { setError("Fark var — açıklama zorunlu"); return; }

    setSubmitting(true);
    try {
      const result = await api.post<CashClosing>(`/closings/today?business_id=${businessId}`, {
        actual_balance: actual,
        reason_category: hasDiff ? reason : null,
        reason_note: hasDiff ? note.trim() : null,
      });
      toast.success("Gün kapatıldı");
      onClosed(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Bu gün zaten kapatılmış. Sayfayı yenileyin.");
      } else {
        setError(getErrorMessage(err, "Kapatılamadı"));
      }
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass-card shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-surface-700/60">
          <h3 className="text-lg font-bold h-display text-surface-100">Günü Kapat</h3>
          <button onClick={onClose} className="modal-close">
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Computed (büyük, readonly) */}
          <div className="rounded-2xl p-4 bg-surface-900/40 border border-surface-700/60 text-center">
            <p className="text-[11px] text-surface-400 uppercase tracking-wider">Hesaplanan Kapanış</p>
            <p className="num mt-1 text-3xl font-bold text-surface-100">
              {formatCurrency(preview.computed_closing, "TRY")}
            </p>
            <p className="mt-1 text-[11px] text-surface-400">
              Açılış: {formatCurrency(preview.opening_balance, "TRY")}
              {" · Net akış: "}
              {preview.net_flow >= 0 ? "+" : ""}{formatCurrency(preview.net_flow, "TRY")}
            </p>
          </div>

          {/* Actual input */}
          <div>
            <label className="label">Fiziksel Sayım (Gerçek) <span className="text-red-400">*</span></label>
            <input
              type="text"
              inputMode="numeric"
              value={actualInput}
              onChange={(e) => setActualInput(formatMoneyInput(e.target.value))}
              className="input text-xl font-bold"
              placeholder="0"
              autoFocus
              required
            />
          </div>

          {/* Difference (canlı) */}
          {actualInput !== "" && (
            <div className={cn(
              "rounded-2xl p-3 border border-surface-700/60 flex items-center justify-between transition-colors",
              difference === 0 && "bg-surface-700/50",
              isNegative && "bg-red-500/10 border-red-500/30",
              isPositive && "bg-emerald-500/10 border-emerald-500/30",
            )}>
              <span className="text-sm text-surface-300">Fark</span>
              <span className={cn(
                "text-lg font-bold",
                difference === 0 && "text-surface-100",
                isNegative && "text-red-400",
                isPositive && "text-emerald-400",
              )}>
                {difference > 0 ? "+" : ""}{formatCurrency(difference, "TRY")}
              </span>
            </div>
          )}

          {/* Reason category — yalnız fark != 0 ise zorunlu */}
          {hasDiff && (
            <>
              <div>
                <label className="label">Kategori <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      className={cn(
                        "px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                        reason === r.value
                          ? "bg-brand-500/15 border-brand-500/40 text-brand-300"
                          : "bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-300",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Açıklama <span className="text-red-400">*</span></label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input min-h-[80px] resize-none"
                  placeholder={difference < 0 ? "Eksiğin sebebi..." : "Fazlalığın sebebi..."}
                  required
                />
              </div>
            </>
          )}

          {/* Submit */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary flex-1 px-4 py-2.5 text-sm"
            >
              Vazgec
            </button>
            <button
              type="submit"
              disabled={submitting || !actualInput}
              className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Kapatılıyor...</>
              ) : (
                <><Check size={16} /> Kapat</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
