"use client";

/**
 * v1.7.x WP fbb2ef55: Çek/senet tahsil (clear) modalı.
 *
 * <p>PORTFOLIO statu'sundaki bir instrument'ı CLEARED'a alır; bank_account.current_balance
 * incoming için artar, outgoing için düşer. Eş zamanlı bir tx açılır.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Check, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn, formatCurrency } from "@/lib/utils";
import type { BankAccountListItem, PaymentInstrumentDto } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";

interface Props {
  instrument: PaymentInstrumentDto;
  onClose: () => void;
  onSuccess?: (updated: PaymentInstrumentDto) => void;
}

export function ClearInstrumentModal({ instrument, onClose, onSuccess }: Props) {
  const [bankAccounts, setBankAccounts] = useState<BankAccountListItem[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [clearedDate, setClearedDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIncoming = instrument.direction === "INCOMING";
  const isCheque = instrument.instrument_type === "CHEQUE";

  useEffect(() => {
    api.get<BankAccountListItem[]>("/bank-accounts")
      .then((r) => setBankAccounts(r || []))
      .catch(() => {});
  }, []);

  const eligible = useMemo(
    () => bankAccounts.filter((b) =>
      b.is_active && (b.type === "CHECKING" || b.type === "SAVINGS" || b.type === "CASH_HOLDER")),
    [bankAccounts],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bankAccountId) { setError("Hesap seçin"); return; }
    setSubmitting(true);
    try {
      const updated = await api.post<PaymentInstrumentDto>(
        `/payment-instruments/${instrument.id}/clear`,
        {
          bank_account_id: bankAccountId,
          cleared_at: clearedDate + "T00:00:00",
        });
      toast.success("Tahsil edildi olarak işaretlendi");
      onSuccess?.(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tahsil işlemi başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Check size={16} className="text-emerald-300" />
            {isCheque ? "Çek" : "Senet"} Tahsil
          </h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5" /><span>{error}</span>
            </div>
          )}

          <div className="rounded-lg bg-surface-700/40 p-3 text-xs space-y-1">
            <p className="text-surface-200">
              <strong>{isCheque ? instrument.cheque_number : instrument.note_serial}</strong>
              {" · "}
              {formatCurrency(instrument.amount, instrument.currency || "TRY")}
            </p>
            <p className="text-surface-400">
              {instrument.counterpart_name} · vade: {instrument.due_date}
              {isCheque && instrument.drawer_bank && ` · ${instrument.drawer_bank}`}
            </p>
            <p className={cn("text-[11px]", isIncoming ? "text-emerald-300" : "text-red-300")}>
              {isIncoming ? "Bizim portföyümüzdeki çek/senet → tahsil hesaba yatacak"
                          : "Bizim verdiğimiz çek/senet → tahsil hesaptan çıkacak"}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              {isIncoming ? "Yatacak Hesap" : "Çıkacak Hesap"} *
            </label>
            <DarkSelect
              required
              value={bankAccountId}
              onChange={setBankAccountId}
              placeholder="Hesap seçin"
              searchable={eligible.length > 6}
              options={eligible.map((b) => ({
                value: b.id,
                label: `${b.name}${b.bank_name ? " · " + b.bank_name : ""}`,
                meta: formatCurrency(b.current_balance ?? 0, b.currency || "TRY"),
              }))}
              addOption={{
                label: "+ Yeni Banka Hesabı Ekle",
                onClick: () => { window.location.href = "/dashboard/hesaplar"; },
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Tahsil Tarihi *</label>
            <input type="date" required value={clearedDate}
              onChange={(e) => setClearedDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-700">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50">
            Vazgeç
          </button>
          <button type="submit" disabled={submitting || !bankAccountId}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Tahsil Et
          </button>
        </div>
      </form>
    </div>
  );
}
