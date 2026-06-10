"use client";

/**
 * Ledger v2 (Faz C, §3.5 / TODO 2): T+1 POS yatış (ort.komisyon) finalize hook.
 *
 * <p>Yatış bekleyen gün+cihaz listesi + finalize (yatan tutar gir → ort.komisyon
 * + OWNER_COMMISSION final adjust).</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { PosSettlementBatch } from "@/types";

export interface FinalizeSettlementInput {
  posDeviceId: string;
  settleDate: string;
  depositedAmount: number;
  depositAccountId?: string | null;
}

export function usePosSettlements(businessId?: string | null) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [batches, setBatches] = useState<PosSettlementBatch[]>([]);
  const [pending, setPending] = useState<PosSettlementBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) { setBatches([]); setPending([]); return; }
    setLoading(true);
    try {
      const [b, p] = await Promise.all([
        api.get<PosSettlementBatch[]>(`/pos-settlements?business_id=${businessId}`).catch(() => []),
        api.get<PosSettlementBatch[]>(`/pos-settlements/pending?business_id=${businessId}`).catch(() => []),
      ]);
      setBatches(b ?? []);
      setPending(p ?? []);
      setError(null);
    } catch (err) {
      logger.error("api", "usePosSettlements load failed", { businessId }, err);
      setError("Yatış kayıtları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const finalize = useCallback(async (input: FinalizeSettlementInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.post<PosSettlementBatch>(
      `/pos-settlements/finalize?business_id=${businessId}`, {
        pos_device_id: input.posDeviceId,
        settle_date: input.settleDate,
        deposited_amount: input.depositedAmount,
        deposit_account_id: input.depositAccountId ?? null,
      });
    await load();
    return r;
  }, [businessId, load]);

  return { batches, pending, loading, error, refresh: load, finalize };
}
