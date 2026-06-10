"use client";

/**
 * Ledger v2 (Faz C, §3.5 / §6): POS işlem (deal) girişi + kâr-payı şelalesi hook.
 *
 * <p>Deal listesi + create (kâr-payı provisional postalanır) + canlı önizleme
 * (müşteri oranı değişince payları yazmadan göster) + admin reverse.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { PosDeal } from "@/types";

export interface CreatePosDealInput {
  posDeviceId: string;
  grossAmount: number;
  customerRate: number;
  referrerCounterpartId?: string | null;
  ownerAccountId?: string | null;
  dealDate?: string | null;
  notes?: string | null;
}

function toBody(input: CreatePosDealInput) {
  return {
    pos_device_id: input.posDeviceId,
    gross_amount: input.grossAmount,
    customer_rate: input.customerRate,
    referrer_counterpart_id: input.referrerCounterpartId ?? null,
    owner_account_id: input.ownerAccountId ?? null,
    deal_date: input.dealDate ?? null,
    notes: input.notes ?? null,
  };
}

export function usePosDeals(businessId?: string | null) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [deals, setDeals] = useState<PosDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useCallback(async () => {
    if (!businessId) { setDeals([]); return; }
    setLoading(true);
    try {
      const rows = await api.get<PosDeal[]>(`/pos-deals?business_id=${businessId}`);
      setDeals(rows ?? []);
      setError(null);
    } catch (err) {
      logger.error("api", "usePosDeals list failed", { businessId }, err);
      setError("POS işlemleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void list(); }, [list, refreshKey]);

  const create = useCallback(async (input: CreatePosDealInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<PosDeal>(`/pos-deals?business_id=${businessId}`, toBody(input));
    await list();
    return d;
  }, [businessId, list]);

  /** Canlı önizleme — posting yazmaz, payları döndürür. */
  const preview = useCallback(async (input: CreatePosDealInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.post<PosDeal>(`/pos-deals/preview?business_id=${businessId}`, toBody(input));
  }, [businessId]);

  const reverse = useCallback(async (dealId: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    await api.post(`/pos-deals/${dealId}/reverse?business_id=${businessId}`, {});
    await list();
  }, [businessId, list]);

  return { deals, loading, error, refresh: list, create, preview, reverse };
}
