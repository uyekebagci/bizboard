"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import type { ConsolidatedDashboard } from "@/types";

/**
 * v1.6.20 (WP-3): İşletme detay sayfası tek-shot consolidated endpoint hook'u.
 */
export function useConsolidatedDashboard(businessId: string | null | undefined) {
  const [data, setData] = useState<ConsolidatedDashboard | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(businessId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const r = await api.get<ConsolidatedDashboard>(`/businesses/${businessId}/consolidated`);
      setData(r);
      setError(null);
    } catch (err) {
      logger.error("api", "consolidated fetch failed", { businessId }, err);
      setError("Pano verisi yuklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
