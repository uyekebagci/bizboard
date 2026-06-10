"use client";

/**
 * Ledger v2 (Faz D, §3.1 / §7): ayni varlık (ASSET) envanteri hook'u.
 *
 * <p>Edinim (ASSET hesabı + posting) + satış (P&L gelir/zarar). Bakiye = defter
 * değeri (Σ posting). Satılınca pasifleşir.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";

export interface Asset {
  account_id: string;
  name: string;
  book_value: number;
  active: boolean;
  notes?: string | null;
}

export interface AcquireAssetInput {
  name: string;
  book_value: number;
  counterpart_id?: string | null;
  acquired_date?: string | null;
  notes?: string | null;
}

export interface SellAssetInput {
  asset_account_id: string;
  money_account_id: string;
  sale_price: number;
  sold_date?: string | null;
  notes?: string | null;
}

export function useAssets(businessId?: string | null, includeSold = false) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [list, setList] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) { setList([]); return; }
    setLoading(true);
    try {
      const rows = await api.get<Asset[]>(
        `/assets?business_id=${businessId}&include_sold=${includeSold}`,
      );
      setList(rows ?? []);
      setError(null);
    } catch (err) {
      logger.error("api", "useAssets load failed", { businessId }, err);
      setError("Ayni varlıklar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId, includeSold]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const acquire = useCallback(async (input: AcquireAssetInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<Asset>(`/assets/acquire?business_id=${businessId}`, input);
    await load();
    return d;
  }, [businessId, load]);

  const sell = useCallback(async (input: SellAssetInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<Asset>(`/assets/sell?business_id=${businessId}`, input);
    await load();
    return d;
  }, [businessId, load]);

  return { list, loading, error, reload: load, acquire, sell };
}
