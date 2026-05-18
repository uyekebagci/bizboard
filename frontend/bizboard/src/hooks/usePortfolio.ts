"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getDefaultPeriod, type Period } from "@/lib/preferences";
import type { PortfolioSummary } from "@/types";

/**
 * v1.6.7: portfolio hook artık `?period=` kullanıyor (eskiden ?year=&month=).
 * `period` parametresi verilmezse kullanıcı tercihinden okur (default `daily`).
 *
 * Backend `?period=` veya `?year=&month=` ikisini de kabul eder; biz period
 * yolundan ilerliyoruz çünkü periyot tercihi artık sistemde merkezi.
 */
export function usePortfolio(period?: Period) {
  const { portfolio, setPortfolio, refreshKey } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const effectivePeriod: Period = period || getDefaultPeriod();

  useEffect(() => {
    async function fetchPortfolio() {
      setIsLoading(true);
      try {
        const data = await api.get<PortfolioSummary>(
          `/portfolio?period=${effectivePeriod}`,
        );
        setPortfolio(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Portfoy yuklenemedi";
        logger.error("api", "Failed to fetch portfolio", undefined, err);
        setError(message);
        setPortfolio({
          total_income: 0,
          total_expense: 0,
          net_profit: 0,
          business_count: 0,
          fixed_cost_total: 0,
          total_expense_with_fixed: 0,
          net_profit_with_fixed: 0,
          businesses: [],
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchPortfolio();
  }, [setPortfolio, refreshKey, effectivePeriod]);

  return { portfolio, isLoading, error, period: effectivePeriod };
}
