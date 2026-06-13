"use client";

/**
 * Ledger v2 (Faz C, §3.4) — Kâr-payı kuralı oluştur/düzenle modal'ı (ADMIN).
 *
 * <p>Backend {@code AdminProfitShareController} rules CRUD'unu tüketir.
 * RESIDUAL dışındaki kural tipleri için operatör (counterpart) + hedef kâr-merkezi
 * kasası zorunlu (servis de doğrular — defense-in-depth). POS cihazı boş =
 * operatör-bazlı (tüm cihazlar); dolu = cihaz-bazlı override. {@code override_pct}
 * boş = global config'e düşer.</p>
 *
 * <p>Portal'lı, çift tema (.input/.label/.btn-secondary token'ları), a11y
 * (aria-label, focus, role).</p>
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  createProfitShareRule,
  updateProfitShareRule,
  type ProfitShareRuleInput,
} from "@/lib/api/profit-share";
import {
  PROFIT_SHARE_RULE_TYPES,
  type ProfitShareRuleTypeMeta,
} from "@/components/admin/profit-share-meta";
import type {
  BankAccountListItem,
  Counterpart,
  PosDeviceListItem,
  ProfitShareRule,
  ProfitShareRuleType,
} from "@/types";

interface Props {
  open: boolean;
  businessId: string;
  /** Düzenlenen kural; null = yeni oluştur. */
  rule: ProfitShareRule | null;
  counterparts: Counterpart[];
  /** Seçili işletmenin kasa/banka hesapları (hedef kâr-merkezi). */
  accounts: BankAccountListItem[];
  devices: PosDeviceListItem[];
  onClose: () => void;
  onSaved: () => void;
}

export function ProfitShareRuleModal({
  open,
  businessId,
  rule,
  counterparts,
  accounts,
  devices,
  onClose,
  onSaved,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [ruleType, setRuleType] = useState<ProfitShareRuleType>("RATE_SPREAD");
  const [operatorId, setOperatorId] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [posDeviceId, setPosDeviceId] = useState("");
  const [overridePct, setOverridePct] = useState("");
  const [active, setActive] = useState(true);
  const [priority, setPriority] = useState("100");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal açılınca formu kuraldan (edit) veya varsayılanlardan (create) doldur.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (rule) {
      setRuleType((rule.rule_type as ProfitShareRuleType) ?? "RATE_SPREAD");
      setOperatorId(rule.operator_counterpart_id ?? "");
      setTargetAccountId(rule.target_subcash_account_id ?? "");
      setPosDeviceId(rule.pos_device_id ?? "");
      setOverridePct(rule.override_pct != null ? String(rule.override_pct) : "");
      setActive(rule.active);
      setPriority(String(rule.priority ?? 100));
      setNotes(rule.notes ?? "");
    } else {
      setRuleType("RATE_SPREAD");
      setOperatorId("");
      setTargetAccountId("");
      setPosDeviceId("");
      setOverridePct("");
      setActive(true);
      setPriority("100");
      setNotes("");
    }
  }, [open, rule]);

  const meta: ProfitShareRuleTypeMeta | undefined = useMemo(
    () => PROFIT_SHARE_RULE_TYPES.find((m) => m.value === ruleType),
    [ruleType],
  );

  const isResidual = ruleType === "RESIDUAL";

  function validate(): ProfitShareRuleInput | null {
    if (!isResidual) {
      if (!operatorId) {
        setError("Bu kural tipi için operatör (karşı firma) zorunlu.");
        return null;
      }
      if (!targetAccountId) {
        setError("Bu kural tipi için hedef kâr-merkezi kasası zorunlu.");
        return null;
      }
    }

    let overridePctNum: number | null = null;
    if (overridePct.trim() !== "") {
      const parsed = Number(overridePct.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        setError("Oran override 0 ile 100 arasında olmalı (boş = global config).");
        return null;
      }
      overridePctNum = parsed;
    }

    const priorityNum = Number(priority);
    if (!Number.isInteger(priorityNum) || priorityNum < 0) {
      setError("Öncelik 0 veya daha büyük bir tam sayı olmalı.");
      return null;
    }

    return {
      rule_type: ruleType,
      operator_counterpart_id: isResidual ? null : operatorId || null,
      target_subcash_account_id: isResidual ? null : targetAccountId || null,
      pos_device_id: posDeviceId || null,
      override_pct: overridePctNum,
      active,
      priority: priorityNum,
      notes: notes.trim() || null,
    };
  }

  async function handleSubmit() {
    setError(null);
    const input = validate();
    if (!input) return;
    setSubmitting(true);
    try {
      if (rule) {
        await updateProfitShareRule(businessId, rule.id, input);
        toast.success("Kâr-payı kuralı güncellendi");
      } else {
        await createProfitShareRule(businessId, input);
        toast.success("Kâr-payı kuralı oluşturuldu");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setError(msg);
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={rule ? "Kâr-payı kuralını düzenle" : "Yeni kâr-payı kuralı"}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface-800 border border-surface-700 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-surface-800/95 backdrop-blur border-b border-surface-700">
          <h2 className="text-base font-bold text-surface-100">
            {rule ? "Kâr-Payı Kuralını Düzenle" : "Yeni Kâr-Payı Kuralı"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors"
            aria-label="Kapat"
          >
            <X size={18} className="text-surface-300" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div
              className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm"
              role="alert"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Kural tipi */}
          <div>
            <label className="label" htmlFor="ps-rule-type">
              Kural Tipi <span className="text-red-400">*</span>
            </label>
            <select
              id="ps-rule-type"
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as ProfitShareRuleType)}
              className="input w-full"
            >
              {PROFIT_SHARE_RULE_TYPES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {meta && (
              <p className="text-[11px] text-surface-400 mt-1.5 leading-relaxed">
                {meta.description}
                {meta.deferred && (
                  <span className="text-amber-300"> (T+1 — gün kapanışında kesinleşir)</span>
                )}
              </p>
            )}
          </div>

          {/* Operatör + hedef kasa (RESIDUAL hariç) */}
          {!isResidual ? (
            <>
              <div>
                <label className="label" htmlFor="ps-operator">
                  Operatör (Karşı Firma) <span className="text-red-400">*</span>
                </label>
                <select
                  id="ps-operator"
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  className="input w-full"
                >
                  <option value="">— Seç —</option>
                  {counterparts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {counterparts.length === 0 && (
                  <p className="text-[11px] text-amber-300 mt-1">
                    Bu işletmede karşı firma yok — önce karşı firma ekleyin.
                  </p>
                )}
              </div>

              <div>
                <label className="label" htmlFor="ps-target">
                  Hedef Kâr-Merkezi Kasası <span className="text-red-400">*</span>
                </label>
                <select
                  id="ps-target"
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="input w-full"
                >
                  <option value="">— Seç —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.bank_name ? ` · ${a.bank_name}` : ""}
                    </option>
                  ))}
                </select>
                {accounts.length === 0 && (
                  <p className="text-[11px] text-amber-300 mt-1">
                    Bu işletmede kasa/banka hesabı yok.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="p-3 bg-surface-900/40 border border-surface-700/60 rounded-xl text-[11px] text-surface-400 leading-relaxed">
              RESIDUAL kalan artığı şirket P&amp;L&apos;ine yazar — operatör veya hedef
              kasa gerekmez. Genelde diğer kurallardan türetilir; explicit kural nadiren
              eklenir.
            </div>
          )}

          {/* POS cihazı (override) */}
          <div>
            <label className="label" htmlFor="ps-device">
              POS Cihazı (opsiyonel)
            </label>
            <select
              id="ps-device"
              value={posDeviceId}
              onChange={(e) => setPosDeviceId(e.target.value)}
              className="input w-full"
            >
              <option value="">Tüm cihazlar (operatör-bazlı)</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.owner_my_company_name ? ` · ${d.owner_my_company_name}` : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-surface-400 mt-1">
              Boş = operatöre ait tüm cihazlar. Cihaz seçilirse yalnız o cihaza özel
              override olur.
            </p>
          </div>

          {/* Override oran + öncelik */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ps-override">
                Oran Override %
              </label>
              <input
                id="ps-override"
                type="text"
                inputMode="decimal"
                value={overridePct}
                onChange={(e) => setOverridePct(e.target.value)}
                className="input w-full"
                placeholder="Boş = config"
                aria-describedby="ps-override-hint"
              />
              <p id="ps-override-hint" className="text-[11px] text-surface-400 mt-1">
                0–100. Boş = global config&apos;e düşer.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="ps-priority">
                Öncelik
              </label>
              <input
                id="ps-priority"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input w-full"
                placeholder="100"
                aria-describedby="ps-priority-hint"
              />
              <p id="ps-priority-hint" className="text-[11px] text-surface-400 mt-1">
                Küçük = önce uygulanır.
              </p>
            </div>
          </div>

          {/* Not */}
          <div>
            <label className="label" htmlFor="ps-notes">
              Not (opsiyonel)
            </label>
            <input
              id="ps-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full"
              placeholder="Açıklama"
            />
          </div>

          {/* Aktif toggle */}
          <div className="flex items-center justify-between p-4 bg-surface-900 border border-surface-600 rounded-xl">
            <div>
              <span className="text-sm text-surface-200 font-medium">Aktif</span>
              <p className="text-[11px] text-surface-400 mt-0.5">
                Pasif kurallar kâr-payı şelalesinde uygulanmaz.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              role="switch"
              aria-checked={active}
              aria-label="Kural aktif/pasif"
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                active ? "bg-amber-500" : "bg-surface-600"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  active ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-2 px-5 py-4 bg-surface-800/95 backdrop-blur border-t border-surface-700">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5" disabled={submitting}>
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {rule ? "Kaydet" : "Oluştur"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
