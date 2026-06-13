"use client";

/**
 * v1.7.x WP fbb2ef55: Çek/senet karşılıksız (bounce) modalı.
 *
 * <p>PORTFOLIO statu'sundaki instrument'ı BOUNCED'a alır. INCOMING bounce'da
 * ilgili debt allocation'ları reverse edilir (counterpart yine borçlu olur).</p>
 */

import { useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { PaymentInstrumentDto } from "@/types";

interface Props {
  instrument: PaymentInstrumentDto;
  onClose: () => void;
  onSuccess?: (updated: PaymentInstrumentDto) => void;
}

export function BounceInstrumentModal({ instrument, onClose, onSuccess }: Props) {
  const [bouncedDate, setBouncedDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCheque = instrument.instrument_type === "CHEQUE";
  const isIncoming = instrument.direction === "INCOMING";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.post<PaymentInstrumentDto>(
        `/payment-instruments/${instrument.id}/bounce`,
        { bounced_at: bouncedDate + "T00:00:00", reason: reason.trim() || null });
      toast.success("Karşılıksız olarak işaretlendi");
      onSuccess?.(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bounce başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-md shadow-xl">
        <div className="modal-header">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-700 dark:text-red-300" />
            {isCheque ? "Çek" : "Senet"} Karşılıksız İşaretle
          </h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs">
              {error}
            </div>
          )}

          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-700 dark:text-red-200">
            <p className="font-semibold mb-1">Bu işlem geri alınamaz.</p>
            {isIncoming
              ? <p>Karşı tarafın bizdeki alacağı geri açılacak (borç restore edilecek).</p>
              : <p>Bizim verecek borcumuz tekrar açılacak.</p>}
          </div>

          <div className="rounded-lg v2-sunken p-3 text-xs space-y-1">
            <p className="text-[rgb(var(--v2-ink))]">
              <strong>{isCheque ? instrument.cheque_number : instrument.note_serial}</strong>
              {" · "}
              {formatCurrency(instrument.amount, instrument.currency || "TRY")}
            </p>
            <p className="text-[rgb(var(--v2-muted))]">
              {instrument.counterpart_name} · vade: {instrument.due_date}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Karşılıksız Tarihi *</label>
            <input type="date" required value={bouncedDate}
              onChange={(e) => setBouncedDate(e.target.value)}
              className="field field-sm py-2.5" />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              Sebep <span className="text-[rgb(var(--v2-muted))] font-normal">(opsiyonel)</span>
            </label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="orn. Yetersiz bakiye"
              className="field field-sm py-2.5 resize-none" />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm">
            Vazgeç
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
            Karşılıksız İşaretle
          </button>
        </div>
      </form>
    </div>
  );
}
