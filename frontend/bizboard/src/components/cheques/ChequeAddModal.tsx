"use client";

/**
 * v1.7.x: Çek ekleme modalı — /dashboard/cekler sayfasından açılır.
 *
 * <p>Çek = {@code receivable_type=CEK} (alacak) veya {@code instrument_type=CEK}
 * (verecek) ve {@code cheque_due_date} dolu olan debt kaydı. /cheques endpoint'i
 * her ikisini de listeler.</p>
 *
 * <p>Submit: POST /businesses/{businessId}/debts. Counterpart picker
 * CounterpartDebtModal ile aynı pattern: business seç + firma/kişi toggle +
 * "+ Yeni Firma/Kişi" → nested CounterpartCreateModal.</p>
 */

import { useEffect, useMemo, useState } from "react";
import {
  X, Loader2, FileText, AlertTriangle, Building2, User as UserIcon, Plus,
  CalendarClock,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { cn, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import type { Business, Counterpart } from "@/types";
import { CounterpartCreateModal } from "@/components/counterparts/CounterpartCreateModal";
import { DarkSelect } from "@/components/shared/DarkSelect";

type Direction = "RECEIVABLE" | "PAYABLE";
type Kind = "FIRM" | "PERSON";

interface Props {
  /** Önceden seçili işletme — business detay sayfasından açıldıysa. */
  preselectedBusinessId?: string;
  onClose: () => void;
  onSuccess?: (debtId: string) => void;
}

export function ChequeAddModal({
  preselectedBusinessId, onClose, onSuccess,
}: Props) {
  const { triggerRefresh } = useAppStore();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState<string>(preselectedBusinessId ?? "");
  const [loadingBiz, setLoadingBiz] = useState(true);

  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [loadingCps, setLoadingCps] = useState(false);

  const [direction, setDirection] = useState<Direction>("RECEIVABLE");
  const [kind, setKind] = useState<Kind>("FIRM");
  const [counterpartId, setCounterpartId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const isReceivable = direction === "RECEIVABLE";

  useEffect(() => {
    api.get<Business[]>("/businesses")
      .then((r) => {
        setBusinesses(r || []);
        if (!preselectedBusinessId && (r || []).length === 1) {
          setBusinessId(r[0].id);
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => setLoadingBiz(false));
  }, [preselectedBusinessId]);

  useEffect(() => {
    if (!businessId) { setCounterparts([]); return; }
    setLoadingCps(true);
    api.get<Counterpart[]>(`/counterparts?kind=${kind}`)
      .then((r) => {
        const own = (r || []).filter((c) => c.business_id === businessId);
        setCounterparts(own);
      })
      .catch(() => setCounterparts([]))
      .finally(() => setLoadingCps(false));
  }, [businessId, kind]);

  const sortedCps = useMemo(
    () => [...counterparts].sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [counterparts],
  );

  function handleSelectCp(value: string) {
    if (value === "__new__") {
      setShowCreateModal(true);
      return;
    }
    setCounterpartId(value);
  }

  function handleCounterpartCreated(c: Counterpart) {
    setCounterparts((prev) => [...prev, c]);
    setCounterpartId(c.id);
    setShowCreateModal(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!businessId) { setError("İşletme seçin"); return; }
    if (!counterpartId) { setError("Karşı taraf seçin"); return; }
    if (!chequeDueDate) { setError("Vade tarihi zorunlu"); return; }
    if (!chequeNo.trim()) { setError("Çek no zorunlu"); return; }
    const parsedAmount = parseMoneyInput(amount);
    if (!parsedAmount || parsedAmount <= 0) { setError("Tutar pozitif olmalı"); return; }
    const cp = counterparts.find((c) => c.id === counterpartId);
    if (!cp) { setError("Karşı taraf bulunamadı"); return; }

    setSubmitting(true);
    try {
      const r = await api.post<{ id: string }>(`/businesses/${businessId}/debts`, {
        direction,
        counterparty: cp.name,
        counterpart_id: counterpartId,
        amount: parsedAmount,
        currency: "TRY",
        instrument_type: "CEK",
        // RECEIVABLE çek için receivable_type da CEK; PAYABLE için null.
        receivable_type: isReceivable ? "CEK" : null,
        cheque_due_date: chequeDueDate,
        cheque_collector_bank: chequeBank.trim() || null,
        cheque_no: chequeNo.trim(),
        // Backend opsiyonel: due_date'i de cheque_due_date ile eşitle
        due_date: chequeDueDate,
        description: description.trim() || null,
      });
      triggerRefresh();
      onSuccess?.(r.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Çek kaydı başarısız");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 rounded-2xl border border-surface-600 w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <FileText size={16} className="text-purple-300" />
            Yeni Çek Ekle
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-400"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Yön: Alacak / Verecek */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Çek Tipi *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("RECEIVABLE")}
                className={cn(
                  "py-2 rounded-xl text-sm font-medium border-2",
                  isReceivable
                    ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                    : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-500",
                )}
              >
                Alacak Çeki
              </button>
              <button
                type="button"
                onClick={() => setDirection("PAYABLE")}
                className={cn(
                  "py-2 rounded-xl text-sm font-medium border-2",
                  !isReceivable
                    ? "bg-red-500/15 border-red-500/50 text-red-300"
                    : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-500",
                )}
              >
                Verecek Çek
              </button>
            </div>
          </div>

          {/* İşletme (sadece >1 ise) */}
          {!preselectedBusinessId && businesses.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1.5">İşletme *</label>
              {loadingBiz ? (
                <div className="h-10 bg-surface-700 rounded-xl animate-pulse" />
              ) : (
                <DarkSelect
                  required
                  value={businessId}
                  onChange={(v) => { setBusinessId(v); setCounterpartId(""); }}
                  placeholder="İşletme seçin"
                  searchable={businesses.length > 6}
                  options={businesses.map((b) => ({ value: b.id, label: b.name }))}
                />
              )}
            </div>
          )}

          {/* Firma/Kişi */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Karşı Taraf Tipi *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setKind("FIRM"); setCounterpartId(""); }}
                className={cn(
                  "py-2 rounded-xl text-sm font-medium border-2 inline-flex items-center justify-center gap-1.5",
                  kind === "FIRM"
                    ? "bg-brand-500/15 border-brand-500/50 text-brand-300"
                    : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-500",
                )}
              >
                <Building2 size={14} /> Firma
              </button>
              <button
                type="button"
                onClick={() => { setKind("PERSON"); setCounterpartId(""); }}
                className={cn(
                  "py-2 rounded-xl text-sm font-medium border-2 inline-flex items-center justify-center gap-1.5",
                  kind === "PERSON"
                    ? "bg-brand-500/15 border-brand-500/50 text-brand-300"
                    : "bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-500",
                )}
              >
                <UserIcon size={14} /> Kişi
              </button>
            </div>
          </div>

          {/* Karşı Taraf dropdown */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              {isReceivable ? "Çeki Veren" : "Çeki Alan"} ({kind === "FIRM" ? "Firma" : "Kişi"}) *
            </label>
            {loadingCps ? (
              <div className="h-10 bg-surface-700 rounded-xl animate-pulse" />
            ) : (
              <DarkSelect
                required
                value={counterpartId}
                onChange={setCounterpartId}
                disabled={!businessId}
                placeholder={kind === "FIRM" ? "Firma seçin" : "Kişi seçin"}
                searchable={sortedCps.length > 6}
                options={sortedCps.map((c) => ({ value: c.id, label: c.name }))}
                addOption={businessId ? {
                  label: `+ Yeni ${kind === "FIRM" ? "Firma" : "Kişi"} Ekle`,
                  onClick: () => setShowCreateModal(true),
                } : undefined}
              />
            )}
            {!businessId && (
              <p className="mt-1 text-[10px] text-surface-400">Önce işletme seçin</p>
            )}
          </div>

          {/* Tutar */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Tutar *</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                required
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-lg font-bold text-white placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm font-medium">TRY</span>
            </div>
          </div>

          {/* Vade Tarihi */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              <CalendarClock size={12} className="inline mr-1" />
              Vade Tarihi *
            </label>
            <input
              type="date"
              required
              value={chequeDueDate}
              onChange={(e) => setChequeDueDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Çek No */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">Çek No *</label>
            <input
              type="text"
              required
              value={chequeNo}
              onChange={(e) => setChequeNo(e.target.value)}
              placeholder="orn. 12345678"
              maxLength={40}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Banka */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              {isReceivable ? "Tahsil Bankası" : "Düzenleyen Banka"}{" "}
              <span className="text-surface-400 font-normal">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={chequeBank}
              onChange={(e) => setChequeBank(e.target.value)}
              placeholder="orn. Garanti BBVA"
              maxLength={80}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Açıklama <span className="text-surface-400 font-normal">(opsiyonel)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              placeholder="Çek ile ilgili not..."
            />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium border border-surface-600 disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting || !businessId || !counterpartId || !amount || !chequeDueDate || !chequeNo.trim()}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50",
              "bg-purple-600 hover:bg-purple-700",
            )}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Çek Ekle
          </button>
        </div>
      </form>
    </div>

    {showCreateModal && businessId && (
      <CounterpartCreateModal
        kind={kind}
        businessId={businessId}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCounterpartCreated}
      />
    )}
    </>
  );
}
