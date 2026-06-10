"use client";

/**
 * Ledger v2 (Faz B, §4): gün-kapanışı + mutabakat + kaçak hook.
 *
 * <p>SAĞLAMA HESAP omurgası: bugünün/seçilen tarihin canlı önizlemesi
 * (opening/computed + sayılacak hesaplar), geçmiş kapanış listesi, finalize
 * (çok-hesaplı sayım; backdated dahil), reopen, drill-down (kaçak kaynağı) ve
 * devir zinciri yeniden hesap. {@code refreshKey} ile global tetiğe bağlı —
 * işlem girilince computed güncellenir.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type {
  DayClose, DayCloseDrillDown, DayCloseAccountCount,
} from "@/types";

export interface CloseDayInput {
  closeDate?: string | null;
  accountCounts: { accountId: string; countedBalance: number }[];
  varianceThreshold?: number | null;
  reasonCategory?: string | null;
  reasonNote?: string | null;
  override?: boolean;
}

export function useDayClose(businessId?: string | null, date?: string | null) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [preview, setPreview] = useState<DayClose | null>(null);
  const [closings, setClosings] = useState<DayClose[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async (d?: string | null) => {
    if (!businessId) { setPreview(null); return; }
    const q = `business_id=${businessId}${d ? `&date=${d}` : ""}`;
    try {
      const p = await api.get<DayClose>(`/day-closes/preview?${q}`);
      setPreview(p);
      setError(null);
    } catch (err) {
      logger.error("api", "useDayClose preview failed", { businessId, d }, err);
      setError("Önizleme yüklenemedi");
    }
  }, [businessId]);

  const list = useCallback(async () => {
    if (!businessId) { setClosings([]); return; }
    setLoading(true);
    try {
      const rows = await api.get<DayClose[]>(`/day-closes?business_id=${businessId}`);
      setClosings(rows ?? []);
      setError(null);
    } catch (err) {
      logger.error("api", "useDayClose list failed", { businessId }, err);
      setError("Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const refresh = useCallback(async () => {
    await Promise.all([loadPreview(date), list()]);
  }, [loadPreview, list, date]);

  const closeDay = useCallback(async (input: CloseDayInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.post<DayClose>(`/day-closes?business_id=${businessId}`, {
      close_date: input.closeDate ?? null,
      account_counts: input.accountCounts.map((c) => ({
        account_id: c.accountId,
        counted_balance: c.countedBalance,
      })),
      variance_threshold: input.varianceThreshold ?? null,
      reason_category: input.reasonCategory ?? null,
      reason_note: input.reasonNote ?? null,
      override: input.override ?? false,
    });
    await refresh();
    return r;
  }, [businessId, refresh]);

  const reopen = useCallback(async (dayCloseId: string, reasonNote: string) => {
    const r = await api.post<DayClose>(`/day-closes/${dayCloseId}/reopen`, { reason_note: reasonNote });
    await refresh();
    return r;
  }, [refresh]);

  const drillDown = useCallback(async (d: string): Promise<DayCloseDrillDown> => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.get<DayCloseDrillDown>(`/day-closes/${d}/drill-down?business_id=${businessId}`);
  }, [businessId]);

  const recompute = useCallback(async (from: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.post<{ touched: number; from: string }>(
      `/day-closes/recompute?business_id=${businessId}&from=${from}`, {});
    await refresh();
    return r;
  }, [businessId, refresh]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  return {
    preview, closings, loading, error,
    refresh, loadPreview, list,
    closeDay, reopen, drillDown, recompute,
  };
}

/** Sayım formu için boş satır türetme yardımcısı. */
export function emptyCounts(seed: DayCloseAccountCount[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of seed) m[a.account_id] = "";
  return m;
}
