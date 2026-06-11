"use client";

/**
 * Ledger v2 (Faz B — Gün Açılışı): gün AÇILIŞ state machine + DEVİR YUVARLAMA hook.
 *
 * <p>Hesap-başı açılış önizlemesi (otomatik devir = carriedOver), "Günü Aç"
 * (elle yuvarlama → Σ=0 düzeltme posting'i), açılış geçmişi, birleşik gün durumu
 * (AÇILMAMIŞ/AÇIK/KAPALI) + işlem-giriş gating kararı, admin geri-alma.
 * {@code refreshKey} ile global tetiğe bağlı (işlem girilince devir güncellenir).</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { DayOpen, DayStatus } from "@/types";

export interface OpenDayInput {
  openDate?: string | null;
  accountOpenings: { accountId: string; roundedOpening: number }[];
  reasonNote?: string | null;
  override?: boolean;
}

export function useDayOpen(businessId?: string | null, date?: string | null) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [preview, setPreview] = useState<DayOpen | null>(null);
  const [opens, setOpens] = useState<DayOpen[]>([]);
  const [status, setStatus] = useState<DayStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async (d?: string | null) => {
    if (!businessId) { setPreview(null); return; }
    const q = `business_id=${businessId}${d ? `&date=${d}` : ""}`;
    try {
      const p = await api.get<DayOpen>(`/day-opens/preview?${q}`);
      setPreview(p);
      setError(null);
    } catch (err) {
      logger.error("api", "useDayOpen preview failed", { businessId, d }, err);
      setError("Açılış önizlemesi yüklenemedi");
    }
  }, [businessId]);

  const loadStatus = useCallback(async (d?: string | null) => {
    if (!businessId) { setStatus(null); return; }
    const q = `business_id=${businessId}${d ? `&date=${d}` : ""}`;
    try {
      const s = await api.get<DayStatus>(`/day-opens/status?${q}`);
      setStatus(s);
    } catch (err) {
      logger.error("api", "useDayOpen status failed", { businessId, d }, err);
    }
  }, [businessId]);

  const list = useCallback(async () => {
    if (!businessId) { setOpens([]); return; }
    setLoading(true);
    try {
      const rows = await api.get<DayOpen[]>(`/day-opens?business_id=${businessId}`);
      setOpens(rows ?? []);
      setError(null);
    } catch (err) {
      logger.error("api", "useDayOpen list failed", { businessId }, err);
      setError("Açılış listesi yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const refresh = useCallback(async () => {
    await Promise.all([loadPreview(date), loadStatus(date), list()]);
  }, [loadPreview, loadStatus, list, date]);

  const openDay = useCallback(async (input: OpenDayInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.post<DayOpen>(`/day-opens?business_id=${businessId}`, {
      open_date: input.openDate ?? null,
      account_openings: input.accountOpenings.map((o) => ({
        account_id: o.accountId,
        rounded_opening: o.roundedOpening,
      })),
      reason_note: input.reasonNote ?? null,
      override: input.override ?? false,
    });
    await refresh();
    return r;
  }, [businessId, refresh]);

  const revertOpen = useCallback(async (d: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.delete<{ reverted: boolean; date: string }>(
      `/day-opens/${d}?business_id=${businessId}`);
    await refresh();
    return r;
  }, [businessId, refresh]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  return {
    preview, opens, status, loading, error,
    refresh, loadPreview, loadStatus, list,
    openDay, revertOpen,
  };
}
