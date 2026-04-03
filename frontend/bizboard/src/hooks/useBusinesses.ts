"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
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
      } catch (err: any) {
        console.error("Failed to fetch businesses:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchBusinesses();
  }, [setBusinesses, refreshKey]);

  return { businesses, isLoading, error };
}
