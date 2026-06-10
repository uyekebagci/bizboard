"use client";

/**
 * Ledger v2 (Faz C, §5 / §6 / TODO 6): aylık kâr raporu hook.
 *
 * <p>Dönem seçimi (year/month) → kategori P&L (gelir/gider/masraf ayrı) +
 * operatör/kâr-merkezi kırılımı + şirket residual.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { MonthlyProfitReport } from "@/types";

export function useMonthlyProfit(businessId?: string | null, year?: number, month?: number) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [report, setReport] = useState<MonthlyProfitReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !year || !month) { setReport(null); return; }
    setLoading(true);
    try {
      const r = await api.get<MonthlyProfitReport>(
        `/profit-reports/monthly?business_id=${businessId}&year=${year}&month=${month}`);
      setReport(r);
      setError(null);
    } catch (err) {
      logger.error("api", "useMonthlyProfit load failed", { businessId, year, month }, err);
      setError("Aylık kâr raporu yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId, year, month]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return { report, loading, error, refresh: load };
}
