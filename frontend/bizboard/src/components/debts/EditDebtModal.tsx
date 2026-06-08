"use client";

/**
 * WP a9da4e9d: Bireysel borç düzenleme modalı.
 *
 * <p>Counterpart detay sayfasındaki açık alacak/verecek satırlarındaki
 * "Düzenle" (Pencil) butonu bu modalı açar. Tutar / Vade / Açıklama
 * düzenlenir; PUT /debts/{id} ile partial update gönderilir.</p>
 *
 * <p>Tutar prefill'i <code>original_amount</code>'tan yapılır (kısmi ödeme
 * yapılmış olsa bile orijinal borç tutarı düzenlenir; remaining backend'de
 * yapılan ödemelere göre yeniden türetilir).</p>
 */

import { useState } from "react";
import { X, Loader2, Pencil, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { toast } from "@/lib/toast";

interface EditableDebt {
  id: string;
  original_amount: number;
  remaining_amount: number;
  due_date?: string | null;
  description?: string | null;
}

interface Props {
  debt: EditableDebt;
  onClose: () => void;
  onSuccess?: () => void;
}

/** number → "12.500,50" görüntü formatı (formatMoneyInput beklentisi). */
function seedMoney(value: number): string {
  if (!value || value <= 0) return "";
  const fixed = value.toFixed(2).replace(".", ",");
  return formatMoneyInput(fixed);
}

/** ISO datetime/date → <input type="date"> için YYYY-MM-DD. */
function seedDate(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function EditDebtModal({ debt, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState(seedMoney(debt.original_amount));
  const [dueDate, setDueDate] = useState(seedDate(debt.due_date));
  // WP a9da4e9d: "Henüz belli değil" — vade null ise varsayılan işaretli gelir.
  const [dueDateUnknown, setDueDateUnknown] = useState(!debt.due_date);
  const [description, setDescription] = useState(debt.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDueDateUnknown(checked: boolean) {
    setDueDateUnknown(checked);
    if (checked) setDueDate(""); // işaretliyse tarih girişini temizle
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseMoneyInput(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Tutar pozitif olmalı");
      return;
    }

    setSubmitting(true);
    try {
      // dueDateUnknown → vade'yi açıkça null'a çek (clear_due_date); aksi halde tarih gönder.
      const body: Record<string, unknown> = {
        amount: parsedAmount,
        description: description.trim() || null,
      };
      if (dueDateUnknown) {
        body.clear_due_date = true;
      } else {
        body.due_date = dueDate || null;
      }
      await api.put(`/debts/${debt.id}`, body);
      toast.success("Borç güncellendi");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Güncelleme başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Pencil size={16} className="text-brand-300" />
            Borç Düzenle
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Tutar */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Tutar *</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                required
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-lg font-bold text-white placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm font-medium">TRY</span>
            </div>
            {debt.remaining_amount < debt.original_amount && (
              <p className="mt-1 text-[10px] text-amber-300/80">
                Bu borca kısmi ödeme yapılmış. Orijinal tutarı düzenliyorsunuz; kalan
                tutar yapılan ödemelere göre yeniden hesaplanır.
              </p>
            )}
          </div>

          {/* Vade tarihi */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Vade Tarihi <span className="text-surface-400 font-normal">(opsiyonel)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={dueDateUnknown}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-surface-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dueDateUnknown}
                onChange={(e) => toggleDueDateUnknown(e.target.checked)}
                className="w-4 h-4 rounded border-surface-500 bg-surface-700 text-brand-500 focus:ring-brand-500"
              />
              Henüz belli değil
            </label>
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Açıklama <span className="text-surface-400 font-normal">(opsiyonel)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              placeholder="Borç ile ilgili not..."
            />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting || !amount}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 bg-brand-600 hover:bg-brand-700"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
