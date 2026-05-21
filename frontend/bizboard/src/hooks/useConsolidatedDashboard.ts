"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { ConsolidatedDashboard } from "@/types";

/**
 * v1.6.20 (WP-3): İşletme detay sayfası tek-shot consolidated endpoint hook'u.
 *
 * <p>v1.6.23.10: Global {@code refreshKey} dependency eklendi — başka sayfadan
 * (örn. /pos-cihazlari toplu settle, tx oluşturma) {@code triggerRefresh()}
 * çağrıldığında burada da otomatik yeniden çekilir. POS settle/unsettle
 * sonrası konsolide widget sayfa yenilemesi olmadan güncel olur.</p>
 */
export function useConsolidatedDashboard(businessId: string | null | undefined) {
  const refreshKey = useAppStore((s) => s.refreshKey);
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

  // refresh() businessId'ye bağımlı; refreshKey değişince useEffect re-trigger eder.
  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  return { data, loading, error, refresh };
}
