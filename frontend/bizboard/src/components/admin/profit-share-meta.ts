/**
 * Ledger v2 (Faz C, §3.4 / §6) — Kâr-payı kural tipi UI metası (label +
 * açıklama). Backend {@code ProfitShareRuleType} enum semantiğini yansıtır;
 * page + modal arasında tek kaynak.
 */

import type { ProfitShareRuleType } from "@/types";

export interface ProfitShareRuleTypeMeta {
  value: ProfitShareRuleType;
  label: string;
  description: string;
  /** OWNER_COMMISSION = T+1 (gün kapanışında kesinleşir). */
  deferred: boolean;
}

export const PROFIT_SHARE_RULE_TYPES: ProfitShareRuleTypeMeta[] = [
  {
    value: "RATE_SPREAD",
    label: "RATE_SPREAD — Oran Spread'i (çalışan)",
    description:
      "Pay = (müşteri oranı − sahip baz%) × hacim. Aynı gün kesin (deal girilince final).",
    deferred: false,
  },
  {
    value: "MARGIN_PCT",
    label: "MARGIN_PCT — Marj Yüzdesi (Fatih)",
    description:
      "Pay = deal marjı × sabit yüzde (config: Fatih marj%). Banka komisyonundan bağımsız, aynı gün kesin.",
    deferred: false,
  },
  {
    value: "OWNER_COMMISSION",
    label: "OWNER_COMMISSION — Sahip Komisyonu (Tuncay)",
    description:
      "Pay = (sahip baz% − ort. komisyon) × hacim. Ort. komisyon gün kapanışında kesinleşir.",
    deferred: true,
  },
  {
    value: "RESIDUAL",
    label: "RESIDUAL — Kalan Artık (şirket)",
    description:
      "Diğer paylardan sonra kalan tutar şirket P&L'ine yazılır. Operatör/hedef kasa gerekmez.",
    deferred: false,
  },
];

export function ruleTypeLabel(value: string): string {
  return (
    PROFIT_SHARE_RULE_TYPES.find((m) => m.value === value)?.label.split(" — ")[0] ??
    value
  );
}

export function isDeferredRuleType(value: string): boolean {
  return PROFIT_SHARE_RULE_TYPES.find((m) => m.value === value)?.deferred ?? false;
}
