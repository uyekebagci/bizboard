/**
 * Tier 3 (EVT-2): periyodik (haftalık/aylık) finansal özet tercihi — admin API.
 *
 * Backend uçları {@code /admin/periodic-summary/**} altında, ADMIN-only.
 * İşletme-başına iki bağımsız toggle: haftalık + aylık. DEFAULT KAPALI
 * (spam-kaçın; açılmadıkça özet gönderilmez).
 */

import { api } from "@/lib/api/client";

export interface PeriodicSummaryConfig {
  business_id: string;
  /** Haftalık özet açık mı? (Pzt sabahı önceki hafta). */
  weekly_enabled: boolean;
  /** Aylık özet açık mı? (ayın 1'i önceki ay). */
  monthly_enabled: boolean;
}

export interface PeriodicSummaryPreview {
  business_id: string;
  period: string;
  period_start: string;
  period_end: string;
  /** Çok-satırlı özet gövdesi (önizleme). */
  summary: string;
}

export function getPeriodicSummaryConfig(
  businessId: string
): Promise<PeriodicSummaryConfig> {
  return api.get<PeriodicSummaryConfig>(
    `/admin/periodic-summary/config?business_id=${encodeURIComponent(businessId)}`
  );
}

export function setPeriodicSummaryConfig(
  businessId: string,
  weeklyEnabled: boolean,
  monthlyEnabled: boolean
): Promise<PeriodicSummaryConfig> {
  return api.put<PeriodicSummaryConfig>(
    `/admin/periodic-summary/config?business_id=${encodeURIComponent(businessId)}`,
    { weekly_enabled: weeklyEnabled, monthly_enabled: monthlyEnabled }
  );
}

/**
 * TEST/doğrulama: önceki dönem özetini ÖNİZLE (gönderim yapmaz, opt-in gerektirmez).
 */
export function previewPeriodicSummary(
  businessId: string,
  period: "weekly" | "monthly"
): Promise<PeriodicSummaryPreview> {
  return api.post<PeriodicSummaryPreview>(
    `/admin/periodic-summary/test?business_id=${encodeURIComponent(
      businessId
    )}&period=${period}`,
    {}
  );
}
