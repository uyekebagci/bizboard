"use client";

/**
 * WP a9da4e9d (Beta v1.1 · Borçlar): Borç silme modal.
 *
 * <p>ADMIN ONLY aksiyon. Kullanıcı bir RECEIVABLE seçer, tutar girer,
 * (opsiyonel) sebep yazar. POST /debts/{id}/writeoff. Bu işlem ödeme
 * değildir — bank/tx etkilemez, yalnız debt.remaining düşer + cari
 * hesap statement'a yansır.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Scissors, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { AccountStatement } from "@/types";

interface Props {
  counterpartId: string;
  counterpartName: string;
  openDebts: AccountStatement["open_debts"];
  preselectedDebtId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function WriteoffModal({
  counterpartId: _counterpartId,
  counterpartName,
  openDebts,
  preselectedDebtId,
  onClose,
  onSuccess,
}: Props) {
  // RECEIVABLE'lar listelenir; PAYABLE'ı şimdilik scope dışı (spec: alacak silme)
  const eligibleDebts = useMemo(
    () => openDebts.filter((d) => d.direction === "RECEIVABLE"),
    [openDebts],
  );

  const [debtId, setDebtId] = useState<string>(
    preselectedDebtId ?? (eligibleDebts.length === 1 ? eligibleDebts[0].id : ""),
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const selectedDebt = useMemo(
    () => eligibleDebts.find((d) => d.id === debtId) || null,
    [eligibleDebts, debtId],
  );
  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);
  const remainingAfter = selectedDebt
    ? Math.max(0, selectedDebt.remaining_amount - parsedAmount)
    : 0;
  const amountValid =
    !!selectedDebt && parsedAmount > 0 && parsedAmount <= selectedDebt.remaining_amount;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  async function handleSubmit() {
    if (!selectedDebt || !amountValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/debts/${selectedDebt.id}/writeoff`, {
        amount: parsedAmount,
        reason: reason.trim() || null,
      });
      toast.success("Borç silindi");
      onSuccess();
    } catch (err) {
      const msg = err instanceof ApiError
        ? (err.status === 403 ? "Bu işlem için yönetici yetkisi gerekli" : err.message)
        : "Borç silme başarısız";
      setError(msg);
      logger.error("api", "debt writeoff failed", { debtId }, err);
      setShowConfirm(false);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card !border-rose-500/30 w-full max-w-lg max-h-[92vh] flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="min-w-0 flex items-center gap-2">
            <Scissors size={18} className="text-rose-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">
                Borç Sil — {counterpartName}
              </h3>
              <p className="text-[10px] text-rose-300/80">
                ⚠ Bu işlem geri alınamaz (admin only).
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {eligibleDebts.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 size={28} className="mx-auto text-surface-500 mb-2" />
              <p className="text-sm text-surface-300 font-medium">
                Silinebilecek açık alacak yok.
              </p>
              <p className="text-[11px] text-surface-400 mt-1">
                Sadece RECEIVABLE statüsündeki borçlar manuel silinebilir.
              </p>
            </div>
          ) : (
            <>
              {/* Debt selector */}
              <div>
                <label className="block text-xs font-medium text-surface-200 mb-1.5">
                  Hangi borçtan silinsin? *
                </label>
                <div className="space-y-2">
                  {eligibleDebts.map((d) => (
                    <label
                      key={d.id}
                      className={cn(
                        "flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors",
                        debtId === d.id
                          ? "border-rose-500/50 bg-rose-500/5"
                          : "border-surface-600 bg-surface-700/40 hover:bg-surface-700/60",
                      )}
                    >
                      <input
                        type="radio"
                        checked={debtId === d.id}
                        onChange={() => setDebtId(d.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">
                          {formatCurrency(d.remaining_amount, "TRY")}
                          {d.remaining_amount !== d.original_amount && (
                            <span className="ml-2 text-[10px] text-surface-400">
                              (asıl: {formatCurrency(d.original_amount, "TRY")})
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-surface-400 truncate">
                          {d.description || "—"}
                          {d.due_date && <> · vade {new Date(d.due_date).toLocaleDateString("tr-TR")}</>}
                          {d.status && <> · {d.status}</>}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-surface-200 mb-1.5">
                  Silinecek Tutar *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                    placeholder="0"
                    disabled={!selectedDebt}
                    className="field field-error py-3 text-xl font-bold disabled:opacity-50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm">
                    TRY
                  </span>
                </div>
                {selectedDebt && (
                  <p className="mt-1 text-[10px] text-surface-400">
                    Maksimum: <strong className="text-surface-300">
                      {formatCurrency(selectedDebt.remaining_amount, "TRY")}
                    </strong>
                  </p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-surface-200 mb-1.5">
                  Sebep (opsiyonel)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="İskonto anlaşması, mutabakat, hatalı kayıt..."
                  maxLength={500}
                  className="field field-sm field-error py-2.5"
                />
              </div>

              {/* Live calc */}
              {selectedDebt && parsedAmount > 0 && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                  <p className="text-[10px] uppercase text-rose-300/70 tracking-wider mb-1">
                    İşlem sonrası kalan
                  </p>
                  <p className="text-lg font-bold text-rose-300">
                    {formatCurrency(remainingAfter, "TRY")}
                  </p>
                  {remainingAfter === 0 && (
                    <p className="text-[11px] text-rose-200/80 mt-1">
                      Borç tamamen silinecek (status → PAID)
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {eligibleDebts.length > 0 && (
          <div className="flex items-center gap-2 p-4 border-t border-surface-700">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium disabled:opacity-50"
            >
              İptal
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={submitting || !amountValid}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Scissors size={14} />
              Borcu Sil
            </button>
          </div>
        )}
      </div>

      {/* Confirm overlay */}
      {showConfirm && selectedDebt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => !submitting && setShowConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card !border-rose-500/40 max-w-sm w-full p-5"
          >
            <h4 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle size={18} className="text-rose-400" />
              Onayla: Borç Silme
            </h4>
            <p className="text-sm text-surface-300 mb-3">
              <strong className="text-rose-300">{formatCurrency(parsedAmount, "TRY")}</strong>
              {" "}tutarındaki borç <strong className="text-white">{counterpartName}</strong>{" "}
              alacağından silinecek.
            </p>
            <p className="text-[11px] text-surface-400 mb-4">
              Bu bir ödeme değildir — bank balance, transaction listesi ve konsolide net
              etkilenmez. Yalnız cari hesap bakiyesi düşer.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} disabled={submitting}
                className="flex-1 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium disabled:opacity-50">
                Vazgeç
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
