"use client";

/**
 * v1.7.x WP fbb2ef55: Cari hesap ödeme modalı (PaymentModal).
 *
 * <p>Counterpart detay sayfasından açılır. 4 ödeme yöntemini destekler:
 * NAKIT, HESAPDAN (banka havalesi), CHEQUE, PROMISSORY_NOTE.</p>
 *
 * <p>Allocations opsiyonel — kullanıcı belirli açık alacak/verecek'lere
 * uygulayabilir; verilmezse backend FIFO ile dağıtır. Allocations toplamı
 * payment amount'a eşit olmalı.</p>
 *
 * <p>Submit: POST /counterparts/{id}/payments. 201 → parent refresh.</p>
 */

import { useEffect, useMemo, useState } from "react";
import {
  X, Loader2, Plus, AlertTriangle, ArrowDownLeft, ArrowUpRight,
  Banknote, CreditCard, FileText, Scroll,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import type {
  AccountStatement, BankAccountListItem, CreatePaymentRequest, PaymentDirection,
  PaymentMethodKind, PaymentResponse,
} from "@/types";

interface Props {
  counterpartId: string;
  counterpartName: string;
  /** Modal nasıl açıldı: alacak tahsili ya da verecek ödemesi */
  defaultDirection: PaymentDirection;
  /** Belirli bir debt için ödeme (satırdaki [Tahsilat]/[Öde] butonundan) */
  prefillDebt?: {
    debt_id: string;
    remaining_amount: number;
    original_amount: number;
    description?: string | null;
  };
  /** Sayfadaki açık borçlar (allocation seçimi için) */
  openDebts: AccountStatement["open_debts"];
  onClose: () => void;
  onSuccess?: (resp: PaymentResponse) => void;
}

const METHOD_TABS: Array<{ k: PaymentMethodKind; label: string; icon: typeof Banknote }> = [
  { k: "NAKIT", label: "Nakit", icon: Banknote },
  { k: "HESAPDAN", label: "Banka Havalesi", icon: CreditCard },
  { k: "CHEQUE", label: "Çek", icon: FileText },
  { k: "PROMISSORY_NOTE", label: "Senet", icon: Scroll },
];

export function PaymentModal({
  counterpartId, counterpartName, defaultDirection, prefillDebt,
  openDebts, onClose, onSuccess,
}: Props) {
  const [direction, setDirection] = useState<PaymentDirection>(defaultDirection);
  const [method, setMethod] = useState<PaymentMethodKind>("NAKIT");
  const [amount, setAmount] = useState(prefillDebt ? String(prefillDebt.remaining_amount) : "");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  // HESAPDAN
  const [bankAccounts, setBankAccounts] = useState<BankAccountListItem[]>([]);
  const [bankAccountId, setBankAccountId] = useState<string>("");

  // CHEQUE
  const [chequeNo, setChequeNo] = useState("");
  const [drawerBank, setDrawerBank] = useState("");
  const [drawerBranch, setDrawerBranch] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");

  // NOTE
  const [noteSerial, setNoteSerial] = useState("");
  const [noteDueDate, setNoteDueDate] = useState("");

  // Allocations
  const [useAllocations, setUseAllocations] = useState<boolean>(!!prefillDebt);
  const [allocations, setAllocations] = useState<Record<string, string>>(
    prefillDebt ? { [prefillDebt.debt_id]: String(prefillDebt.remaining_amount) } : {},
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load bank accounts (HESAPDAN için)
  useEffect(() => {
    if (method !== "HESAPDAN") return;
    api.get<BankAccountListItem[]>("/bank-accounts")
      .then((r) => setBankAccounts(r || []))
      .catch(() => {});
  }, [method]);

  // Allocations filter: payment_direction → debt direction
  const targetDirection = direction === "RECEIVED" ? "RECEIVABLE" : "PAYABLE";
  const eligibleDebts = useMemo(
    () => openDebts.filter((d) => d.direction === targetDirection),
    [openDebts, targetDirection],
  );

  const allocSum = useMemo(() => {
    return Object.values(allocations).reduce(
      (a, v) => a + (parseMoneyInput(v) || 0), 0);
  }, [allocations]);

  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);
  const allocMismatch = useAllocations && Math.abs(allocSum - parsedAmount) > 0.005;

  function setAllocAmount(debtId: string, value: string) {
    const cleaned = formatMoneyInput(value);
    setAllocations((prev) => ({ ...prev, [debtId]: cleaned }));
  }

  function toggleAllocDebt(debtId: string) {
    setAllocations((prev) => {
      const next = { ...prev };
      if (next[debtId] != null) {
        delete next[debtId];
      } else {
        const debt = eligibleDebts.find((d) => d.id === debtId);
        if (debt) next[debtId] = String(debt.remaining_amount);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Tutar pozitif olmalı");
      return;
    }
    if (!paymentDate) {
      setError("Ödeme tarihi zorunlu");
      return;
    }
    if (method === "HESAPDAN" && !bankAccountId) {
      setError("Banka havalesi için hesap seçin");
      return;
    }
    if (method === "CHEQUE") {
      if (!chequeNo.trim() || !drawerBank.trim() || !chequeDueDate) {
        setError("Çek için no + banka + vade tarihi zorunlu");
        return;
      }
    }
    if (method === "PROMISSORY_NOTE") {
      if (!noteSerial.trim() || !noteDueDate) {
        setError("Senet için seri no + vade tarihi zorunlu");
        return;
      }
    }
    if (useAllocations) {
      if (allocSum < 0.005) {
        setError("En az bir borç seçilmeli");
        return;
      }
      if (allocMismatch) {
        setError(`Allocations toplamı (${allocSum.toFixed(2)}) tutara eşit olmalı`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const body: CreatePaymentRequest = {
        payment_direction: direction,
        payment_method: method,
        amount: parsedAmount,
        payment_date: paymentDate,
        description: description.trim() || null,
      };
      if (method === "HESAPDAN") body.bank_account_id = bankAccountId;
      if (method === "CHEQUE") {
        body.cheque_details = {
          cheque_number: chequeNo.trim(),
          drawer_bank: drawerBank.trim(),
          drawer_branch: drawerBranch.trim() || null,
          due_date: chequeDueDate,
        };
      }
      if (method === "PROMISSORY_NOTE") {
        body.note_details = {
          note_serial: noteSerial.trim(),
          due_date: noteDueDate,
        };
      }
      if (useAllocations) {
        body.allocations = Object.entries(allocations)
          .filter(([, v]) => parseMoneyInput(v) > 0)
          .map(([debt_id, v]) => ({ debt_id, amount: parseMoneyInput(v) }));
      }
      const resp = await api.post<PaymentResponse>(
        `/counterparts/${counterpartId}/payments`, body);
      toast.success("Ödeme kaydedildi");
      onSuccess?.(resp);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ödeme oluşturulamadı");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  const isReceived = direction === "RECEIVED";
  const eligibleBankAccts = useMemo(
    () => bankAccounts.filter((b) =>
      b.is_active && (b.type === "CHECKING" || b.type === "SAVINGS" || b.type === "CASH_HOLDER")),
    [bankAccounts],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="modal-header">
          <h3 className="text-base font-semibold text-[rgb(var(--v2-ink))] flex items-center gap-2">
            {isReceived ? <ArrowDownLeft size={16} className="text-emerald-700 dark:text-emerald-300" />
                        : <ArrowUpRight size={16} className="text-red-700 dark:text-red-300" />}
            {isReceived ? "Ödeme Al" : "Ödeme Yap"}
          </h3>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            aria-label="Kapat">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Direction toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection("RECEIVED")}
              className={cn("v2-press py-2 rounded-xl text-sm font-medium border-2 inline-flex items-center justify-center gap-1.5",
                isReceived ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                           : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50")}>
              <ArrowDownLeft size={14} /> Ödeme Aldık
            </button>
            <button type="button" onClick={() => setDirection("PAID")}
              className={cn("v2-press py-2 rounded-xl text-sm font-medium border-2 inline-flex items-center justify-center gap-1.5",
                !isReceived ? "bg-red-500/15 border-red-500/50 text-red-700 dark:text-red-300"
                            : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50")}>
              <ArrowUpRight size={14} /> Ödeme Yaptık
            </button>
          </div>

          {/* Counterpart (read-only) */}
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Karşı Taraf</label>
            <div className="px-3 py-2.5 rounded-xl border border-[rgb(var(--v2-border))] v2-sunken text-sm text-[rgb(var(--v2-ink))]">
              {counterpartName}
            </div>
          </div>

          {/* Tutar + Tarih */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Tutar *</label>
              <div className="relative">
                <input
                  type="text" inputMode="numeric" required
                  value={amount}
                  onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                  placeholder="0"
                  className="field field-sm py-2.5 text-lg font-bold"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--v2-muted))] text-sm">TRY</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Tarih *</label>
              <input
                type="date" required value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="field field-sm py-2.5"
              />
            </div>
          </div>

          {/* Method tabs */}
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Ödeme Yöntemi *</label>
            <div className="grid grid-cols-4 gap-2">
              {METHOD_TABS.map(({ k, label, icon: Icon }) => (
                <button
                  key={k} type="button" onClick={() => setMethod(k)}
                  className={cn("v2-press py-2 rounded-xl text-xs font-medium border-2 inline-flex items-center justify-center gap-1",
                    method === k ? "border-[rgb(var(--accent))]/60 bg-[rgb(var(--accent))]/12 text-accent-strong dark:text-accent"
                                 : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50")}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Method-specific fields */}
          {method === "HESAPDAN" && (
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
                {isReceived ? "Yatan Hesap" : "Çıkan Hesap"} *
              </label>
              <DarkSelect
                required
                value={bankAccountId}
                onChange={setBankAccountId}
                placeholder="Hesap seçin"
                searchable={eligibleBankAccts.length > 6}
                options={eligibleBankAccts.map((b) => ({
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
          )}

          {method === "CHEQUE" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Çek No *</label>
                <input type="text" required value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  className="field field-sm py-2.5"
                  placeholder="orn. 123456" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Banka *</label>
                <input type="text" required value={drawerBank}
                  onChange={(e) => setDrawerBank(e.target.value)}
                  className="field field-sm py-2.5"
                  placeholder="orn. Yapı Kredi" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Şube</label>
                <input type="text" value={drawerBranch}
                  onChange={(e) => setDrawerBranch(e.target.value)}
                  className="field field-sm py-2.5"
                  placeholder="opsiyonel" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Vade Tarihi *</label>
                <input type="date" required value={chequeDueDate}
                  onChange={(e) => setChequeDueDate(e.target.value)}
                  className="field field-sm py-2.5" />
              </div>
            </div>
          )}

          {method === "PROMISSORY_NOTE" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Seri No *</label>
                <input type="text" required value={noteSerial}
                  onChange={(e) => setNoteSerial(e.target.value)}
                  className="field field-sm py-2.5"
                  placeholder="orn. S-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Vade Tarihi *</label>
                <input type="date" required value={noteDueDate}
                  onChange={(e) => setNoteDueDate(e.target.value)}
                  className="field field-sm py-2.5" />
              </div>
            </div>
          )}

          {/* Allocation toggle */}
          <div className="border-t border-[rgb(var(--v2-border))] pt-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-[rgb(var(--v2-ink))]">
              <input type="checkbox" checked={useAllocations}
                onChange={(e) => setUseAllocations(e.target.checked)} />
              Belirli {isReceived ? "alacak'lara" : "verecek'lere"} uygula
            </label>
            <p className="text-[10px] text-[rgb(var(--v2-muted))]">
              Seçili değilse backend FIFO (vade yakından) ile dağıtır.
            </p>
            {useAllocations && (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {eligibleDebts.length === 0 && (
                  <p className="text-xs text-[rgb(var(--v2-muted))] text-center py-3">
                    Açık {isReceived ? "alacak" : "verecek"} yok
                  </p>
                )}
                {eligibleDebts.map((d) => {
                  const selected = allocations[d.id] != null;
                  return (
                    <div key={d.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs",
                        selected ? "border-[rgb(var(--accent))]/60 bg-[rgb(var(--accent))]/12 border"
                                 : "v2-sunken")}>
                      <input type="checkbox" checked={selected}
                        onChange={() => toggleAllocDebt(d.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[rgb(var(--v2-ink))] truncate">
                          {d.description || `Borç ${d.id.slice(0, 8)}`}
                        </p>
                        <p className="text-[10px] text-[rgb(var(--v2-muted))]">
                          Kalan: {formatCurrency(d.remaining_amount, "TRY")} / Orijinal {formatCurrency(d.original_amount, "TRY")}
                        </p>
                      </div>
                      {selected && (
                        <input
                          type="text" inputMode="numeric"
                          value={allocations[d.id] || ""}
                          onChange={(e) => setAllocAmount(d.id, e.target.value)}
                          className="w-24 px-2 py-1 rounded border border-[rgb(var(--v2-border))] v2-sunken text-[rgb(var(--v2-ink))] text-xs text-right"
                        />
                      )}
                    </div>
                  );
                })}
                {Object.keys(allocations).length > 0 && (
                  <div className={cn(
                    "flex justify-between px-2 py-1 rounded text-xs font-semibold",
                    allocMismatch ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
                    <span>Toplam allocation</span>
                    <span>{formatCurrency(allocSum, "TRY")} / {formatCurrency(parsedAmount, "TRY")}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              Açıklama <span className="text-[rgb(var(--v2-muted))] font-normal">(opsiyonel)</span>
            </label>
            <textarea value={description}
              onChange={(e) => setDescription(e.target.value)} rows={2}
              className="field field-sm py-2.5 resize-none"
              placeholder="Ödeme notu..." />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm">
            Vazgeç
          </button>
          <button type="submit"
            disabled={submitting || !parsedAmount || parsedAmount <= 0 || allocMismatch}
            className={cn("flex-1 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50",
              isReceived ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {isReceived ? "Tahsil Et" : "Öde"}
          </button>
        </div>
      </form>
    </div>
  );
}
