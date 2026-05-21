"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { CashClosing, CashClosingPreview, PagedResponse, CashClosingReason } from "@/types";

/**
 * v1.6.19 (WP-2): Bugünün kapanış preview'i + dünün kapanışı (Dünden Kalan Eksik
 * widget için) + manuel kapama + admin reopen + arşiv listesi.
 *
 * <p>v1.6.23.13 (TODO 24990efa): Global refreshKey dependency eklendi —
 * herhangi bir sayfadan triggerRefresh() (örn. tx ekledikten sonra) çağrılırsa
 * preview/today/yesterday otomatik re-fetch eder. Önceden tx ekledikten sonra
 * "Bugünün Kasa Durumu" widget stale kalıyordu.</p>
 *
 * Kullanım örnekleri:
 *   const { preview, yesterday, refresh } = useCashClosing();          // dashboard widget
 *   const { closings, list } = useCashClosing();                       // /kapanislar sayfası
 */
export function useCashClosing() {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [preview, setPreview] = useState<CashClosingPreview | null>(null);
  const [today, setToday] = useState<CashClosing | null>(null);
  const [yesterday, setYesterday] = useState<CashClosing | null>(null);
  const [closings, setClosings] = useState<CashClosing[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [prev, t, y] = await Promise.all([
        api.get<CashClosingPreview>("/closings/preview").catch(() => null),
        api.get<CashClosing>("/closings/today").catch(() => null),
        api.get<CashClosing>("/closings/yesterday").catch(() => null),
      ]);
      setPreview(prev);
      setToday(t);
      setYesterday(y);
      setError(null);
    } catch (err) {
      logger.error("api", "useCashClosing refresh failed", undefined, err);
      setError("Kapanış verileri yuklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  const list = useCallback(async (nextPage = 0, size = 50) => {
    setLoading(true);
    try {
      const r = await api.get<PagedResponse<CashClosing>>(
        `/closings?page=${nextPage}&size=${size}`,
      );
      setClosings(r.items ?? []);
      setPage(r.page ?? 0);
      setTotalElements(r.total_elements ?? 0);
      setHasNext(r.has_next ?? false);
      setError(null);
    } catch (err) {
      logger.error("api", "useCashClosing list failed", undefined, err);
      setError("Liste yuklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  const closeToday = useCallback(async (input: {
    actualBalance: number;
    reasonCategory?: CashClosingReason | null;
    reasonNote?: string | null;
  }) => {
    const r = await api.post<CashClosing>("/closings/today", {
      actual_balance: input.actualBalance,
      reason_category: input.reasonCategory || null,
      reason_note: input.reasonNote || null,
    });
    await refresh();
    return r;
  }, [refresh]);

  const reopen = useCallback(async (closingId: string, reasonNote: string) => {
    const r = await api.post<CashClosing>(`/closings/${closingId}/reopen`, {
      reason_note: reasonNote,
    });
    await refresh();
    return r;
  }, [refresh]);

  useEffect(() => {
    void refresh();
    // refreshKey global trigger ile bağlı (tx ekleme/silme/edit/POS settle vs.)
  }, [refresh, refreshKey]);

  return {
    preview, today, yesterday,
    closings, totalElements, page, hasNext,
    loading, error,
    refresh, list, closeToday, reopen,
  };
}
