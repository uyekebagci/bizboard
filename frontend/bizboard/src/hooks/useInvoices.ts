"use client";

/**
 * e-Fatura listesi hook'u — tenant-scoped (businessId).
 *
 * <p>store.refreshKey değişince ve businessId/status değişince yeniden yükler.
 * Mutasyonlar (create/update/send/…) sayfa tarafında invoicesApi ile yapılır;
 * sonrasında {@link useInvoices.reload} çağrılır.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { invoicesApi } from "@/lib/api/invoices";
import { getErrorMessage } from "@/lib/errors";
import { useAppStore } from "@/lib/store";
import type { Invoice } from "@/types";

export function useInvoices(businessId?: string | null, status?: string | null) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [list, setList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoicesApi.list(businessId ?? null, status ?? null);
      setList(data);
    } catch (e) {
      setError(getErrorMessage(e));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [businessId, status]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return { list, loading, error, reload: load };
}
