"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Business } from "@/types";

/**
 * Yalnız arşivlenmiş işletmeler — "Arşivden Çıkar" (geri yükleme) ekranı için.
 * Varsayılan /businesses listesi arşivlenmişleri gizlediğinden ayrı endpoint
 * (/businesses/archived) kullanılır. {@link refresh} ile manuel yenilenir
 * (örn. bir işletme geri yüklendiğinde).
 */
export function useArchivedBusinesses() {
  const { refreshKey } = useAppStore();
  const [archived, setArchived] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArchived = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<Business[]>("/businesses/archived");
      setArchived(data || []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Arşivlenmiş işletmeler yüklenemedi";
      logger.error("api", "Failed to fetch archived businesses", undefined, err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArchived();
  }, [fetchArchived, refreshKey]);

  return { archived, isLoading, error, refresh: fetchArchived };
}
