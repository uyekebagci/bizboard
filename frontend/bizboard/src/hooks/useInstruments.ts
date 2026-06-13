"use client";

/**
 * Ledger v2 (Faz D, §3.7): çek/senet (Instrument) portföy hook'u.
 *
 * <p>Portföy listesi + manuel giriş + tahsil/ödeme (Σ=0 posting) + karşılıksız +
 * ciro. Posting çekirdeğine bağlı YENİ model (v1.7 /cheques'tan ayrı).</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";

export interface Instrument {
  id: string;
  type: "CHECK" | "PROMISSORY_NOTE";
  direction: "RECEIVED" | "GIVEN";
  amount: number;
  currency: string;
  issuer_counterpart_id?: string | null;
  issuer_name?: string | null;
  our_company_id?: string | null;
  our_company_name?: string | null;
  bank_name?: string | null;
  serial_no?: string | null;
  issue_date?: string | null;
  due_date: string;
  status: "PENDING_OCR" | "CONFIRMED" | "CASHED" | "BOUNCED" | "ENDORSED";
  endorsed_to_name?: string | null;
  /** Cross-link: tahsil/ödeme entry'si (CASHED iken) — işlem↔instrument bağı. */
  journal_entry_id?: string | null;
  cashed_account_id?: string | null;
  cashed_account_name?: string | null;
  cashed_at?: string | null;
  source: string;
  photo_url?: string | null;
  notes?: string | null;
  created_at?: string | null;
  days_to_due?: number | null;
}

export interface CreateInstrumentInput {
  type: string;
  direction: string;
  amount: number;
  currency?: string;
  issuer_counterpart_id?: string | null;
  our_company_id?: string | null;
  bank_name?: string | null;
  serial_no?: string | null;
  issue_date?: string | null;
  due_date: string;
  notes?: string | null;
}

export function useInstruments(businessId?: string | null, status?: string) {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [list, setList] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) { setList([]); return; }
    setLoading(true);
    try {
      const q = status ? `&status=${status}` : "";
      const rows = await api.get<Instrument[]>(`/instruments?business_id=${businessId}${q}`);
      setList(rows ?? []);
      setError(null);
    } catch (err) {
      logger.error("api", "useInstruments load failed", { businessId }, err);
      setError("Çek/senet portföyü yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [businessId, status]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const create = useCallback(async (input: CreateInstrumentInput) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<Instrument>(`/instruments?business_id=${businessId}`, input);
    await load();
    return d;
  }, [businessId, load]);

  // PENDING_OCR (OCR/Telegram taslağı) → CONFIRMED: evrakı portföye al.
  // Para hareketi yok; sadece durum geçişi. Backend yalnız PENDING_OCR'ı onaylar.
  const confirm = useCallback(async (id: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<Instrument>(`/instruments/${id}/confirm?business_id=${businessId}`, {});
    await load();
    return d;
  }, [businessId, load]);

  const cash = useCallback(async (id: string, accountId: string, cashedDate?: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<Instrument>(`/instruments/${id}/cash?business_id=${businessId}`, {
      account_id: accountId,
      cashed_date: cashedDate ?? null,
    });
    await load();
    return d;
  }, [businessId, load]);

  // Çek/senet ↔ nakit tahsilat bağını kopar (reverse → CONFIRMED). P&L-nötr:
  // silinen entry'de PNL bacağı yoktu → Net Kâr Δ=0; idempotent.
  const uncash = useCallback(async (id: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<Instrument>(`/instruments/${id}/uncash?business_id=${businessId}`, {});
    await load();
    return d;
  }, [businessId, load]);

  // tx-form öneri kartı: bir cari'nin AÇIK (CONFIRMED) evrakları, yöne göre.
  // direction = RECEIVED (gelir → alacak) | GIVEN (gider → borç). Liste yenilemez.
  const listOpenByCounterpart = useCallback(
    async (counterpartId: string, direction: "RECEIVED" | "GIVEN"): Promise<Instrument[]> => {
      if (!businessId || !counterpartId) return [];
      try {
        const rows = await api.get<Instrument[]>(
          `/instruments/open?business_id=${businessId}&counterpart_id=${counterpartId}&direction=${direction}`,
        );
        return rows ?? [];
      } catch (err) {
        logger.error("api", "listOpenByCounterpart failed", { counterpartId, direction }, err);
        return [];
      }
    },
    [businessId],
  );

  const bounce = useCallback(async (id: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<Instrument>(`/instruments/${id}/bounce?business_id=${businessId}`, {});
    await load();
    return d;
  }, [businessId, load]);

  const endorse = useCallback(async (id: string, toCounterpartId: string, notes?: string) => {
    if (!businessId) throw new Error("business_id zorunlu");
    const d = await api.post<Instrument>(`/instruments/${id}/endorse?business_id=${businessId}`, {
      to_counterpart_id: toCounterpartId,
      notes: notes ?? null,
    });
    await load();
    return d;
  }, [businessId, load]);

  return { list, loading, error, reload: load, create, confirm, cash, uncash, listOpenByCounterpart, bounce, endorse };
}
