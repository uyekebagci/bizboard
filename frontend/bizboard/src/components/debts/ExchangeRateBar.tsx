"use client";

/**
 * WP a9da4e9d (USD+Altın): Güncel kur göstergesi + "Anlık Güncelle" butonu.
 *
 * <p>Alacaklar/cari ekranlarında her zaman güncel USD/TRY ve gram altın kurunu
 * + "son güncelleme" zamanını gösterir. Buton: canlı kuru çek + bakiyeleri
 * recompute (backend) → toast "Güncel kur değeri girildi". Frontend debounce:
 * buton basınca disable + cooldown (30sn); backend de cooldown'lu (sürü istek yok).</p>
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Loader2, TrendingUp } from "lucide-react";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils";
import type { ExchangeRate } from "@/types";

const COOLDOWN_MS = 30_000;

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function ExchangeRateBar({ onRefreshed }: { onRefreshed?: () => void }) {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.get<ExchangeRate[]>("/exchange-rates");
      setRates(r || []);
    } catch {
      /* sessiz — kur gösterilemezse bar boş kalır */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onCooldown = Date.now() < cooldownUntil;

  async function handleRefresh() {
    if (refreshing || onCooldown) return;
    setRefreshing(true);
    try {
      const r = await api.post<ExchangeRate[]>("/exchange-rates/refresh", {});
      setRates(r || []);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      toast.success("Güncel kur değeri girildi");
      onRefreshed?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setRefreshing(false);
    }
  }

  const usd = rates.find((x) => x.code === "USD");
  const gold = rates.find((x) => x.code === "GOLD");
  const lastFetched = usd?.fetched_at || gold?.fetched_at;
  const isStale = (usd?.stale || gold?.stale) ?? false;

  return (
    <section className="card p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-1.5 text-surface-300">
        <TrendingUp size={15} className="text-brand-300" />
        <span className="text-xs font-medium">Güncel Kur</span>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-surface-200">
          USD/TRY:{" "}
          <span className="font-semibold text-white">
            {usd ? formatCurrency(usd.rate_to_try, "TRY") : "—"}
          </span>
        </span>
        <span className="text-surface-200">
          Gram Altın:{" "}
          <span className="font-semibold text-white">
            {gold ? formatCurrency(gold.rate_to_try, "TRY") : "—"}
          </span>
        </span>
      </div>

      <span className="text-[11px] text-surface-400">
        Son güncelleme: {formatWhen(lastFetched)}
        {isStale && <span className="ml-1 text-amber-300">(bayat)</span>}
      </span>

      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing || onCooldown}
        title={onCooldown ? "Az önce güncellendi — biraz bekleyin" : "Canlı kuru çek ve uygula"}
        className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        Anlık Güncelle
      </button>
    </section>
  );
}
