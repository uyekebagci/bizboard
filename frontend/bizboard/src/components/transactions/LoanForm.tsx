"use client";

/**
 * Çatı v1.2 — Verilen/Alınan Borç (LOAN) formu.
 *
 * <p>AddTransactionModal'ın "Borç" sekmesinden tetiklenir. İşlem tipi olarak
 * <b>Verilen Borç</b> (DGR birine para verdi → ALACAK) veya <b>Alınan Borç</b>
 * (DGR birinden para aldı → VERECEK) seçilir + cari/kişi seçimi yapılır.</p>
 *
 * <p>Backend: {@code POST /businesses/{businessId}/loans}. İki kayıt üretir:
 * kasa hareketi (kind=LOAN — Net Kâr'a GİRMEZ, sadece bakiye) + alacak/verecek
 * ({@code Debt}). Geri ödeme MEVCUT cari ödeme akışıyla yapılır.</p>
 *
 * <p>İşaret konvansiyonu (DGR perspektifi): Verilen Borç = ALACAK (+ yeşil/amber),
 * Alınan Borç = VERECEK (− kırmızı). Sonuç Alacaklar/Verecekler sayfalarına yansır.</p>
 */

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, AlertTriangle, HandCoins, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BankAccountListItem, Counterpart, PaymentMethod } from "@/types";
import { DarkSelect } from "@/components/shared/DarkSelect";

type LoanType = "GIVEN" | "TAKEN";

interface LoanResponse {
  loan_type: LoanType;
  transaction_id: string;
  debt_id: string;
  debt_direction: "RECEIVABLE" | "PAYABLE";
  amount: number;
}

interface Props {
  /** İşletme önceden seçili (modal pano'dan açılırken). */
  businessId?: string;
  /** Modal compact mod. */
  compact?: boolean;
  onSuccess?: (loan: LoanResponse) => void;
  onCancel?: () => void;
}

export function LoanForm({ businessId, compact = false, onSuccess, onCancel }: Props) {
  const { triggerRefresh } = useAppStore();

  const [loanType, setLoanType] = useState<LoanType>("GIVEN");
  const [amount, setAmount] = useState("");
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [counterpartId, setCounterpartId] = useState<string>("");
  const [counterpartyName, setCounterpartyName] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, "POS">>("NAKIT");
  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState<string>("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayNotOpen, setDayNotOpen] = useState<string | null>(null);

  useEffect(() => {
    api.get<Counterpart[]>("/counterparts")
      .then((r) => setCounterparts(r || []))
      .catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    api.get<BankAccountListItem[]>("/bank-accounts")
      .then((r) => setAccounts(r || []))
      .catch(() => setAccounts([]));
  }, []);

  // HESAPDAN için uygun hesaplar (kasa/banka konumları).
  const eligibleAccounts = useMemo(
    () => accounts.filter((a) =>
      a.is_active &&
      (!a.business_id || !businessId || a.business_id === businessId) &&
      ["CHECKING", "SAVINGS", "CASH_HOLDER", "MAIN_CASH", "SUB_CASH"].includes(a.type),
    ),
    [accounts, businessId],
  );

  const given = loanType === "GIVEN";
  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDayNotOpen(null);

    if (!parsedAmount || parsedAmount <= 0) { setError("Tutar pozitif olmalı"); return; }
    const trimmedName = counterpartyName.trim();
    if (!counterpartId && !trimmedName) {
      setError("Cari (kişi/firma) seç veya ad gir");
      return;
    }
    if (paymentMethod === "HESAPDAN" && !bankAccountId) {
      setError("Hesaptan ödeme için banka hesabı seç");
      return;
    }

    setSubmitting(true);
    try {
      const dto = await api.post<LoanResponse>(`/businesses/${businessId}/loans`, {
        loan_type: loanType,
        amount: parsedAmount,
        payment_method: paymentMethod,
        bank_account_id: paymentMethod === "HESAPDAN" ? bankAccountId || null : null,
        counterpart_id: counterpartId || null,
        counterparty: trimmedName || null,
        date,
        due_date: dueDate || null,
        description: description.trim() || null,
      });

      triggerRefresh();
      toast.success(given ? "Verilen borç kaydedildi (alacak oluştu)" : "Alınan borç kaydedildi (verecek oluştu)");
      onSuccess?.(dto);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Borç kaydedilemedi";
      // Gün Açılışı enforcement reddi → özel "Günü Aç" yönlendirmesi.
      if (msg.includes("[DAY_NOT_OPEN]")) {
        setDayNotOpen(msg.replace("[DAY_NOT_OPEN]", "").trim());
      } else {
        setError(msg);
      }
      logger.error("api", "loan create failed", { loanType, parsedAmount }, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", compact && "space-y-3")}>
      {/* İşlem tipi: Verilen / Alınan Borç */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setLoanType("GIVEN")}
          className={cn(
            "v2-press py-2.5 rounded-xl font-medium text-sm border-2 transition-colors inline-flex items-center justify-center gap-1.5",
            given
              ? "bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300"
              : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
          )}
        >
          <ArrowUpRight size={14} />
          Verilen Borç
        </button>
        <button
          type="button"
          onClick={() => setLoanType("TAKEN")}
          className={cn(
            "v2-press py-2.5 rounded-xl font-medium text-sm border-2 transition-colors inline-flex items-center justify-center gap-1.5",
            !given
              ? "bg-red-500/15 border-red-500/50 text-red-700 dark:text-red-300"
              : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
          )}
        >
          <ArrowDownLeft size={14} />
          Alınan Borç
        </button>
      </div>

      {/* Açıklayıcı semantik satırı */}
      <div className={cn(
        "p-2.5 rounded-lg border text-xs flex items-start gap-2",
        given
          ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-200"
          : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200",
      )}>
        <HandCoins size={12} className="mt-0.5 shrink-0" />
        <span>
          {given ? (
            <>Birine para <strong>verdiniz</strong> → kasa <strong>düşer</strong>, <strong>ALACAK</strong> oluşur.
              Net Kâr&apos;a girmez (gider değil); geri ödemede alacak kapanır.</>
          ) : (
            <>Birinden para <strong>aldınız</strong> → kasa <strong>artar</strong>, <strong>VERECEK</strong> oluşur.
              Net Kâr&apos;a girmez (gelir değil); ödediğinizde verecek kapanır.</>
          )}
        </span>
      </div>

      {/* Cari (kişi/firma) */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">
          {given ? "Borçlu (kime verildi)" : "Alacaklı (kimden alındı)"} *
        </label>
        <DarkSelect
          value={counterpartId}
          onChange={(v) => {
            setCounterpartId(v);
            const cp = counterparts.find((c) => c.id === v);
            if (cp) setCounterpartyName(cp.name);
          }}
          placeholder="Cari seç (opsiyonel)"
          searchable={counterparts.length > 6}
          options={counterparts
            .filter((c) => !c.business_id || !businessId || c.business_id === businessId)
            .map((c) => ({ value: c.id, label: c.name }))}
        />
        <input
          type="text"
          value={counterpartyName}
          onChange={(e) => { setCounterpartyName(e.target.value); if (counterpartId) setCounterpartId(""); }}
          placeholder="veya ad gir (cari seçilmediyse)"
          maxLength={200}
          className="field field-sm py-2.5 mt-2"
        />
      </div>

      {/* Tutar */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Tutar *</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
            placeholder="0"
            required
            className="field py-3 text-2xl font-bold pr-16"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))] font-medium">TRY</span>
        </div>
      </div>

      {/* Ödeme yöntemi: NAKIT / HESAPDAN */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Kasa Hareketi *</label>
        <div className="grid grid-cols-2 gap-2">
          {(["NAKIT", "HESAPDAN"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={cn(
                "v2-press py-2 rounded-xl text-sm border-2 transition-colors",
                paymentMethod === m
                  ? "border-[rgb(var(--accent))]/60 bg-[rgb(var(--accent))]/12 text-accent-strong dark:text-accent"
                  : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
              )}
            >
              {m === "NAKIT" ? "Nakit" : "Hesaptan"}
            </button>
          ))}
        </div>
      </div>

      {/* HESAPDAN → banka hesabı */}
      {paymentMethod === "HESAPDAN" && (
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Banka/Kasa Hesabı *</label>
          <DarkSelect
            required
            value={bankAccountId}
            onChange={setBankAccountId}
            placeholder="Hesap seç"
            searchable={eligibleAccounts.length > 6}
            options={eligibleAccounts.map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.bank_name || a.type}`,
              meta: formatCurrency(a.current_balance ?? 0, a.currency || "TRY"),
            }))}
          />
        </div>
      )}

      {/* Tarih + Vade */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Tarih *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="field field-sm py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Vade (opsiyonel)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="field field-sm py-2.5"
          />
        </div>
      </div>

      {/* Açıklama */}
      <div>
        <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-1.5">Açıklama</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opsiyonel"
          className="field field-sm py-2.5"
        />
      </div>

      {dayNotOpen && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-200 text-xs flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{dayNotOpen || "Bu tarih için gün açık değil. Önce günü açın."}</span>
        </div>
      )}
      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm"
          >
            Vazgeç
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !businessId}
          className="v2-btn v2-btn--ink flex-1 py-2.5 text-sm gap-2 inline-flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          <HandCoins size={14} />
          {given ? "Borç Ver (Alacak Oluştur)" : "Borç Al (Verecek Oluştur)"}
        </button>
      </div>
    </form>
  );
}
