"use client";

/**
 * Ledger v2 (Faz B, §4.2): onaylı kapanış düzenleme akışı hook.
 * Liste + öneri aç (request) + onayla (approve) + reddet (reject).
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import type { DayCloseEditRequest } from "@/types";

export interface EditRequestInput {
  dayCloseId: string;
  accountCounts?: { accountId: string; countedBalance: number }[];
  varianceThreshold?: number | null;
  reasonCategory: string;
  reasonNote: string;
}

export function useDayCloseEdit(businessId?: string | null) {
  const [requests, setRequests] = useState<DayCloseEditRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const list = useCallback(async (status?: string) => {
    if (!businessId) { setRequests([]); return; }
    setLoading(true);
    try {
      const q = `business_id=${businessId}${status ? `&status=${status}` : ""}`;
      const rows = await api.get<DayCloseEditRequest[]>(`/day-close-edits?${q}`);
      setRequests(rows ?? []);
    } catch (err) {
      logger.error("api", "useDayCloseEdit list failed", { businessId }, err);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const request = useCallback(async (input: EditRequestInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.post<DayCloseEditRequest>(`/day-close-edits?business_id=${businessId}`, {
      day_close_id: input.dayCloseId,
      account_counts: input.accountCounts?.map((c) => ({
        account_id: c.accountId, counted_balance: c.countedBalance,
      })) ?? null,
      variance_threshold: input.varianceThreshold ?? null,
      reason_category: input.reasonCategory,
      reason_note: input.reasonNote,
    });
    await list();
    return r;
  }, [businessId, list]);

  const approve = useCallback(async (editId: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.post<DayCloseEditRequest>(
      `/day-close-edits/${editId}/approve?business_id=${businessId}`, {});
    await list();
    return r;
  }, [businessId, list]);

  const reject = useCallback(async (editId: string, rejectNote: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const r = await api.post<DayCloseEditRequest>(
      `/day-close-edits/${editId}/reject?business_id=${businessId}`, { reject_note: rejectNote });
    await list();
    return r;
  }, [businessId, list]);

  useEffect(() => { void list(); }, [list]);

  return { requests, loading, list, request, approve, reject };
}
