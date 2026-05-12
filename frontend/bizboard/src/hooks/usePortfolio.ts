"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { PortfolioSummary } from "@/types";

export function usePortfolio() {
  const { portfolio, setPortfolio, refreshKey } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPortfolio() {
      setIsLoading(true);
      try {
        const now = new Date();
        const data = await api.get<PortfolioSummary>(
          `/portfolio?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
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
  }, [setPortfolio, refreshKey]);

  return { portfolio, isLoading, error };
}
