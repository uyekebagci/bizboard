"use client";

/**
 * Raporlar v1.1 (R5/R6): 13-Haftalık Nakit-Akış Tahmini + What-If senaryo motoru.
 *
 * <p>READ-ONLY analitik — mevcut kasa/ledger sayılarını DEĞİŞTİRMEZ. Geçmiş
 * akıştan + bilinen vadeli alacak/verecek/çek'ten ileriye projeksiyon. What-if
 * panelinde gelir/gider ±% + ek harcama değiştirilip tahmin yeniden hesaplanır
 * (kalıcı değişiklik yok). Glass tasarım + çift tema.</p>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp, Building2, Loader2, AlertTriangle, RotateCcw, Sparkles,
  ArrowDownRight, ArrowUpRight,
} from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import {
  getForecast, runWhatIf, type CashFlowForecast, type WhatIfScenario,
} from "@/lib/api/reports";
import { formatCurrency } from "@/lib/utils";
import { ForecastChart } from "@/components/shared/charts/ForecastChart";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const WEEK_OPTS = [
  { v: 4, label: "4 Hafta" },
  { v: 8, label: "8 Hafta" },
  { v: 13, label: "13 Hafta" },
  { v: 26, label: "26 Hafta" },
];

interface WhatIfState {
  incomeDeltaPct: number;
  expenseDeltaPct: number;
  extraWeeklyExpense: number;
  extraOneTimeExpense: number;
  extraOneTimeWeek: number;
}

const EMPTY_WHATIF: WhatIfState = {
  incomeDeltaPct: 0,
  expenseDeltaPct: 0,
  extraWeeklyExpense: 0,
  extraOneTimeExpense: 0,
  extraOneTimeWeek: 1,
};

function isActiveScenario(s: WhatIfState): boolean {
  return (
    s.incomeDeltaPct !== 0 ||
    s.expenseDeltaPct !== 0 ||
    s.extraWeeklyExpense !== 0 ||
    s.extraOneTimeExpense !== 0
  );
}

export default function ForecastPage() {
  const { businesses } = useBusinesses();
  const [weeks, setWeeks] = useState(13);
  const [businessId, setBusinessId] = useState<string>("");
  const [data, setData] = useState<CashFlowForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [whatIf, setWhatIf] = useState<WhatIfState>(EMPTY_WHATIF);

  const scenarioActive = isActiveScenario(whatIf);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let result: CashFlowForecast;
      if (scenarioActive) {
        const payload: WhatIfScenario = {
          income_delta_pct: whatIf.incomeDeltaPct || null,
          expense_delta_pct: whatIf.expenseDeltaPct || null,
          extra_weekly_expense: whatIf.extraWeeklyExpense || null,
          extra_one_time_expense: whatIf.extraOneTimeExpense || null,
          extra_one_time_week: whatIf.extraOneTimeExpense
            ? whatIf.extraOneTimeWeek
            : null,
        };
        result = await runWhatIf(payload, weeks, businessId || undefined);
      } else {
        result = await getForecast(weeks, businessId || undefined);
      }
      setData(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tahmin alınamadı");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, businessId, whatIf, scenarioActive]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, businessId]);

  const balances = useMemo(
    () => (data?.weeksData ?? []).map((w) => w.closing_balance),
    [data]
  );

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <section className="rise">
        <p className="v2-eyebrow">Raporlar</p>
        <h1 className="v2-display text-2xl mt-1">
          13-Haftalık Nakit-Akış Tahmini
        </h1>
        <p className="text-[rgb(var(--v2-muted))] mt-1 text-sm">
          Geçmiş akış + bilinen vadeli alacak/verecek/çek'ten ileriye projeksiyon.
          Salt analitik — mevcut sayıları değiştirmez.
        </p>
      </section>

      {/* Filtreler */}
      <section className="v2-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-sm">
          <span className="text-xs text-[rgb(var(--v2-muted))] mr-1">Ufuk:</span>
          <div className="flex items-center gap-1 v2-sunken p-1 rounded-xl">
            {WEEK_OPTS.map((o) => (
              <button
                key={o.v}
                onClick={() => setWeeks(o.v)}
                aria-pressed={weeks === o.v}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  weeks === o.v
                    ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                    : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Building2 size={14} className="text-[rgb(var(--v2-muted))]" />
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="py-1.5 px-3 w-auto text-sm rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
          >
            <option value="">Tüm İşletmeler</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--v2-muted))]">
            <Loader2 size={13} className="animate-spin" /> Hesaplanıyor…
          </span>
        )}
      </section>

      {/* Özet KPI + grafik */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 v2-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[rgb(var(--v2-ink))] inline-flex items-center gap-2">
              <TrendingUp size={18} className="text-accent-strong dark:text-accent" />
              Haftalık Bakiye Projeksiyonu
            </h3>
            {scenarioActive && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-status-warning/15 text-status-warning font-semibold">
                <Sparkles size={11} /> Senaryo aktif
              </span>
            )}
          </div>
          <ForecastChart
            balances={balances}
            opening={data?.opening_balance ?? 0}
            minWeek={data?.min_balance_week ?? 0}
          />
          {data?.has_shortfall && (
            <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-status-danger">
              <AlertTriangle size={14} className="shrink-0 mt-px" />
              Uyarı: projeksiyon boyunca bakiye negatife düşüyor (nakit açığı).
              En düşük: {formatCurrency(data.min_balance, "TRY")} ({data.min_balance_week}. hafta).
            </p>
          )}
        </div>

        <div className="v2-card p-5 flex flex-col gap-3">
          <KpiRow label="Açılış Bakiyesi" value={data?.opening_balance ?? 0} />
          <KpiRow label="Tahmini Kapanış" value={data?.ending_balance ?? 0} accent />
          <KpiRow label="En Düşük Bakiye" value={data?.min_balance ?? 0}
            tone={data && data.min_balance < 0 ? "negative" : undefined} />
          <div className="border-t border-[rgb(var(--v2-border))] pt-3 mt-1">
            <p className="text-[11px] text-[rgb(var(--v2-muted))]">
              Baz haftalık net akış (son {data?.baseline_lookback_weeks ?? 12} hafta ort.):
            </p>
            <p className={cn(
              "num text-sm font-bold",
              (data?.baseline_weekly_net ?? 0) >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger"
            )}>
              {formatCurrency(data?.baseline_weekly_net ?? 0, "TRY")} / hafta
            </p>
          </div>
        </div>
      </div>

      {/* What-If panel */}
      <WhatIfPanel
        state={whatIf}
        setState={setWhatIf}
        weeks={weeks}
        active={scenarioActive}
        onApply={load}
        onReset={() => setWhatIf(EMPTY_WHATIF)}
        loading={loading}
      />

      {/* Haftalık tablo */}
      <section className="v2-card p-0 overflow-hidden">
        <div className="p-4 border-b border-[rgb(var(--v2-border))]">
          <h3 className="font-bold text-[rgb(var(--v2-ink))]">Haftalık Detay</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[rgb(var(--v2-muted))] border-b border-[rgb(var(--v2-border))]">
                <th className="px-4 py-2 font-medium">Hafta</th>
                <th className="px-4 py-2 font-medium text-right">Açılış</th>
                <th className="px-4 py-2 font-medium text-right">Gelen</th>
                <th className="px-4 py-2 font-medium text-right">Giden</th>
                <th className="px-4 py-2 font-medium text-right">Net</th>
                <th className="px-4 py-2 font-medium text-right">Kapanış</th>
              </tr>
            </thead>
            <tbody>
              {(data?.weeksData ?? []).map((w) => (
                <tr key={w.index} className="border-b border-[rgb(var(--v2-border))] hover:bg-[rgb(var(--v2-sunken))] transition-colors">
                  <td className="px-4 py-2">
                    <span className="text-[rgb(var(--v2-ink))]">{w.index}. </span>
                    <span className="text-xs text-[rgb(var(--v2-muted))]">{w.label}</span>
                    {w.scheduled_items.length > 0 && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded v2-sunken text-[rgb(var(--v2-muted))]">
                        {w.scheduled_items.length} vadeli
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right num text-[rgb(var(--v2-muted))]">{formatCurrency(w.opening_balance, "TRY")}</td>
                  <td className="px-4 py-2 text-right num text-accent-strong dark:text-accent">{formatCurrency(w.inflow, "TRY")}</td>
                  <td className="px-4 py-2 text-right num text-status-danger">{formatCurrency(-w.outflow, "TRY")}</td>
                  <td className={cn("px-4 py-2 text-right num font-medium", w.net >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger")}>
                    {formatCurrency(w.net, "TRY")}
                  </td>
                  <td className={cn("px-4 py-2 text-right num font-semibold", w.closing_balance >= 0 ? "text-[rgb(var(--v2-ink))]" : "text-status-danger")}>
                    {formatCurrency(w.closing_balance, "TRY")}
                  </td>
                </tr>
              ))}
              {!loading && (data?.weeksData ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[rgb(var(--v2-muted))] text-sm">
                    Bu kapsam için projeksiyon verisi yok (erişilebilir işletme/işlem bulunamadı).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-[rgb(var(--v2-muted))]">
        Tahmin fiziksel kasa semantiğindedir (NAKIT + POS; HESAPDAN/TRANSFER hariç).
        Vadesi belli olmayan açık alacak/verecek projeksiyona dahil edilmez.
        Yabancı para borçlar güncel kurla TL'ye çevrilir.
      </p>
    </div>
  );
}

// ─────────────────────── alt bileşenler ───────────────────────

function KpiRow({
  label, value, accent, tone,
}: { label: string; value: number; accent?: boolean; tone?: "negative" }) {
  return (
    <div>
      <p className="text-[11px] text-[rgb(var(--v2-muted))]">{label}</p>
      <p className={cn(
        "num font-bold",
        accent ? "text-lg text-accent-strong dark:text-accent" : "text-base",
        tone === "negative" ? "text-status-danger" : !accent ? "text-[rgb(var(--v2-ink))]" : ""
      )}>
        {formatCurrency(value, "TRY")}
      </p>
    </div>
  );
}

function WhatIfPanel({
  state, setState, weeks, active, onApply, onReset, loading,
}: {
  state: WhatIfState;
  setState: (s: WhatIfState) => void;
  weeks: number;
  active: boolean;
  onApply: () => void;
  onReset: () => void;
  loading: boolean;
}) {
  const set = (patch: Partial<WhatIfState>) => setState({ ...state, ...patch });

  return (
    <section className="v2-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[rgb(var(--v2-ink))] inline-flex items-center gap-2">
          <Sparkles size={18} className="text-status-warning" />
          Senaryo Analizi
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onReset}
            disabled={!active || loading}
            className="v2-sunken hover:border-accent/50 v2-press rounded-xl px-3 py-1.5 text-xs font-semibold text-[rgb(var(--v2-ink))] inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <RotateCcw size={13} /> Sıfırla
          </button>
          <button
            onClick={onApply}
            disabled={loading}
            className="v2-btn v2-btn--ink v2-press text-xs inline-flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <TrendingUp size={13} />}
            Hesapla
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Gelir ± % */}
        <PctSlider
          icon={<ArrowUpRight size={14} className="text-accent-strong dark:text-accent" />}
          label="Gelir Değişimi"
          value={state.incomeDeltaPct}
          onChange={(v) => set({ incomeDeltaPct: v })}
        />
        {/* Gider ± % */}
        <PctSlider
          icon={<ArrowDownRight size={14} className="text-status-danger" />}
          label="Gider Değişimi"
          value={state.expenseDeltaPct}
          onChange={(v) => set({ expenseDeltaPct: v })}
        />
        {/* Ek haftalık gider */}
        <div>
          <label className="text-xs font-medium text-[rgb(var(--v2-ink))] block mb-1">Ek Haftalık Gider (TL)</label>
          <input
            type="number"
            min={0}
            step={100}
            value={state.extraWeeklyExpense || ""}
            onChange={(e) => set({ extraWeeklyExpense: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full px-3 py-2 text-sm rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
            placeholder="0"
          />
        </div>
        {/* Tek seferlik gider */}
        <div>
          <label className="text-xs font-medium text-[rgb(var(--v2-ink))] block mb-1">Tek Seferlik Gider (TL)</label>
          <input
            type="number"
            min={0}
            step={100}
            value={state.extraOneTimeExpense || ""}
            onChange={(e) => set({ extraOneTimeExpense: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full px-3 py-2 text-sm rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] placeholder:text-[rgb(var(--v2-muted))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
            placeholder="0"
          />
        </div>
        {/* Tek seferlik gider haftası */}
        <div>
          <label className="text-xs font-medium text-[rgb(var(--v2-ink))] block mb-1">Tek Seferlik Gider Haftası</label>
          <select
            value={state.extraOneTimeWeek}
            onChange={(e) => set({ extraOneTimeWeek: Number(e.target.value) })}
            disabled={!state.extraOneTimeExpense}
            className="w-full px-3 py-2 text-sm rounded-xl border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all disabled:opacity-50"
          >
            {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>{w}. hafta</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[11px] text-[rgb(var(--v2-muted))] mt-3">
        Senaryo değişikliği yalnızca tahmini etkiler; hiçbir kayıt değişmez.
        Yüzde sınırı −100 … +1000 arası clamp'lenir.
      </p>
    </section>
  );
}

function PctSlider({
  icon, label, value, onChange,
}: { icon: React.ReactNode; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-[rgb(var(--v2-ink))] inline-flex items-center gap-1.5">{icon}{label}</label>
        <span className={cn(
          "num text-xs font-semibold",
          value > 0 ? "text-accent-strong dark:text-accent" : value < 0 ? "text-status-danger" : "text-[rgb(var(--v2-muted))]"
        )}>
          {value > 0 ? "+" : ""}{value}%
        </span>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}
