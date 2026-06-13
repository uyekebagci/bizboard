"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getDefaultPeriod, type Period } from "@/lib/preferences";

/**
 * Dashboard grafik verisi — GERÇEK backend serisinden (placeholder DEĞİL).
 *
 * <p>İki additive, salt-okunur endpoint'i çeker:</p>
 * <ul>
 *   <li>{@code GET /portfolio/activity/daily?days=7} → "Haftalık Hareket"
 *       bar-chart'ı (gün bazında net/gelir/gider).</li>
 *   <li>{@code GET /portfolio/comparison?period=...} → MetricCard delta yüzdeleri
 *       (seçili dönem vs önceki eşdeğer dönem).</li>
 * </ul>
 *
 * <p>Tenant-scope + net tutarlılığı backend'de ({@code SummaryService} →
 * {@code BusinessAccessGuard} + {@code PosIncomeCalculator}). Veri yoksa
 * {@code business_count=0}; FE nötr boş-durum gösterir (uydurma sayı YOK).
 * {@code refreshKey} ile portfolio ile aynı yenileme döngüsüne bağlı.</p>
 */

/** Backend: PortfolioActivityDto.DayPoint */
export interface ActivityDayPoint {
  date: string; // ISO yyyy-MM-dd
  income: number;
  expense: number;
  net: number;
}

/** Backend: PortfolioActivityDto */
export interface PortfolioActivity {
  from: string;
  to: string;
  business_count: number;
  days: ActivityDayPoint[];
}

/** Backend: PortfolioComparisonDto.Window */
export interface ComparisonWindow {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
}

/** Backend: PortfolioComparisonDto — delta_pct null ise tanımsız (gösterme). */
export interface PortfolioComparison {
  period: string;
  current: ComparisonWindow;
  previous: ComparisonWindow;
  business_count: number;
  income_delta_pct: number | null;
  expense_delta_pct: number | null;
  net_delta_pct: number | null;
}

interface ChartsResult {
  activity: PortfolioActivity | null;
  comparison: PortfolioComparison | null;
  isLoading: boolean;
}

const ACTIVITY_DAYS = 7;

export function usePortfolioCharts(period?: Period): ChartsResult {
  const { refreshKey } = useAppStore();
  const effectivePeriod: Period = period || getDefaultPeriod();

  const [activity, setActivity] = useState<PortfolioActivity | null>(null);
  const [comparison, setComparison] = useState<PortfolioComparison | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);

    Promise.all([
      api
        .get<PortfolioActivity>(`/portfolio/activity/daily?days=${ACTIVITY_DAYS}`)
        .catch((err: unknown) => {
          logger.error("api", "Failed to fetch portfolio activity", undefined, err);
          return null;
        }),
      api
        .get<PortfolioComparison>(`/portfolio/comparison?period=${effectivePeriod}`)
        .catch((err: unknown) => {
          logger.error("api", "Failed to fetch portfolio comparison", undefined, err);
          return null;
        }),
    ])
      .then(([act, cmp]) => {
        if (!alive) return;
        setActivity(act);
        setComparison(cmp);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [effectivePeriod, refreshKey]);

  return { activity, comparison, isLoading };
}
