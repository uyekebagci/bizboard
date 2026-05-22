"use client";

/**
 * v1.7.x (UI Fix WP 8b961444 TODOs 2c83bc5c + 1d5d526b): Alacak/Verecek
 * ekleme modalı — SHARED komponent.
 *
 * <p>Alacaklar sayfasındaki '+ Alacak Ekle' ve Verecekler sayfasındaki
 * '+ Verecek Ekle' butonları bu modal'ı açar; sadece <code>direction</code>
 * prop'u (RECEIVABLE/PAYABLE) farklıdır.</p>
 *
 * <p>Alanlar:
 * <ul>
 *   <li>Firma/Kişi radio toggle</li>
 *   <li>Karşı Taraf dropdown (kind + business_id filtreli) +
 *       sonunda '+ Yeni Firma/Kişi Ekle' → nested CounterpartCreateModal</li>
 *   <li>Tutar (decimal, > 0)</li>
 *   <li>Vade Tarihi (opsiyonel)</li>
 *   <li>Açıklama (opsiyonel)</li>
 * </ul></p>
 *
 * <p>Submit: POST /businesses/{businessId}/debts. business_id modal
 * içinde resolve edilir — kullanıcının erişebildiği businesses listesinden
 * (tek varsa auto-select).</p>
 */

import { useEffect, useMemo, useState } from "react";
import {
  X, Loader2, HandCoins, AlertTriangle, Building2, User as UserIcon, Plus,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { cn, formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import type { Business, Counterpart } from "@/types";
import { CounterpartCreateModal } from "@/components/counterparts/CounterpartCreateModal";

type Direction = "RECEIVABLE" | "PAYABLE";
type Kind = "FIRM" | "PERSON";

interface Props {
  direction: Direction;
  /** Önceden seçili işletme (örn. business detay sayfasından açıldıysa). */
  preselectedBusinessId?: string;
  onClose: () => void;
  onSuccess?: (debtId: string) => void;
}

export function CounterpartDebtModal({
  direction, preselectedBusinessId, onClose, onSuccess,
}: Props) {
  const { triggerRefresh } = useAppStore();
  const isReceivable = direction === "RECEIVABLE";
  const label = isReceivable ? "Alacak" : "Verecek";

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState<string>(preselectedBusinessId ?? "");
  const [loadingBiz, setLoadingBiz] = useState(true);

  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [loadingCps, setLoadingCps] = useState(false);

  const [kind, setKind] = useState<Kind>("FIRM");
  const [counterpartId, setCounterpartId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);

  // Load businesses (1 ise auto-select)
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

  // Load counterparts when business + kind changes
  useEffect(() => {
    if (!businessId) {
      setCounterparts([]);
      return;
    }
    setLoadingCps(true);
    api.get<Counterpart[]>(`/counterparts?kind=${kind}`)
      .then((r) => {
        // Cross-tenant: backend zaten filtreliyor ama defansif
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
    const parsedAmount = parseMoneyInput(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Tutar pozitif olmalı");
      return;
    }
    const cp = counterparts.find((c) => c.id === counterpartId);
    if (!cp) { setError("Karşı taraf bulunamadı"); return; }

    setSubmitting(true);
    try {
      const r = await api.post<{ id: string }>(`/businesses/${businessId}/debts`, {
        direction,
        counterparty: cp.name,        // legacy free-text (auto-filled from cp.name)
        counterpart_id: counterpartId,
        amount: parsedAmount,
        currency: "TRY",
        instrument_type: isReceivable ? "NAKIT" : "NAKIT", // default; ileride seçim
        receivable_type: isReceivable ? "NAKIT" : null,
        due_date: dueDate || null,
        description: description.trim() || null,
      });
      triggerRefresh();
      onSuccess?.(r.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kayıt başarısız");
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
            <HandCoins size={16} className={isReceivable ? "text-amber-300" : "text-red-300"} />
            Yeni {label} Ekle
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

          {/* Business (1 değilse göster) */}
          {!preselectedBusinessId && businesses.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-surface-200 mb-1.5">İşletme *</label>
              {loadingBiz ? (
                <div className="h-10 bg-surface-700 rounded-xl animate-pulse" />
              ) : (
                <select
                  required
                  value={businessId}
                  onChange={(e) => { setBusinessId(e.target.value); setCounterpartId(""); }}
                  className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Seçin</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Firma/Kişi radio */}
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
                <Building2 size={14} />
                Firma
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
                <UserIcon size={14} />
                Kişi
              </button>
            </div>
          </div>

          {/* Karşı Taraf dropdown */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Karşı Taraf ({kind === "FIRM" ? "Firma" : "Kişi"}) *
            </label>
            {loadingCps ? (
              <div className="h-10 bg-surface-700 rounded-xl animate-pulse" />
            ) : (
              <select
                required
                value={counterpartId}
                onChange={(e) => handleSelectCp(e.target.value)}
                disabled={!businessId}
                className="w-full px-3 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">Seçin</option>
                {sortedCps.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                {businessId && (
                  <option value="__new__">+ Yeni {kind === "FIRM" ? "Firma" : "Kişi"} Ekle</option>
                )}
              </select>
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

          {/* Vade tarihi */}
          <div>
            <label className="block text-xs font-medium text-surface-200 mb-1.5">
              Vade Tarihi <span className="text-surface-400 font-normal">(opsiyonel)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
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
              placeholder={`${label} ile ilgili not...`}
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
            disabled={submitting || !businessId || !counterpartId || !amount}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50",
              isReceivable ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700",
            )}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {label} Ekle
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
