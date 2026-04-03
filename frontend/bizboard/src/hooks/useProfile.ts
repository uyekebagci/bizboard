"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import type { Profile } from "@/types";

export function useProfile() {
  const { profile, setProfile } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await api.get<Profile>("/me");
        setProfile(data);
      } catch (err: any) {
        console.error("Failed to fetch profile:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [setProfile]);

  return { profile, isLoading, error };
}
