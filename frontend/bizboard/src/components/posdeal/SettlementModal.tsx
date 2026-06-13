"use client";

/**
 * Ledger v2 (Faz C, §3.5 / TODO 2): T+1 POS yatış (ort.komisyon) finalize modal'ı.
 *
 * <p>Bekleyen gün+cihaz için bankaya yatan tutar girilir → ort.komisyon =
 * (1 − yatan/brüt) hesaplanır → OWNER_COMMISSION (Tuncay) payı kesinleşir.</p>
 *
 * <p>Portal'lı. Çift tema.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Banknote } from "lucide-react";
import { formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { FinalizeSettlementInput } from "@/hooks/usePosSettlements";
import type { PosSettlementBatch, PosDeviceListItem } from "@/types";

interface Props {
  /** null = kapalı. Bekleyen gün+cihaz batch (gross_total + device). */
  batch: PosSettlementBatch | null;
  devices: PosDeviceListItem[];
  onClose: () => void;
  finalize: (input: FinalizeSettlementInput) => Promise<PosSettlementBatch>;
}

export function SettlementModal({ batch, devices, onClose, finalize }: Props) {
  const open = !!batch;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [deposited, setDeposited] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (batch) setDeposited(""); }, [batch]);

  const gross = batch?.gross_total ?? 0;
  const depositedNum = deposited ? parseMoneyInput(deposited) : 0;
  // ort.komisyon (%) = (1 − yatan/brüt) × 100.
  const avgCommission = useMemo(
    () => (gross > 0 && depositedNum > 0 ? (1 - depositedNum / gross) * 100 : null),
    [gross, depositedNum]);

  async function handleSubmit() {
    if (!batch || !batch.pos_device_id) return;
    if (depositedNum <= 0) { toast.error("Yatan tutar > 0 olmalı"); return; }
    if (depositedNum > gross) { toast.error("Yatan brütten büyük olamaz"); return; }
    setSubmitting(true);
    try {
      await finalize({
        posDeviceId: batch.pos_device_id,
        settleDate: batch.settle_date,
        depositedAmount: depositedNum,
      });
      toast.success("Yatış işlendi, ort.komisyon kesinleşti");
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !mounted || !batch) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="v2-card relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--v2-border))]">
          <div className="flex items-center gap-2">
            <Banknote size={18} className="text-emerald-700 dark:text-emerald-400" />
            <h2 className="text-base font-bold text-[rgb(var(--v2-ink))]">POS Yatış Gir (T+1)</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl p-3 v2-sunken border border-[rgb(var(--v2-border))]">
            <p className="text-sm text-[rgb(var(--v2-ink))] font-medium">{batch.pos_device_name}</p>
            <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-0.5">
              {new Date(batch.settle_date).toLocaleDateString("tr-TR")} · {batch.deal_count} işlem
            </p>
            <p className="text-[11px] text-[rgb(var(--v2-muted))]">
              POS Brüt: <span className="text-[rgb(var(--v2-ink))] font-semibold">{formatCurrency(gross, "TRY")}</span>
            </p>
          </div>

          <div>
            <label className="label">Bankaya Yatan Tutar <span className="text-red-400">*</span></label>
            <input type="text" inputMode="numeric" value={deposited}
              onChange={(e) => setDeposited(formatMoneyInput(e.target.value))}
              className="input w-full font-semibold" placeholder="0" autoFocus />
          </div>

          {avgCommission != null && (
            <div className="rounded-xl p-3 bg-[rgb(var(--accent))]/5 border border-[rgb(var(--accent))]/20 flex items-center justify-between">
              <span className="text-sm text-[rgb(var(--v2-muted))]">Ortalama Komisyon</span>
              <span className="text-lg font-bold text-accent-strong dark:text-accent num">
                %{avgCommission.toFixed(2)}
              </span>
            </div>
          )}
          <p className="text-[11px] text-[rgb(var(--v2-muted))]">
            Ort.komisyon = (1 − yatan ÷ brüt). Tuncay payı = (sahip baz% − ort.komisyon) × brüt
            ile kesinleşir.
          </p>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-[rgb(var(--v2-border))]">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5">İptal</button>
          <button onClick={handleSubmit} disabled={submitting || depositedNum <= 0}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold
                       disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Yatışı İşle
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
