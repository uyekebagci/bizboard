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
import { DarkSelect } from "@/components/shared/DarkSelect";
import { toast } from "@/lib/toast";

type Direction = "RECEIVABLE" | "PAYABLE";
type Kind = "FIRM" | "PERSON";

interface Props {
  direction: Direction;
  /** Önceden seçili işletme (örn. business detay sayfasından açıldıysa). */
  preselectedBusinessId?: string;
  /** v1.7.x: Counterpart detay sayfasından açıldıysa — counterpart + kind + business
   *  otomatik pre-fill (counterpart picker locked). */
  preselectedCounterpart?: Counterpart;
  onClose: () => void;
  onSuccess?: (debtId: string) => void;
}

export function CounterpartDebtModal({
  direction, preselectedBusinessId, preselectedCounterpart, onClose, onSuccess,
}: Props) {
  const { triggerRefresh } = useAppStore();
  const isReceivable = direction === "RECEIVABLE";
  const label = isReceivable ? "Alacak" : "Verecek";

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState<string>(
    preselectedCounterpart?.business_id ?? preselectedBusinessId ?? "");
  const [loadingBiz, setLoadingBiz] = useState(true);

  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [loadingCps, setLoadingCps] = useState(false);

  const [kind, setKind] = useState<Kind>(
    (preselectedCounterpart?.kind as Kind | undefined) ?? "FIRM");
  const [counterpartId, setCounterpartId] = useState<string>(
    preselectedCounterpart?.id ?? "");
  // Counterpart locked mod: detay sayfasından açıldı → picker değişmesin.
  const counterpartLocked = !!preselectedCounterpart;
  const [amount, setAmount] = useState("");
  // WP a9da4e9d (USD+Altın): para birimi seçici. TRY/USD/GOLD.
  const [currency, setCurrency] = useState<"TRY" | "USD" | "GOLD">("TRY");
  const [dueDate, setDueDate] = useState("");
  // WP a9da4e9d: "Henüz belli değil" — yeni borçta vade bilinmiyorsa null gönder.
  const [dueDateUnknown, setDueDateUnknown] = useState(false);
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
    // v1.7.x: locked mode'da counterpart prop'tan; aksi takdirde dropdown listesinden.
    const cp = preselectedCounterpart && preselectedCounterpart.id === counterpartId
        ? preselectedCounterpart
        : counterparts.find((c) => c.id === counterpartId);
    if (!cp) { setError("Karşı taraf bulunamadı"); return; }

    setSubmitting(true);
    try {
      const r = await api.post<{ id: string }>(`/businesses/${businessId}/debts`, {
        direction,
        counterparty: cp.name,        // legacy free-text (auto-filled from cp.name)
        counterpart_id: counterpartId,
        // WP a9da4e9d: amount = ORİJİNAL para birimi tutarı; backend TL'ye çevirir.
        amount: parsedAmount,
        currency,
        instrument_type: isReceivable ? "NAKIT" : "NAKIT", // default; ileride seçim
        receivable_type: isReceivable ? "NAKIT" : null,
        // dueDateUnknown ise vade bilinmiyor → null (CreateDebtRequest.dueDate nullable).
        due_date: dueDateUnknown ? null : (dueDate || null),
        description: description.trim() || null,
      });
      triggerRefresh();
      toast.success("Borç eklendi");
      onSuccess?.(r.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kayıt başarısız");
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="modal-header">
          <h3 className="modal-title flex items-center gap-2">
            <HandCoins size={16} className={isReceivable ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"} />
            Yeni {label} Ekle
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

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Business (1 değilse göster) */}
          {!preselectedBusinessId && businesses.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">İşletme *</label>
              {loadingBiz ? (
                <div className="h-10 v2-sunken rounded-xl animate-pulse" />
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

          {/* Firma/Kişi radio — counterpart locked ise gizli (zaten belli) */}
          {!counterpartLocked && (
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">Karşı Taraf Tipi *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setKind("FIRM"); setCounterpartId(""); }}
                className={cn(
                  "v2-press py-2 rounded-xl text-sm font-medium border-2 inline-flex items-center justify-center gap-1.5",
                  kind === "FIRM"
                    ? "border-[rgb(var(--accent))]/60 bg-[rgb(var(--accent))]/12 text-accent-strong dark:text-accent"
                    : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
                )}
              >
                <Building2 size={14} />
                Firma
              </button>
              <button
                type="button"
                onClick={() => { setKind("PERSON"); setCounterpartId(""); }}
                className={cn(
                  "v2-press py-2 rounded-xl text-sm font-medium border-2 inline-flex items-center justify-center gap-1.5",
                  kind === "PERSON"
                    ? "border-[rgb(var(--accent))]/60 bg-[rgb(var(--accent))]/12 text-accent-strong dark:text-accent"
                    : "v2-sunken text-[rgb(var(--v2-muted))] hover:border-[rgb(var(--accent))]/50",
                )}
              >
                <UserIcon size={14} />
                Kişi
              </button>
            </div>
          </div>
          )}

          {/* Karşı Taraf — locked mode: read-only label; aksi takdirde dropdown */}
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              Karşı Taraf{!counterpartLocked && ` (${kind === "FIRM" ? "Firma" : "Kişi"})`} *
            </label>
            {counterpartLocked && preselectedCounterpart ? (
              <div className="px-3 py-2.5 rounded-xl border border-[rgb(var(--v2-border))] v2-sunken text-sm text-[rgb(var(--v2-ink))]">
                {preselectedCounterpart.name}
              </div>
            ) : loadingCps ? (
              <div className="h-10 v2-sunken rounded-xl animate-pulse" />
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
            {!counterpartLocked && !businessId && (
              <p className="mt-1 text-[10px] text-[rgb(var(--v2-muted))]">Önce işletme seçin</p>
            )}
          </div>

          {/* Tutar + Para Birimi (WP a9da4e9d: TRY/USD/GOLD) */}
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              Tutar * {currency === "GOLD" && <span className="text-[rgb(var(--v2-muted))] font-normal">(gram)</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                required
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                placeholder="0"
                className="field field-sm py-2.5 flex-1 min-w-0 text-lg font-bold"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "TRY" | "USD" | "GOLD")}
                aria-label="Para birimi"
                className="field field-sm py-2.5 w-auto text-sm font-medium"
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="GOLD">Altın (gr)</option>
              </select>
            </div>
            {currency !== "TRY" && (
              <p className="mt-1 text-[10px] text-[rgb(var(--v2-muted))]">
                {currency === "USD" ? "Dolar" : "Gram altın"} tutarı girilir; konsolide net
                güncel kurla TL&apos;ye çevrilir.
              </p>
            )}
          </div>

          {/* Vade tarihi */}
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              Vade Tarihi <span className="text-[rgb(var(--v2-muted))] font-normal">(opsiyonel)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={dueDateUnknown}
              className="field field-sm py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-[rgb(var(--v2-muted))] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dueDateUnknown}
                onChange={(e) => {
                  setDueDateUnknown(e.target.checked);
                  if (e.target.checked) setDueDate("");
                }}
                className="checkbox"
              />
              Henüz belli değil
            </label>
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-medium text-[rgb(var(--v2-ink))] mb-1.5">
              Açıklama <span className="text-[rgb(var(--v2-muted))] font-normal">(opsiyonel)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="field field-sm py-2.5 resize-none"
              placeholder={`${label} ile ilgili not...`}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary flex-1 py-2.5 text-sm"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting || !businessId || !counterpartId || !amount}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2",
              "transition-all duration-150 active:translate-y-0 hover:-translate-y-px",
              "disabled:opacity-50 disabled:pointer-events-none",
              isReceivable
                ? "bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-600 shadow-[0_10px_22px_-12px_rgba(245,159,0,0.7)]"
                : "bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-600 shadow-[0_10px_22px_-12px_rgba(224,49,49,0.7)]",
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
