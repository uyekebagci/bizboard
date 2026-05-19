"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { sortGroups } from "@/lib/business-groups";
import type { BusinessGroup, GroupPriority } from "@/types";

/**
 * v1.6.12: Kullanıcının business group'larını fetch + mutate eden hook.
 *
 * Tüm mutate işlemleri optimistic değil — backend dönen güncel listeyi tekrar set eder.
 * Sıralama her zaman client-side guard ile (priority ASC, order_index ASC, created_at ASC).
 */
export function useBusinessGroups() {
  const [groups, setGroups] = useState<BusinessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<BusinessGroup[]>("/me/business-groups");
      setGroups(sortGroups(data || []));
      setError(null);
    } catch (err) {
      logger.error("api", "useBusinessGroups: fetch failed", undefined, err);
      setError("Gruplar yuklenemedi");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Mutations ──
  const createGroup = useCallback(async (input: {
    name: string;
    color: string;
    priority: GroupPriority;
  }) => {
    const created = await api.post<BusinessGroup>("/me/business-groups", input);
    setGroups((prev) => sortGroups([...prev, created]));
    return created;
  }, []);

  const updateGroup = useCallback(async (
    groupId: string,
    input: { name?: string; color?: string; priority?: GroupPriority },
  ) => {
    const updated = await api.patch<BusinessGroup>(
      `/me/business-groups/${groupId}`, input,
    );
    setGroups((prev) => sortGroups(prev.map((g) => (g.id === groupId ? updated : g))));
    return updated;
  }, []);

  const deleteGroup = useCallback(async (groupId: string) => {
    await api.delete(`/me/business-groups/${groupId}`);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const addMember = useCallback(async (groupId: string, businessId: string) => {
    const updated = await api.post<BusinessGroup>(
      `/me/business-groups/${groupId}/members`,
      { business_id: businessId },
    );
    setGroups((prev) => sortGroups(prev.map((g) => (g.id === groupId ? updated : g))));
    return updated;
  }, []);

  const removeMember = useCallback(async (groupId: string, businessId: string) => {
    await api.delete(`/me/business-groups/${groupId}/members/${businessId}`);
    setGroups((prev) => prev.map((g) => g.id === groupId
      ? { ...g, members: g.members.filter((m) => m.business_id !== businessId) }
      : g,
    ));
  }, []);

  const reorderGroups = useCallback(async (ids: string[]) => {
    const updated = await api.post<BusinessGroup[]>(
      "/me/business-groups/reorder", { ids },
    );
    setGroups(sortGroups(updated || []));
  }, []);

  const reorderMembers = useCallback(async (
    groupId: string, businessIds: string[],
  ) => {
    const updated = await api.post<BusinessGroup>(
      `/me/business-groups/${groupId}/members/reorder`,
      { ids: businessIds },
    );
    setGroups((prev) => sortGroups(prev.map((g) => (g.id === groupId ? updated : g))));
    return updated;
  }, []);

  return {
    groups, loading, error,
    refresh,
    createGroup, updateGroup, deleteGroup,
    addMember, removeMember,
    reorderGroups, reorderMembers,
  };
}
