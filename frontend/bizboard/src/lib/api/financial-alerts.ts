/**
 * Tier 2 (EVT-1, §2.2 + §2.4): finansal alarm eşikleri — admin API istemcisi.
 *
 * Backend uçları {@code /admin/financial-alerts/**} altında, ADMIN-only.
 * İşletme-başına iki eşik: bakiye eşiği + tek-harcama eşiği. null = o alarm
 * KAPALI (default).
 */

import { api } from "@/lib/api/client";

export interface FinancialAlertThresholds {
  business_id: string;
  /** İşletme toplam bakiye eşiği; null = kapalı. */
  balance_threshold: string | null;
  /** Tek harcama eşiği; null = kapalı. */
  high_expense_threshold: string | null;
}

export function getFinancialAlertThresholds(
  businessId: string
): Promise<FinancialAlertThresholds> {
  return api.get<FinancialAlertThresholds>(
    `/admin/financial-alerts/thresholds?business_id=${encodeURIComponent(businessId)}`
  );
}

/**
 * Eşikleri günceller. null/0 → ilgili alarm kapatılır.
 */
export function setFinancialAlertThresholds(
  businessId: string,
  balanceThreshold: number | null,
  highExpenseThreshold: number | null
): Promise<FinancialAlertThresholds> {
  return api.put<FinancialAlertThresholds>(
    `/admin/financial-alerts/thresholds?business_id=${encodeURIComponent(businessId)}`,
    {
      balance_threshold: balanceThreshold,
      high_expense_threshold: highExpenseThreshold,
    }
  );
}
