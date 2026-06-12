"use client";

/**
 * "Para İzi" (fund-trail) — işlem↔işlem fon-bağlama + tahsis + çift-yönlü görünüm.
 *
 * <p>Bir işlemin detayında "bu para nereden geldi" (sources) + "nereye gitti"
 * (usages) + kaynaktaki kalan gösterilir. Bağlama (bind) bir hedef işlemi bir
 * kaynak işleme bağlar; tahsis tutarı kaynağın kalanını aşamaz (BE guard).</p>
 *
 * <p><b>STRICT:</b> bu yalnız izlenebilirlik metadata'sıdır — bakiye/Net Kâr
 * DEĞİŞMEZ. Endpoint'ler {@code /businesses/{biz}/transactions/{tx}/...}.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";

export interface FundLink {
  id: string;
  amount: number;
  note?: string | null;
  created_at?: string | null;
  // Kaynak (source) işlem özeti
  source_transaction_id: string;
  source_direction?: string | null;
  source_amount?: number | null;
  source_date?: string | null;
  source_description?: string | null;
  source_counterpart_name?: string | null;
  // Hedef (target) işlem özeti
  target_transaction_id: string;
  target_direction?: string | null;
  target_amount?: number | null;
  target_date?: string | null;
  target_description?: string | null;
  target_counterpart_name?: string | null;
}

export interface FundTrail {
  amount: number;
  allocated: number;
  remaining: number;
  sources: FundLink[];
  usages: FundLink[];
  fully_allocated: boolean;
}

export interface FundSourceCandidate {
  transaction_id: string;
  direction?: string | null;
  amount: number;
  allocated: number;
  remaining: number;
  date?: string | null;
  description?: string | null;
  counterpart_name?: string | null;
}

const EMPTY_TRAIL: FundTrail = {
  amount: 0,
  allocated: 0,
  remaining: 0,
  sources: [],
  usages: [],
  fully_allocated: false,
};

export function useFundTrail(businessId?: string | null, txId?: string | null) {
  const [trail, setTrail] = useState<FundTrail>(EMPTY_TRAIL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useCallback(
    () => `/businesses/${businessId}/transactions/${txId}`,
    [businessId, txId],
  );

  const load = useCallback(async () => {
    if (!businessId || !txId) {
      setTrail(EMPTY_TRAIL);
      return;
    }
    setLoading(true);
    try {
      const t = await api.get<FundTrail>(`${base()}/fund-trail`);
      setTrail(t ?? EMPTY_TRAIL);
      setError(null);
    } catch (err) {
      logger.error("api", "useFundTrail load failed", { businessId, txId }, err);
      setError("Para izi yüklenemedi");
      setTrail(EMPTY_TRAIL);
    } finally {
      setLoading(false);
    }
  }, [businessId, txId, base]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Bağlanabilir kaynak adayları (kalanı > 0; bu tx hariç). */
  const listSourceCandidates = useCallback(async (): Promise<FundSourceCandidate[]> => {
    if (!businessId || !txId) return [];
    try {
      const rows = await api.get<FundSourceCandidate[]>(`${base()}/fund-sources`);
      return rows ?? [];
    } catch (err) {
      logger.error("api", "useFundTrail candidates failed", { businessId, txId }, err);
      return [];
    }
  }, [businessId, txId, base]);

  /** Fon-bağı oluştur: bu (hedef) işlemi bir kaynak işleme bağla. */
  const bind = useCallback(
    async (sourceTransactionId: string, amount: number, note?: string) => {
      if (!businessId || !txId) throw new Error("business_id / tx zorunlu");
      const d = await api.post<FundLink>(`${base()}/fund-links`, {
        source_transaction_id: sourceTransactionId,
        amount,
        note: note ?? null,
      });
      await load();
      return d;
    },
    [businessId, txId, base, load],
  );

  /** Fon-bağını kopar (unlink). */
  const unlink = useCallback(
    async (linkId: string) => {
      if (!businessId || !txId) throw new Error("business_id / tx zorunlu");
      await api.delete(`${base()}/fund-links/${linkId}`);
      await load();
    },
    [businessId, txId, base, load],
  );

  return { trail, loading, error, reload: load, listSourceCandidates, bind, unlink };
}
