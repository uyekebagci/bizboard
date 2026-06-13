"use client";

/**
 * v1.7.x WP fbb2ef55: Çek/senet tahsil (clear) modalı.
 *
 * <p>PORTFOLIO statu'sundaki bir instrument'ı CLEARED'a alır; bank_account.current_balance
 * incoming için artar, outgoing için düşer. Eş zamanlı bir tx açılır.</p>
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Check, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn, formatCurrency } from "@/lib/utils";
import type { BankAccountListItem, PaymentInstrumentDto } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import { useFocusTrap } from "@/hooks/useFocusTrap";

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

  const dialogRef = useRef<HTMLFormElement>(null);
  useFocusTrap(true, dialogRef);

  // ESC → close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-instrument-modal-title"
      onClick={onClose}>
      <form
        ref={dialogRef}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-md shadow-xl">
        <div className="modal-header">
          <h3 id="clear-instrument-modal-title" className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            <Check size={16} className="text-emerald-700 dark:text-emerald-300" />
            {isCheque ? "Çek" : "Senet"} Tahsil
          </h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5" /><span>{error}</span>
            </div>
          )}

          <div className="rounded-lg v2-sunken p-3 text-xs space-y-1">
            <p className="text-[rgb(var(--v2-ink))]">
              <strong>{isCheque ? instrument.cheque_number : instrument.note_serial}</strong>
              {" · "}
              {formatCurrency(instrument.amount, instrument.currency || "TRY")}
            </p>
            <p className="text-[rgb(var(--v2-muted))]">
              {instrument.counterpart_name} · vade: {instrument.due_date}
              {isCheque && instrument.drawer_bank && ` · ${instrument.drawer_bank}`}
            </p>
            <p className={cn("text-[11px]", isIncoming ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
              {isIncoming ? "Bizim portföyümüzdeki çek/senet → tahsil hesaba yatacak"
                          : "Bizim verdiğimiz çek/senet → tahsil hesaptan çıkacak"}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
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
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Tahsil Tarihi *</label>
            <input type="date" required value={clearedDate}
              onChange={(e) => setClearedDate(e.target.value)}
              className="field field-sm py-2.5" />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm">
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
