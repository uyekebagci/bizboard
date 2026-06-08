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
        className="glass-card w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-300" />
            {isCheque ? "Çek" : "Senet"} Karşılıksız İşaretle
          </h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-200">
            <p className="font-semibold mb-1">Bu işlem geri alınamaz.</p>
            {isIncoming
              ? <p>Karşı tarafın bizdeki alacağı geri açılacak (borç restore edilecek).</p>
              : <p>Bizim verecek borcumuz tekrar açılacak.</p>}
          </div>

          <div className="rounded-lg bg-surface-700/40 p-3 text-xs space-y-1">
            <p className="text-surface-200">
              <strong>{isCheque ? instrument.cheque_number : instrument.note_serial}</strong>
              {" · "}
              {formatCurrency(instrument.amount, instrument.currency || "TRY")}
            </p>
            <p className="text-surface-400">
              {instrument.counterpart_name} · vade: {instrument.due_date}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Karşılıksız Tarihi *</label>
            <input type="date" required value={bouncedDate}
              onChange={(e) => setBouncedDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Sebep <span className="text-surface-400 font-normal">(opsiyonel)</span>
            </label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="orn. Yetersiz bakiye"
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-700">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50">
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
