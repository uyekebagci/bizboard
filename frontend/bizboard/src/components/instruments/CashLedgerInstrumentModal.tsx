"use client";

/**
 * Ledger v2 (Faz D, §3.7) — Çek/Senet ↔ Nakit Tahsilat BAĞLAMA modalı.
 *
 * <p>Açık (CONFIRMED) bir Ledger-v2 {@link Instrument}'ı bir nakit/banka hesabına
 * tahsil/öde olarak BAĞLAR. Backend {@code POST /instruments/{id}/cash} çağrılır:
 * para hesabı +/−tutar (LOCATION_MOVE) + clearing (account NULL, ters işaret);
 * <b>PNL bacağı YOK</b> → Net Kâr Δ=0 (çift sayım yok). Status → CASHED.</p>
 *
 * <p>{@code prompt()} tabanlı eski seçimin yerine geçer. v2 Daxa design language:
 * solid/layered, rounded, lime accent, dark default + light otomatik. İki giriş
 * yolundan da kullanılır: (a) çek/senet detayından "Tahsil et",
 * (b) işlem formundaki "çek/senet tahsilatı" önerisinden.</p>
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Check, AlertTriangle, FileText } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn, formatCurrency } from "@/lib/utils";
import type { BankAccountListItem } from "@/types";
import type { Instrument } from "@/hooks/useInstruments";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
  instrument: Instrument;
  /** (id, accountId, cashedDate) → tahsil/öde. Genelde useInstruments().cash. */
  onCash: (id: string, accountId: string, cashedDate?: string) => Promise<unknown>;
  onClose: () => void;
  onSuccess?: () => void;
}

/** Para tutmayan ledger-v2 hesap tipleri (FE union'ında yok; string filtre). */
const NON_MONEY = ["POS_SETTLEMENT", "RECEIVABLE", "PAYABLE", "ASSET"];

export function CashLedgerInstrumentModal({ instrument, onCash, onClose, onSuccess }: Props) {
  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [accountId, setAccountId] = useState("");
  const [cashedDate, setCashedDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReceived = instrument.direction === "RECEIVED";
  const isCheck = instrument.type === "CHECK";

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
      .then((r) => setAccounts(r ?? []))
      .catch(() => setAccounts([]));
  }, []);

  // Para tutan, aktif hesaplar (POS havuzu / cari / ayni hariç).
  const moneyAccounts = useMemo(
    () => accounts.filter((a) => a.is_active !== false && !NON_MONEY.includes(a.type as string)),
    [accounts],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accountId) { setError("Hesap seçin"); return; }
    if (cashedDate > new Date().toISOString().slice(0, 10)) {
      setError("Tarih gelecek olamaz"); return;
    }
    setSubmitting(true);
    try {
      await onCash(instrument.id, accountId, cashedDate);
      toast.success(isReceived ? "Tahsil edildi — kasaya/bankaya girdi" : "Ödendi — kasadan/bankadan çıktı");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız");
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
      aria-labelledby="cash-instrument-modal-title"
      onClick={onClose}>
      <form
        ref={dialogRef}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--v2-border))] shrink-0">
          <h3 id="cash-instrument-modal-title" className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            <Check size={16} className="text-emerald-700 dark:text-emerald-300" />
            {isCheck ? "Çek" : "Senet"} {isReceived ? "Tahsil" : "Öde"} (Bağla)
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5" /><span>{error}</span>
            </div>
          )}

          {/* Evrak özeti */}
          <div className="rounded-lg v2-sunken p-3 text-xs space-y-1 border border-[rgb(var(--v2-border))]">
            <p className="text-[rgb(var(--v2-ink))] flex items-center gap-1.5">
              <FileText size={12} className="text-[rgb(var(--v2-muted))]" />
              <strong>{instrument.serial_no || (isCheck ? "Çek" : "Senet")}</strong>
              {" · "}
              {formatCurrency(instrument.amount, instrument.currency || "TRY")}
            </p>
            <p className="text-[rgb(var(--v2-muted))]">
              {instrument.issuer_name || "—"} · vade: {instrument.due_date}
              {instrument.bank_name && ` · ${instrument.bank_name}`}
            </p>
            <p className={cn("text-[11px]", isReceived ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
              {isReceived
                ? "Alınan çek/senet → tahsil edilince seçilen hesaba GİRER (alacak kapanır)."
                : "Verilen çek/senet → ödenince seçilen hesaptan ÇIKAR (borç kapanır)."}
            </p>
            <p className="text-[10px] text-[rgb(var(--v2-muted))]">
              Tahsilat gelir DEĞİL — alacağın nakde dönüşü. Net Kâr etkilenmez (çift sayım yok).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              {isReceived ? "Girecek Hesap" : "Çıkacak Hesap"} *
            </label>
            <DarkSelect
              required
              value={accountId}
              onChange={setAccountId}
              placeholder="Hesap seçin"
              searchable={moneyAccounts.length > 6}
              options={moneyAccounts.map((b) => ({
                value: b.id,
                label: `${b.name}${b.bank_name ? " · " + b.bank_name : ""}`,
                meta: formatCurrency(b.current_balance ?? 0, b.currency || "TRY"),
              }))}
              addOption={{
                label: "+ Yeni Hesap Ekle",
                onClick: () => { window.location.href = "/dashboard/hesaplar"; },
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              {isReceived ? "Tahsil" : "Ödeme"} Tarihi *
            </label>
            <input type="date" required value={cashedDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setCashedDate(e.target.value)}
              className="field field-sm py-2.5" />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-[rgb(var(--v2-border))] shrink-0">
          <button type="button" onClick={onClose} disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm">
            Vazgeç
          </button>
          <button type="submit" disabled={submitting || !accountId}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isReceived ? "Tahsil Et" : "Öde"}
          </button>
        </div>
      </form>
    </div>
  );
}
