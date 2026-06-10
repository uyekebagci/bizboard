"use client";

/**
 * Ledger v2 (Faz C, §3.11 / TODO 4+7): operatör kâr-merkezi READ-ONLY statement.
 *
 * <p>Operatör listesi (özet bakiye) + tek operatör detay statement (satırlı).
 * Manuel giriş YOK — sadece okuma.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { OperatorStatement } from "@/types";

export function useOperatorStatements(businessId?: string | null) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [operators, setOperators] = useState<OperatorStatement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useCallback(async () => {
    if (!businessId) { setOperators([]); return; }
    setLoading(true);
    try {
      const rows = await api.get<OperatorStatement[]>(
        `/operator-statements?business_id=${businessId}`);
      setOperators(rows ?? []);
      setError(null);
    } catch (err) {
      logger.error("api", "useOperatorStatements list failed", { businessId }, err);
      setError("Operatör kasaları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void list(); }, [list, refreshKey]);

  const statement = useCallback(async (accountId: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    return api.get<OperatorStatement>(
      `/operator-statements/${accountId}?business_id=${businessId}`);
  }, [businessId]);

  return { operators, loading, error, refresh: list, statement };
}
