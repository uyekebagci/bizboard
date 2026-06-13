/**
 * Ledger v2 (Faz C, §3.4) — POS kâr-payı kural + global config admin API
 * sarmalayıcıları. Backend {@code AdminProfitShareController} ({@code /admin/**}
 * → ADMIN role gate) endpoint'lerini tüketir; YENİ backend yok.
 *
 * Endpoint sözleşmesi (hepsi {@code business_id} query-param ile scope'lu):
 *   GET    /admin/profit-share/rules?business_id=
 *   POST   /admin/profit-share/rules?business_id=
 *   PUT    /admin/profit-share/rules/{id}?business_id=
 *   DELETE /admin/profit-share/rules/{id}?business_id=
 *   GET    /admin/profit-share/config?business_id=
 *   PUT    /admin/profit-share/config?business_id=
 */

import { api } from "@/lib/api/client";
import type {
  ProfitShareConfig,
  ProfitShareRule,
  ProfitShareRuleType,
} from "@/types";

/** Kural upsert (create/update) gövdesi — backend {@code ProfitShareRuleRequest}. */
export interface ProfitShareRuleInput {
  rule_type: ProfitShareRuleType;
  /** RESIDUAL dışında zorunlu (servis doğrular). */
  operator_counterpart_id: string | null;
  /** RESIDUAL dışında zorunlu. */
  target_subcash_account_id: string | null;
  /** null = tüm cihazlar (operatör-bazlı); dolu = cihaz-bazlı override. */
  pos_device_id: string | null;
  /** null = global config'e düş. */
  override_pct: number | null;
  active: boolean;
  priority: number;
  notes: string | null;
}

const base = "/admin/profit-share";

function rulesUrl(businessId: string): string {
  return `${base}/rules?business_id=${encodeURIComponent(businessId)}`;
}

function ruleUrl(businessId: string, ruleId: string): string {
  return `${base}/rules/${encodeURIComponent(ruleId)}?business_id=${encodeURIComponent(
    businessId,
  )}`;
}

function configUrl(businessId: string): string {
  return `${base}/config?business_id=${encodeURIComponent(businessId)}`;
}

// ──────────────────────────── RULES ────────────────────────────

export function listProfitShareRules(
  businessId: string,
): Promise<ProfitShareRule[]> {
  return api.get<ProfitShareRule[]>(rulesUrl(businessId));
}

export function createProfitShareRule(
  businessId: string,
  input: ProfitShareRuleInput,
): Promise<ProfitShareRule> {
  return api.post<ProfitShareRule>(rulesUrl(businessId), input);
}

export function updateProfitShareRule(
  businessId: string,
  ruleId: string,
  input: ProfitShareRuleInput,
): Promise<ProfitShareRule> {
  return api.put<ProfitShareRule>(ruleUrl(businessId, ruleId), input);
}

export function deleteProfitShareRule(
  businessId: string,
  ruleId: string,
): Promise<{ status: string; id: string }> {
  return api.delete<{ status: string; id: string }>(ruleUrl(businessId, ruleId));
}

// ──────────────────────────── CONFIG ────────────────────────────

export function getProfitShareConfig(
  businessId: string,
): Promise<ProfitShareConfig> {
  return api.get<ProfitShareConfig>(configUrl(businessId));
}

export function updateProfitShareConfig(
  businessId: string,
  config: ProfitShareConfig,
): Promise<ProfitShareConfig> {
  return api.put<ProfitShareConfig>(configUrl(businessId), config);
}
