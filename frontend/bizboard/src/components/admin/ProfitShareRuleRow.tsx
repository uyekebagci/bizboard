"use client";

/**
 * Ledger v2 (Faz C, §3.4) — Kâr-Payı Yönetimi sayfasının küçük sunum
 * bileşenleri: config yüzde input alanı + kural liste satırı. Sayfa dosyasını
 * 500 satır sınırının altında tutmak için ayrıldı.
 */

import { Pencil, Trash2, Power, Clock } from "lucide-react";
import { ruleTypeLabel, isDeferredRuleType } from "@/components/admin/profit-share-meta";
import type { ProfitShareRule } from "@/types";

// ── Yüzde input alanı (global config) ────────────────────────
export function PctField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-full"
        placeholder="0"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-[10px] text-surface-400 mt-1 leading-tight">
        {hint}
      </p>
    </div>
  );
}

// ── Kural liste satırı ───────────────────────────────────────
export function RuleRow({
  rule,
  onEdit,
  onDelete,
}: {
  rule: ProfitShareRule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const deferred = isDeferredRuleType(String(rule.rule_type));
  return (
    <li className="flex items-center justify-between gap-3 p-4 hover:bg-surface-800/60 transition-colors group">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-surface-100">
            {ruleTypeLabel(String(rule.rule_type))}
          </span>
          {!rule.active && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-surface-700 text-surface-400 rounded-full">
              <Power size={10} /> Pasif
            </span>
          )}
          {deferred && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/25 rounded-full">
              <Clock size={10} /> T+1
            </span>
          )}
        </div>
        <p className="text-xs text-surface-400 mt-0.5 truncate">
          {rule.operator_name ?? "Şirket (residual)"}
          {rule.target_subcash_account_name ? ` → ${rule.target_subcash_account_name}` : ""}
          {rule.pos_device_name ? ` · ${rule.pos_device_name}` : " · tüm cihazlar"}
        </p>
        <p className="text-[11px] text-surface-500 mt-0.5">
          {rule.override_pct != null ? `Oran %${rule.override_pct}` : "Oran: config"} ·
          Öncelik {rule.priority}
          {rule.notes ? ` · ${rule.notes}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg hover:bg-surface-600 transition-colors"
          aria-label="Kuralı düzenle"
          title="Düzenle"
        >
          <Pencil size={15} className="text-surface-400" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg hover:bg-red-900/30 transition-colors"
          aria-label="Kuralı sil"
          title="Sil"
        >
          <Trash2 size={15} className="text-red-500" />
        </button>
      </div>
    </li>
  );
}
