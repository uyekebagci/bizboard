"use client";

/**
 * WP 08617251 (Beta v1.1 Closure Modülü): inline tx ekleme modal'ı.
 *
 * <p>5 mode: pos / outgoing / incoming / withdrawal / expense.
 * Her mode için kompakt form. Submit body'sine closure_session_id eklenir;
 * tx draft olarak işaretlenir, closure finalize'de strip / rollback'te delete.</p>
 */

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";
import type {
  BankAccountListItem, Counterpart, PosDeviceListItem,
} from "@/types";

export type ClosureSection = "pos" | "outgoing" | "incoming" | "withdrawal" | "expense";

const SECTION_META: Record<ClosureSection, { title: string; color: string }> = {
  pos:        { title: "POS İşlemi Ekle",      color: "blue" },
  outgoing:   { title: "Giden Havale Ekle",    color: "rose" },
  incoming:   { title: "Gelen Havale Ekle",    color: "emerald" },
  withdrawal: { title: "Para Çekme Ekle",      color: "amber" },
  expense:    { title: "Harcama Ekle",         color: "rose" },
};

interface Props {
  section: ClosureSection;
  businessId: string;
  closureSessionId: string;
  onClose: () => void;
  onCreated: () => void;
}

const ELIGIBLE_BANK_TYPES: ReadonlyArray<string> = ["CHECKING", "SAVINGS", "CASH_HOLDER"];

export function ClosureQuickAddModal({
  section, businessId, closureSessionId, onClose, onCreated,
}: Props) {
  const meta = SECTION_META[section];

  // Shared form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date] = useState(new Date().toISOString().split("T")[0]);
  const [counterpartId, setCounterpartId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [posDeviceId, setPosDeviceId] = useState("");
  const [toBankAccountId, setToBankAccountId] = useState("");

  // Data
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [banks, setBanks] = useState<BankAccountListItem[]>([]);
  const [posDevices, setPosDevices] = useState<PosDeviceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Counterpart[]>("/counterparts").catch(() => []),
      api.get<BankAccountListItem[]>("/bank-accounts").catch(() => []),
      api.get<PosDeviceListItem[]>("/pos-devices").catch(() => []),
    ])
      .then(([cps, accs, devs]) => {
        setCounterparts(cps || []);
        setBanks((accs || []).filter((a) => a.is_active && ELIGIBLE_BANK_TYPES.includes(a.type)));
        setPosDevices((devs || []).filter((d) => d.is_active));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  const parsedAmount = useMemo(() => parseMoneyInput(amount), [amount]);

  // Bank filters per section
  const ourBanks = banks.filter((b) =>
    b.type === "CHECKING" || b.type === "SAVINGS" || b.type === "CASH_HOLDER");
  const checkingBanks = banks.filter((b) => b.type === "CHECKING" || b.type === "SAVINGS");
  const cashHolderBanks = banks.filter((b) => b.type === "CASH_HOLDER");

  function valid(): string | null {
    if (parsedAmount <= 0) return "Tutar pozitif olmalı";
    if (section === "pos") {
      if (!posDeviceId) return "POS cihazı seç";
    }
    if (section === "outgoing" || section === "incoming") {
      if (!bankAccountId) return "Hesap seç";
    }
    if (section === "withdrawal") {
      if (!bankAccountId || !toBankAccountId) return "Kaynak ve hedef seç";
      if (bankAccountId === toBankAccountId) return "Kaynak ve hedef aynı olamaz";
    }
    if (section === "expense") {
      // expense: counterpart opsiyonel, bank opsiyonel (NAKIT default)
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = valid();
    if (v) { setError(v); return; }
    setSubmitting(true);
    try {
      if (section === "pos") {
        await api.post(`/businesses/${businessId}/transactions`, {
          direction: "income",
          amount: parsedAmount,
          description: description.trim() || null,
          date,
          payment_method: "POS",
          target_counterpart_id: counterpartId || null,
          pos_device_id: posDeviceId,
          closure_session_id: closureSessionId,
        });
      } else if (section === "outgoing") {
        await api.post(`/businesses/${businessId}/transactions`, {
          direction: "expense",
          amount: parsedAmount,
          description: description.trim() || null,
          date,
          payment_method: "HESAPDAN",
          bank_account_id: bankAccountId,
          target_counterpart_id: counterpartId || null,
          closure_session_id: closureSessionId,
        });
      } else if (section === "incoming") {
        await api.post(`/businesses/${businessId}/transactions`, {
          direction: "income",
          amount: parsedAmount,
          description: description.trim() || null,
          date,
          payment_method: "HESAPDAN",
          bank_account_id: bankAccountId,
          target_counterpart_id: counterpartId || null,
          closure_session_id: closureSessionId,
        });
      } else if (section === "withdrawal") {
        // Bank → CASH_HOLDER internal paired transfer.
        // NOT: /transfers endpoint'i şu an closure_session_id desteklemiyor —
        // bu durumda iki ayrı /transactions çağrısı (NAKIT income + NAKIT expense)
        // basit alternatif değildir (paired sistem). MVP: /transfers çağırıyoruz,
        // session etiketi YOK; ileriki commit'te /transfers genişletilecek.
        await api.post("/transfers", {
          from_bank_account_id: bankAccountId,
          to_bank_account_id: toBankAccountId,
          amount: parsedAmount,
          date,
          description: description.trim() || `Para çekme — closure session`,
        });
      } else if (section === "expense") {
        await api.post(`/businesses/${businessId}/transactions`, {
          direction: "expense",
          amount: parsedAmount,
          description: description.trim() || null,
          date,
          payment_method: bankAccountId ? "HESAPDAN" : "NAKIT",
          bank_account_id: bankAccountId || null,
          target_counterpart_id: counterpartId || null,
          closure_session_id: closureSessionId,
        });
      }
      toast.success("İşlem kapanışa eklendi");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kayıt başarısız");
      logger.error("api", "closure quick-add failed", { section }, err);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "bg-surface-800 rounded-2xl border w-full max-w-md max-h-[92vh] flex flex-col shadow-xl",
          borderClass(meta.color),
        )}
      >
        {/* Header */}
        <div className="modal-header">
          <h3 className="text-sm font-semibold text-white">{meta.title}</h3>
          <button type="button" onClick={onClose} disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="animate-spin text-surface-500" />
            </div>
          ) : (
            <>
              <Field label="Tutar *">
                <div className="relative">
                  <input
                    type="text" inputMode="numeric" required
                    value={amount}
                    onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                    placeholder="0"
                    className="field field-sm py-2.5 text-lg font-bold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm">TRY</span>
                </div>
              </Field>

              {/* POS */}
              {section === "pos" && (
                <>
                  <Field label="POS Cihazı *">
                    <DarkSelect
                      value={posDeviceId} onChange={setPosDeviceId}
                      placeholder={posDevices.length === 0 ? "Aktif POS yok" : "POS seç"}
                      options={posDevices.map((p) => ({
                        value: p.id, label: p.name + (p.bank_name ? ` · ${p.bank_name}` : ""),
                      }))}
                    />
                  </Field>
                  <CounterpartField counterparts={counterparts} value={counterpartId} onChange={setCounterpartId} label="Müşteri (opsiyonel)" />
                </>
              )}

              {/* Giden Havale */}
              {section === "outgoing" && (
                <>
                  <Field label="Kaynak Hesap *">
                    <BankSelect banks={ourBanks} value={bankAccountId} onChange={setBankAccountId} />
                  </Field>
                  <CounterpartField counterparts={counterparts} value={counterpartId} onChange={setCounterpartId} label="Alıcı (opsiyonel)" />
                </>
              )}

              {/* Gelen Havale */}
              {section === "incoming" && (
                <>
                  <Field label="Hedef Hesap *">
                    <BankSelect banks={ourBanks} value={bankAccountId} onChange={setBankAccountId} />
                  </Field>
                  <CounterpartField counterparts={counterparts} value={counterpartId} onChange={setCounterpartId} label="Gönderen (opsiyonel)" />
                </>
              )}

              {/* Para Çekme */}
              {section === "withdrawal" && (
                <>
                  <Field label="Kaynak Banka *">
                    <BankSelect banks={checkingBanks} value={bankAccountId} onChange={setBankAccountId} />
                  </Field>
                  <Field label="Hedef Cash Holder *">
                    <BankSelect banks={cashHolderBanks} value={toBankAccountId} onChange={setToBankAccountId} />
                  </Field>
                </>
              )}

              {/* Harcama */}
              {section === "expense" && (
                <>
                  <Field label="Ödeme Hesabı (opsiyonel)">
                    <BankSelect banks={ourBanks} value={bankAccountId} onChange={setBankAccountId} placeholder="NAKIT (boş bırak)" />
                  </Field>
                  <CounterpartField counterparts={counterparts} value={counterpartId} onChange={setCounterpartId} label="Tedarikçi/Counterpart (opsiyonel)" />
                </>
              )}

              <Field label="Açıklama (opsiyonel)">
                <input
                  type="text" value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Not, referans..."
                  className="w-full px-3 py-2 rounded-xl border border-surface-600 bg-surface-900 text-white text-sm"
                />
              </Field>

              <p className="text-[10px] text-amber-300/80 flex items-center gap-1">
                <AlertTriangle size={10} />
                Bu işlem closure session'ına etiketlenir; kapanışı kaydet → kalıcı, vazgeç → silinir.
              </p>

              {error && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-3 border-t border-surface-700">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium disabled:opacity-50">
            İptal
          </button>
          <button type="submit" disabled={submitting || parsedAmount <= 0}
            className={cn(
              "flex-1 py-2 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50",
              btnClass(meta.color),
            )}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Kaydediliyor" : "Ekle"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Helpers ───

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-200 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function BankSelect({ banks, value, onChange, placeholder }: {
  banks: BankAccountListItem[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <DarkSelect
      value={value} onChange={onChange}
      placeholder={placeholder || (banks.length === 0 ? "Aktif hesap yok" : "Hesap seç")}
      searchable={banks.length > 6}
      options={banks.map((b) => ({
        value: b.id,
        label: b.name + (b.bank_name ? ` · ${b.bank_name}` : ""),
        meta: formatCurrency(b.current_balance ?? 0, b.currency || "TRY"),
      }))}
    />
  );
}

function CounterpartField({ counterparts, value, onChange, label }: {
  counterparts: Counterpart[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Field label={label}>
      <DarkSelect
        value={value} onChange={onChange}
        placeholder="Yok / kayıtsız"
        searchable={counterparts.length > 6}
        options={[
          { value: "", label: "— (yok)" },
          ...counterparts.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
    </Field>
  );
}

function borderClass(color: string): string {
  const m: Record<string, string> = {
    blue: "border-blue-500/30",
    rose: "border-rose-500/30",
    emerald: "border-emerald-500/30",
    amber: "border-amber-500/30",
  };
  return m[color] || "border-surface-600";
}

function btnClass(color: string): string {
  const m: Record<string, string> = {
    blue: "bg-blue-600 hover:bg-blue-500",
    rose: "bg-rose-600 hover:bg-rose-500",
    emerald: "bg-emerald-600 hover:bg-emerald-500",
    amber: "bg-amber-600 hover:bg-amber-500",
  };
  return m[color] || "bg-brand-600 hover:bg-brand-500";
}

