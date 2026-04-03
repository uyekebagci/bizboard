"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
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
      } catch (err: any) {
        console.error("Failed to fetch business:", err);
        setError(err.message);
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
