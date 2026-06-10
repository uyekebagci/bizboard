"use client";

/**
 * v1.7.0.x: /dashboard/add-transaction/transfer — 4-mode transfer page.
 *
 * <p>Modlar:</p>
 * <ul>
 *   <li><b>İç Transfer</b>: aynı firma içi paired (POST /transfers
 *       to_bank_account_id ile).</li>
 *   <li><b>Firmalarım Arası</b>: farklı firma paired (POST /transfers).</li>
 *   <li><b>Gelen Havale</b>: dış kaynaktan kendi hesabımıza income
 *       (POST /transactions kind=NORMAL, payment_method=HESAPDAN).</li>
 *   <li><b>Giden Havale</b>: kendi hesabımızdan dış hedefe expense
 *       (POST /transactions kind=NORMAL, payment_method=HESAPDAN).</li>
 * </ul>
 *
 * <p>Backend dokunulmadı — tüm mod'lar mevcut endpoint'ler. Aynı firma
 * vs farklı firma sınıflandırması yalnız UI tarafında.</p>
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Loader2,
  AlertTriangle, CheckCircle2, Building2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import type { BankAccountListItem, MyCompany, Counterpart } from "@/types";

type Mode = "internal" | "cross_firm" | "incoming" | "outgoing";

const MODES: { value: Mode; label: string; icon: typeof ArrowLeftRight; color: string }[] = [
  { value: "internal", label: "İç Transfer", icon: ArrowLeftRight, color: "blue" },
  { value: "cross_firm", label: "Firmalarım Arası", icon: ArrowLeftRight, color: "purple" },
  { value: "incoming", label: "Gelen Havale", icon: ArrowDownLeft, color: "emerald" },
  { value: "outgoing", label: "Giden Havale", icon: ArrowUpRight, color: "rose" },
];

const ELIGIBLE_TYPES: ReadonlyArray<string> = ["CHECKING", "SAVINGS", "CASH_HOLDER"];

export default function TransferModePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("internal");
  const [formKey, setFormKey] = useState(0);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [firms, setFirms] = useState<MyCompany[]>([]);
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<BankAccountListItem[]>("/bank-accounts").catch(() => [] as BankAccountListItem[]),
      api.get<MyCompany[]>("/firms").catch(() => [] as MyCompany[]),
      api.get<Counterpart[]>("/counterparts").catch(() => [] as Counterpart[]),
    ])
      .then(([accs, fs, cps]) => {
        setAccounts((accs || []).filter((a) => a.is_active && ELIGIBLE_TYPES.includes(a.type)));
        setFirms(fs || []);
        setCounterparts(cps || []);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
      setFormKey((k) => k + 1);
    }, 1500);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/dashboard/add-transaction")}
            className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
            aria-label="Tip seçimine dön"
          >
            <ArrowLeft size={20} className="text-surface-300" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <ArrowLeftRight size={20} className="text-purple-300 shrink-0" />
            <h1 className="text-xl font-bold text-surface-100 truncate">Yeni Transfer</h1>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-surface-400 hover:text-surface-200 whitespace-nowrap"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => { setMode(m.value); setFormKey((k) => k + 1); }}
              className={cn(
                "flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium border-2 transition-all",
                active
                  ? colorClass(m.color)
                  : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-500 hover:text-surface-100",
              )}
            >
              <Icon size={13} />
              {m.label}
            </button>
          );
        })}
      </div>

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-surface-500" />
        </div>
      ) : (
        <div key={formKey}>
          {mode === "internal" && (
            <InternalTransferForm
              accounts={accounts}
              onSuccess={() => handleSuccess("İç transfer oluşturuldu.")}
            />
          )}
          {mode === "cross_firm" && (
            <CrossFirmTransferForm
              accounts={accounts}
              firms={firms}
              onSuccess={() => handleSuccess("Firmalar arası transfer oluşturuldu.")}
            />
          )}
          {mode === "incoming" && (
            <BankTransferIO
              direction="income"
              accounts={accounts}
              firms={firms}
              counterparts={counterparts}
              onSuccess={() => handleSuccess("Gelen havale kaydedildi.")}
            />
          )}
          {mode === "outgoing" && (
            <BankTransferIO
              direction="expense"
              accounts={accounts}
              firms={firms}
              counterparts={counterparts}
              onSuccess={() => handleSuccess("Giden havale kaydedildi.")}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

function InternalTransferForm({ accounts, onSuccess }: {
  accounts: BankAccountListItem[];
  onSuccess: () => void;
}) {
  const { triggerRefresh } = useAppStore();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromAcc = useMemo(() => accounts.find((a) => a.id === fromId) || null, [accounts, fromId]);
  const toOptions = useMemo(() => {
    if (!fromAcc) return [];
    return accounts.filter((a) =>
      a.id !== fromAcc.id
      && a.owner_my_company_id === fromAcc.owner_my_company_id,
    );
  }, [accounts, fromAcc]);

  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);
  const balanceWarn = !!(fromAcc && parsedAmount > 0 && parsedAmount > (fromAcc.current_balance ?? 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromId || !toId) { setError("Hesapları seç"); return; }
    if (parsedAmount <= 0) { setError("Tutar pozitif olmalı"); return; }
    setSubmitting(true);
    try {
      await api.post("/transfers", {
        from_bank_account_id: fromId,
        to_bank_account_id: toId,
        amount: parsedAmount,
        date,
        description: description.trim() || null,
      });
      triggerRefresh();
      toast.success("Transfer tamamlandı");
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer oluşturulamadı");
      logger.error("api", "internal transfer failed", undefined, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Info icon={ArrowLeftRight} text="Aynı firma içi hesaplar arası transfer. İki tx oluşur (OUT + IN), bakiyeler atomic güncellenir." color="blue" />

      <BankSelect label="Kaynak Hesap *" value={fromId} onChange={(v) => { setFromId(v); setToId(""); }} options={accounts} />
      {fromAcc && (
        <Hint>
          Bakiye: <strong>{formatCurrency(fromAcc.current_balance ?? 0, fromAcc.currency || "TRY")}</strong>
          {fromAcc.owner_my_company_name && (
            <> · 🏢 {fromAcc.owner_my_company_name}</>
          )}
        </Hint>
      )}

      <BankSelect label="Hedef Hesap *" value={toId} onChange={setToId} options={toOptions}
        placeholder={!fromAcc ? "Önce kaynak seç" : toOptions.length === 0 ? "Bu firmada başka hesap yok" : "Hesap seç"} />

      <AmountDateDesc amount={amount} setAmount={setAmount} date={date} setDate={setDate}
        description={description} setDescription={setDescription} currency={fromAcc?.currency || "TRY"} />

      {balanceWarn && <BalanceWarn />}
      {error && <ErrorBanner msg={error} />}

      <SubmitButton submitting={submitting} disabled={!fromId || !toId || parsedAmount <= 0} color="blue" label="Transfer Et" />
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────

function CrossFirmTransferForm({ accounts, firms, onSuccess }: {
  accounts: BankAccountListItem[];
  firms: MyCompany[];
  onSuccess: () => void;
}) {
  const { triggerRefresh } = useAppStore();
  const [fromFirmId, setFromFirmId] = useState("");
  const [fromBankId, setFromBankId] = useState("");
  const [toFirmId, setToFirmId] = useState("");
  const [toBankId, setToBankId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromAccounts = useMemo(
    () => fromFirmId ? accounts.filter((a) => a.owner_my_company_id === fromFirmId) : [],
    [accounts, fromFirmId],
  );
  const toAccounts = useMemo(
    () => toFirmId ? accounts.filter((a) => a.owner_my_company_id === toFirmId) : [],
    [accounts, toFirmId],
  );
  const toFirms = useMemo(() => firms.filter((f) => f.id !== fromFirmId), [firms, fromFirmId]);
  const fromAcc = useMemo(() => accounts.find((a) => a.id === fromBankId) || null, [accounts, fromBankId]);

  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);
  const balanceWarn = !!(fromAcc && parsedAmount > 0 && parsedAmount > (fromAcc.current_balance ?? 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromBankId || !toBankId) { setError("İki hesabı da seç"); return; }
    if (fromFirmId === toFirmId) { setError("Aynı firma için 'İç Transfer' kullan"); return; }
    if (parsedAmount <= 0) { setError("Tutar pozitif olmalı"); return; }
    setSubmitting(true);
    try {
      await api.post("/transfers", {
        from_bank_account_id: fromBankId,
        to_bank_account_id: toBankId,
        amount: parsedAmount,
        date,
        description: description.trim() || null,
      });
      triggerRefresh();
      toast.success("Transfer tamamlandı");
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer oluşturulamadı");
      logger.error("api", "cross-firm transfer failed", undefined, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Info icon={Building2} text="Aynı işletme içindeki farklı firmalar arası transfer. Backend internal paired tx (OUT + IN)." color="purple" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Gönderen Firma *</Label>
          <DarkSelect
            value={fromFirmId}
            onChange={(v) => { setFromFirmId(v); setFromBankId(""); if (v === toFirmId) setToFirmId(""); }}
            placeholder="Firma seç"
            searchable={firms.length > 6}
            options={firms.map((f) => ({ value: f.id, label: f.legal_name }))}
          />
        </div>
        <div>
          <Label>Alıcı Firma *</Label>
          <DarkSelect
            value={toFirmId}
            onChange={(v) => { setToFirmId(v); setToBankId(""); }}
            placeholder={!fromFirmId ? "Önce gönderen seç" : toFirms.length === 0 ? "Başka firma yok" : "Firma seç"}
            searchable={toFirms.length > 6}
            options={toFirms.map((f) => ({ value: f.id, label: f.legal_name }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BankSelect label="Gönderen Hesap *" value={fromBankId} onChange={setFromBankId} options={fromAccounts}
          placeholder={!fromFirmId ? "Önce firma seç" : fromAccounts.length === 0 ? "Bu firmada hesap yok" : "Hesap seç"} />
        <BankSelect label="Alıcı Hesap *" value={toBankId} onChange={setToBankId} options={toAccounts}
          placeholder={!toFirmId ? "Önce alıcı firma seç" : toAccounts.length === 0 ? "Bu firmada hesap yok" : "Hesap seç"} />
      </div>

      {fromAcc && (
        <Hint>
          Kaynak Bakiye: <strong>{formatCurrency(fromAcc.current_balance ?? 0, fromAcc.currency || "TRY")}</strong>
        </Hint>
      )}

      <AmountDateDesc amount={amount} setAmount={setAmount} date={date} setDate={setDate}
        description={description} setDescription={setDescription} currency={fromAcc?.currency || "TRY"} />

      {balanceWarn && <BalanceWarn />}
      {error && <ErrorBanner msg={error} />}

      <SubmitButton submitting={submitting}
        disabled={!fromBankId || !toBankId || fromFirmId === toFirmId || parsedAmount <= 0}
        color="purple" label="Firmalar Arası Transfer" />
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────

function BankTransferIO({ direction, accounts, firms, counterparts, onSuccess }: {
  direction: "income" | "expense";
  accounts: BankAccountListItem[];
  firms: MyCompany[];
  counterparts: Counterpart[];
  onSuccess: () => void;
}) {
  const { triggerRefresh } = useAppStore();
  const [firmId, setFirmId] = useState("");
  const [bankId, setBankId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredAccounts = useMemo(
    () => firmId ? accounts.filter((a) => a.owner_my_company_id === firmId) : accounts,
    [accounts, firmId],
  );
  const selectedAcc = useMemo(() => accounts.find((a) => a.id === bankId) || null, [accounts, bankId]);
  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);
  const isIncoming = direction === "income";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bankId || !selectedAcc) { setError("Hesap seç"); return; }
    if (parsedAmount <= 0) { setError("Tutar pozitif olmalı"); return; }
    if (!selectedAcc.business_id) { setError("Hesabın business bilgisi eksik"); return; }
    setSubmitting(true);
    try {
      await api.post(`/businesses/${selectedAcc.business_id}/transactions`, {
        direction,
        amount: parsedAmount,
        description: description.trim() || null,
        date,
        payment_method: "HESAPDAN",
        bank_account_id: bankId,
        target_counterpart_id: counterpartId || null,
      });
      triggerRefresh();
      toast.success(direction === "income" ? "Gelir kaydedildi" : "Gider kaydedildi");
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "İşlem oluşturulamadı");
      logger.error("api", "bank-transfer-io failed", { direction }, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Info
        icon={isIncoming ? ArrowDownLeft : ArrowUpRight}
        text={
          isIncoming
            ? "Dış kaynaktan kendi hesabımıza gelen havale. NORMAL income tx oluşur (konsolide net'e dahil)."
            : "Kendi hesabımızdan dış hedefe giden havale. NORMAL expense tx oluşur."
        }
        color={isIncoming ? "emerald" : "rose"}
      />

      <div>
        <Label>{isIncoming ? "Alıcı" : "Gönderen"} Firma (opsiyonel filter)</Label>
        <DarkSelect
          value={firmId}
          onChange={(v) => { setFirmId(v); setBankId(""); }}
          placeholder="Tüm firmalar"
          searchable={firms.length > 6}
          options={[
            { value: "", label: "Tüm firmalar (filtre yok)" },
            ...firms.map((f) => ({ value: f.id, label: f.legal_name })),
          ]}
        />
      </div>

      <BankSelect label={isIncoming ? "Hedef Hesap (bizim) *" : "Kaynak Hesap (bizim) *"}
        value={bankId} onChange={setBankId} options={filteredAccounts} />

      {selectedAcc && (
        <Hint>
          Bakiye: <strong>{formatCurrency(selectedAcc.current_balance ?? 0, selectedAcc.currency || "TRY")}</strong>
          {selectedAcc.owner_my_company_name && <> · 🏢 {selectedAcc.owner_my_company_name}</>}
        </Hint>
      )}

      <AmountDateDesc amount={amount} setAmount={setAmount} date={date} setDate={setDate}
        description={description} setDescription={setDescription} currency={selectedAcc?.currency || "TRY"} />

      <div>
        <Label>{isIncoming ? "Gönderen" : "Alıcı"} (opsiyonel)</Label>
        <DarkSelect
          value={counterpartId}
          onChange={setCounterpartId}
          placeholder="Karşı taraf seç (opsiyonel)"
          searchable={counterparts.length > 6}
          options={[
            { value: "", label: "Yok / kayıtsız" },
            ...counterparts.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>

      {error && <ErrorBanner msg={error} />}

      <SubmitButton submitting={submitting}
        disabled={!bankId || parsedAmount <= 0}
        color={isIncoming ? "emerald" : "rose"}
        label={isIncoming ? "Gelen Havaleyi Kaydet" : "Giden Havaleyi Kaydet"} />
    </form>
  );
}

// ─────────── Shared mini components ───────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-surface-200 mb-1.5">{children}</label>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-surface-400 -mt-2">{children}</p>;
}

function Info({ icon: Icon, text, color }: { icon: typeof ArrowLeftRight; text: string; color: string }) {
  return (
    <div className={cn("p-2.5 rounded-lg border text-xs flex items-start gap-2", infoBg(color))}>
      <Icon size={12} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function BankSelect({ label, value, onChange, options, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: BankAccountListItem[];
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <DarkSelect
        value={value}
        onChange={onChange}
        placeholder={placeholder || "Hesap seç"}
        searchable={options.length > 6}
        options={options.map((a) => ({
          value: a.id,
          label: `${a.name}${a.bank_name ? " · " + a.bank_name : ""}`,
          meta: formatCurrency(a.current_balance ?? 0, a.currency || "TRY"),
        }))}
      />
    </div>
  );
}

function AmountDateDesc({ amount, setAmount, date, setDate, description, setDescription, currency }: {
  amount: string;
  setAmount: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  currency: string;
}) {
  return (
    <>
      <div>
        <Label>Tutar *</Label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
            placeholder="0"
            required
            className="field py-3 text-2xl font-bold"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 font-medium">
            {currency}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Tarih *</Label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="field field-sm py-2.5"
          />
        </div>
        <div>
          <Label>Açıklama (opsiyonel)</Label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Not, referans no..."
            className="field field-sm py-2.5"
          />
        </div>
      </div>
    </>
  );
}

function BalanceWarn() {
  return (
    <p className="text-[11px] text-amber-300 flex items-center gap-1">
      <AlertTriangle size={10} />
      Bakiye yetersiz; transfer yine yapılabilir, kaynak hesap negatife düşer.
    </p>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      {msg}
    </div>
  );
}

function SubmitButton({ submitting, disabled, color, label }: {
  submitting: boolean;
  disabled: boolean;
  color: string;
  label: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-600 hover:bg-blue-500",
    purple: "bg-purple-600 hover:bg-purple-500",
    emerald: "bg-emerald-600 hover:bg-emerald-500",
    rose: "bg-rose-600 hover:bg-rose-500",
  };
  return (
    <button
      type="submit"
      disabled={submitting || disabled}
      className={cn(
        "w-full py-3 rounded-xl text-surface-100 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-all",
        colorClasses[color] || "bg-brand-600 hover:bg-brand-500",
      )}
    >
      {submitting && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  );
}

function colorClass(color: string): string {
  const active: Record<string, string> = {
    blue: "bg-blue-500/15 border-blue-500/50 text-blue-300",
    purple: "bg-purple-500/15 border-purple-500/50 text-purple-300",
    emerald: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300",
    rose: "bg-rose-500/15 border-rose-500/50 text-rose-300",
  };
  return active[color] || "bg-surface-600 border-surface-500 text-surface-100";
}

function infoBg(color: string): string {
  const map: Record<string, string> = {
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-200",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-200",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-200",
    rose: "bg-rose-500/10 border-rose-500/30 text-rose-200",
  };
  return map[color] || "bg-surface-700 border-surface-600 text-surface-300";
}
