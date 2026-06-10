"use client";

/**
 * WP e4dc5271 (Beta v1.4) TODO 0623e4a8: Hızlı İşlem Execute modal.
 *
 * <p>Karta tıklandığında açılır. Düzenlenebilir: tutar, tarih, açıklama.
 * Sabit (template'ten gelen, gri/disabled): POS cihazı, banka komisyonu,
 * bizim komisyon. Submit → POST /quick-actions/{id}/execute → tx oluştur.</p>
 *
 * <p>Beklenen kâr canlı hesaplama (POS için):
 * profit = amount × (our_rate - bank_rate) / 100</p>
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { ExecuteQuickActionResponse, QuickActionListItem } from "@/types";

interface Props {
  quickAction: QuickActionListItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function QuickActionExecuteModal({ quickAction, onClose, onSuccess }: Props) {
  const tpl = quickAction.tx_template;

  // Beta v1.1 hotfix: template'te manual_sub_cash_id varsa adını bul
  // (SABİT BİLGİLER altında göstermek için).
  const [subCashName, setSubCashName] = useState<string | null>(null);
  useEffect(() => {
    if (!tpl.manual_sub_cash_id) { setSubCashName(null); return; }
    api.get<Array<{ id: string; name: string; type: string }>>(`/bank-accounts`)
      .then((accs) => {
        const match = (accs || []).find((a) => a.id === tpl.manual_sub_cash_id);
        setSubCashName(match?.name ?? null);
      })
      .catch(() => setSubCashName(null));
  }, [tpl.manual_sub_cash_id]);

  // Düzenlenebilir state
  const [amount, setAmount] = useState<string>(
    tpl.amount != null ? formatMoneyInput(String(tpl.amount)) : "",
  );
  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [description, setDescription] = useState<string>(
    tpl.description ?? "",
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Beklenen kâr canlı hesap (POS için)
  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);
  const expectedProfit = useMemo(() => {
    if (tpl.payment_method !== "POS") return null;
    const bankRate = tpl.applied_pos_rate ?? 0;
    const ourRate = tpl.applied_our_commission_rate ?? 0;
    if (parsedAmount <= 0 || ourRate <= 0) return null;
    return parsedAmount * (ourRate - bankRate) / 100;
  }, [parsedAmount, tpl]);

  // ESC ile kapat
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (parsedAmount <= 0) {
      setError("Tutar pozitif olmalı");
      return;
    }
    setSubmitting(true);
    try {
      await api.post<ExecuteQuickActionResponse>(
        `/quick-actions/${quickAction.id}/execute`,
        {
          overrides: {
            amount: parsedAmount,
            transaction_date: date,
            description: description.trim() || null,
          },
        },
      );
      setSuccess(true);
      toast.success("İşlem oluşturuldu");
      setTimeout(() => onSuccess(), 600);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "İşlem oluşturulamadı";
      setError(msg);
      logger.error("api", "quick-action execute failed", { id: quickAction.id }, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-2 min-w-0">
            <Zap size={16} className="text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">
                Hızlı İşlem: {quickAction.name}
              </h3>
              <p className="text-[10px] text-surface-400">
                {tpl.kind === "TRANSFER" ? "Transfer" : tpl.direction === "income" ? "Gelir" : "Gider"}
                {tpl.payment_method && ` · ${tpl.payment_method}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {success && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 size={14} /> İşlem oluşturuldu.
            </div>
          )}

          {/* DÜZENLENEBİLİR */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase text-surface-400 tracking-wider">
              Düzenlenebilir
            </p>
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1">
                Tutar
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                  required
                  className="field field-sm py-2.5 text-xl font-bold"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 font-medium text-sm">
                  TRY
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1">
                Tarih
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="field field-sm py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1">
                Açıklama
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opsiyonel"
                maxLength={255}
                className="field field-sm py-2"
              />
            </div>
          </div>

          {/* SABİT (template) */}
          <div className="space-y-2 rounded-xl border border-surface-700 bg-surface-900/40 p-3">
            <p className="text-[10px] uppercase text-surface-400 tracking-wider">
              Sabit Bilgiler (Düzenle modalı kullanın)
            </p>
            <LockedRow label="Ödeme Yöntemi" value={tpl.payment_method ?? "—"} />
            {tpl.kind === "TRANSFER" ? (
              <>
                <LockedRow label="Kaynak Hesap" value={tpl.from_bank_account_id ? "[Hesap ID]" : "—"} hint="Backend'te validasyon" />
                <LockedRow label="Hedef" value={tpl.to_external_name ?? tpl.to_bank_account_id ?? "—"} />
              </>
            ) : (
              <>
                {tpl.pos_device_id && (
                  <LockedRow label="POS Cihazı" value="[Cihaz ID]" hint="Template'ten" />
                )}
                {tpl.applied_pos_rate != null && (
                  <LockedRow label="Banka Komisyonu" value={`%${tpl.applied_pos_rate}`} />
                )}
                {tpl.applied_our_commission_rate != null && (
                  <LockedRow label="Bizim Komisyon" value={`%${tpl.applied_our_commission_rate}`} />
                )}
                {tpl.manual_sub_cash_id && (
                  <LockedRow label="Alt Kasa" value={subCashName ?? "[Kasa ID]"} hint="Tx oluşunca buraya da yansır" />
                )}
              </>
            )}
          </div>

          {/* Beklenen kâr (POS için) */}
          {expectedProfit != null && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <p className="text-[10px] uppercase text-emerald-300/70 tracking-wider mb-1">
                Beklenen Kâr (canlı)
              </p>
              <p className="text-lg font-bold text-emerald-300">
                {formatCurrency(expectedProfit, "TRY")}
              </p>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-4 border-t border-surface-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={submitting || success || parsedAmount <= 0}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            <Zap size={14} />
            İşlemi Yarat
          </button>
        </div>
      </form>
    </div>
  );
}

function LockedRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-surface-400">{label}:</span>
      <span className="text-surface-300 font-medium" title={hint}>{value}</span>
    </div>
  );
}
