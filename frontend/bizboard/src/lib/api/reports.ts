/**
 * Raporlar v1.1 (R5/R6/R7): nakit-akış tahmini + what-if + bütçe-eşik istemcisi.
 *
 * <p>Tümü READ-ONLY analitik (bütçe config hariç). Backend uçları:
 * <ul>
 *   <li>{@code GET  /reports/forecast?weeks=&businessId=} — baz tahmin</li>
 *   <li>{@code POST /reports/forecast/what-if?weeks=&businessId=} — senaryolu tahmin</li>
 *   <li>{@code GET  /reports/budget?businessId=} — kategori bütçe durumu</li>
 *   <li>{@code PUT  /admin/budget-thresholds?business_id=} — bütçe set/clear (ADMIN)</li>
 * </ul>
 */

import { api } from "@/lib/api/client";

// ─────────────────────── Forecast (R5/R6) ───────────────────────

export interface ScheduledItem {
  kind: "RECEIVABLE" | "PAYABLE" | "CHEQUE_IN" | "CHEQUE_OUT" | "FIXED_COST";
  label: string;
  due_date: string | null;
  amount: number;
}

export interface ForecastWeek {
  index: number;
  week_start: string;
  week_end: string;
  label: string;
  opening_balance: number;
  inflow: number;
  outflow: number;
  net: number;
  closing_balance: number;
  scheduled_items: ScheduledItem[];
}

export interface ForecastScenarioEcho {
  income_delta_pct: number;
  expense_delta_pct: number;
  extra_weekly_expense: number;
  extra_one_time_expense: number;
  extra_one_time_week: number | null;
}

export interface CashFlowForecast {
  opening_balance: number;
  as_of: string;
  weeks: number;
  baseline_weekly_net: number;
  baseline_lookback_weeks: number;
  scenario: ForecastScenarioEcho | null;
  weeksData: ForecastWeek[];
  ending_balance: number;
  min_balance: number;
  min_balance_week: number;
  has_shortfall: boolean;
}

/** What-if parametreleri — hepsi opsiyonel; null = baz senaryo (etkisiz). */
export interface WhatIfScenario {
  income_delta_pct?: number | null;
  expense_delta_pct?: number | null;
  extra_weekly_expense?: number | null;
  extra_one_time_expense?: number | null;
  extra_one_time_week?: number | null;
}

function forecastQuery(weeks: number, businessId?: string): string {
  const p = new URLSearchParams({ weeks: String(weeks) });
  if (businessId) p.set("businessId", businessId);
  return p.toString();
}

/** Baz senaryo 13-haftalık tahmin. */
export function getForecast(
  weeks = 13,
  businessId?: string
): Promise<CashFlowForecast> {
  return api.get<CashFlowForecast>(`/reports/forecast?${forecastQuery(weeks, businessId)}`);
}

/** What-if senaryolu tahmin (kalıcı değişiklik YOK — saf hesaplama). */
export function runWhatIf(
  scenario: WhatIfScenario,
  weeks = 13,
  businessId?: string
): Promise<CashFlowForecast> {
  return api.post<CashFlowForecast>(
    `/reports/forecast/what-if?${forecastQuery(weeks, businessId)}`,
    scenario
  );
}

// ─────────────────────── Budget thresholds (R7) ───────────────────────

export interface BudgetRow {
  category_id: string;
  category_name: string;
  icon: string | null;
  color: string | null;
  /** Tanımlı bütçe (TL); null = bu kategori için bütçe KAPALI. */
  budget: number | null;
  /** Mevcut dönemde bu kategoride gerçekleşen gider. */
  spent: number;
  /** Kullanım yüzdesi (bütçe yoksa null). */
  usage_pct: number | null;
  exceeded: boolean;
}

export interface BudgetThresholds {
  business_id: string;
  period: string;
  period_label: string;
  rows: BudgetRow[];
}

/** Kategori bütçe durumu (mevcut ay kullanımıyla). */
export function getBudgets(businessId: string): Promise<BudgetThresholds> {
  return api.get<BudgetThresholds>(
    `/reports/budget?businessId=${encodeURIComponent(businessId)}`
  );
}

/**
 * Bir kategorinin bütçesini günceller (ADMIN). null/0 → bütçe kapatılır.
 * Güncel durum (kullanım dahil) geri döner.
 */
export function setBudget(
  businessId: string,
  categoryId: string,
  budget: number | null
): Promise<BudgetThresholds> {
  return api.put<BudgetThresholds>(
    `/admin/budget-thresholds?business_id=${encodeURIComponent(businessId)}`,
    { category_id: categoryId, budget }
  );
}
