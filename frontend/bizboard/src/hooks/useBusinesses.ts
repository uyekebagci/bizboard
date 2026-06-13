"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import type { Business } from "@/types";

export function useBusinesses() {
  const { businesses, setBusinesses, refreshKey } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBusinesses() {
      setIsLoading(true);
      try {
        const data = await api.get<Business[]>("/businesses");
        setBusinesses(data || []);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "İşletmeler yüklenemedi";
        logger.error("api", "Failed to fetch businesses", undefined, err);
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchBusinesses();
  }, [setBusinesses, refreshKey]);

  return { businesses, isLoading, error };
}
