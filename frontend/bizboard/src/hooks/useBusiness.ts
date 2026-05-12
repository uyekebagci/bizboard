"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Business, Transaction, PeriodSummary } from "@/types";

export function useBusiness(businessId: string) {
  const { refreshKey } = useAppStore();
  const [business, setBusiness] = useState<Business | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBusiness() {
      setIsLoading(true);
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const [bizData, txData] = await Promise.all([
          api.get<Business>(`/businesses/${businessId}`),
          api.get<Transaction[]>(`/businesses/${businessId}/transactions?limit=20`),
        ]);

        let sumData: PeriodSummary | null = null;
        try {
          sumData = await api.get<PeriodSummary>(
            `/businesses/${businessId}/summary?year=${year}&month=${month}`
          );
        } catch {
          // No summary data for this month — that's OK
        }

        setBusiness(bizData);
        setTransactions(txData || []);
        setSummary(sumData);
      } catch (err: unknown) {
        const message =
          err instanceof ApiError && err.code === "AUTH-403"
            ? "Bu isletmeye erisim yetkiniz yok."
            : err instanceof Error
              ? err.message
              : "Isletme yuklenemedi";
        logger.error("api", "Failed to fetch business", { businessId }, err);
        setError(message);
        // AUTH-403: stale activeBusiness yi temizle.
        if (err instanceof ApiError && err.code === "AUTH-403") {
          useAppStore.getState().clearActiveBusiness();
        }
      } finally {
        setIsLoading(false);
      }
    }

    if (businessId) {
      fetchBusiness();
    }
  }, [businessId, refreshKey]);

  return { business, transactions, summary, isLoading, error };
}
