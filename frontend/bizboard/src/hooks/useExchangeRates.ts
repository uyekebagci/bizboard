"use client";

/**
 * WP currency-display: güncel kur (USD + gram altın) okuma + "Kuru Güncelle".
 *
 * <p>Tek kaynak: GET /exchange-rates (USD/GOLD/coin'ler) ve POST
 * /exchange-rates/refresh (kuru çek + tüm cari bakiyeleri backend'de recompute).
 * ExchangeRateBar ile AYNI endpoint'leri kullanır — yeni mantık icat edilmez.</p>
 *
 * <p>USD karşılığı için {@link usdRate}, gram altın karşılığı için {@link goldRate}.
 * goldRate null ise altın fiyatı kaynağı (cache) henüz dolmamış demektir →
 * çağıran taraf altın karşılığını placeholder/skeleton bırakmalı.</p>
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/lib/store";
import type { ExchangeRate } from "@/types";

/** ExchangeRateBar ile aynı debounce — arka arkaya basışı engelle. */
const COOLDOWN_MS = 30_000;

export interface UseExchangeRatesResult {
  rates: ExchangeRate[];
  /** 1 USD = ? TL (null → kur cache'i boş). */
  usdRate: number | null;
  /** 1 gram altın = ? TL (null → altın fiyatı kaynağı henüz yok). */
  goldRate: number | null;
  /** Herhangi bir kur bayat (dış API down) mı. */
  isStale: boolean;
  /** USD veya GOLD'un en güncel fetched_at (gösterim). */
  lastFetched: string | null;
  /** "Kuru Güncelle" çalışıyor mu. */
  refreshing: boolean;
  /** Cooldown aktif mi (buton disable). */
  onCooldown: boolean;
  /** Canlı kuru çek + bakiyeleri recompute (backend). onDone: tetikleyici. */
  refresh: (onDone?: () => void) => Promise<void>;
}

export function useExchangeRates(): UseExchangeRatesResult {
  // refreshKey değişince (başka yerde "Anlık Güncelle" basılınca) kurları tazele.
  const { refreshKey } = useAppStore();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.get<ExchangeRate[]>("/exchange-rates");
      setRates(r || []);
    } catch {
      /* sessiz — kur gösterilemezse karşılık satırı placeholder kalır */
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const onCooldown = Date.now() < cooldownUntil;

  const refresh = useCallback(async (onDone?: () => void) => {
    if (refreshing || Date.now() < cooldownUntil) return;
    setRefreshing(true);
    try {
      const r = await api.post<ExchangeRate[]>("/exchange-rates/refresh", {});
      setRates(r || []);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      toast.success("Güncel kur değeri girildi");
      onDone?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, cooldownUntil]);

  const byCode = (c: ExchangeRate["code"]) => rates.find((x) => x.code === c);
  const usd = byCode("USD");
  const gold = byCode("GOLD");

  return {
    rates,
    usdRate: usd?.rate_to_try ?? null,
    goldRate: gold?.rate_to_try ?? null,
    isStale: rates.some((r) => r.stale),
    lastFetched: usd?.fetched_at || gold?.fetched_at || null,
    refreshing,
    onCooldown,
    refresh,
  };
}
