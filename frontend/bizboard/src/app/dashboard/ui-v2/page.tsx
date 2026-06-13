"use client";

/**
 * UI v2 — Daxa "Overview Panel" REFERANS sayfası (showcase).
 *
 * <p>Yeni tasarım yönünü gösteren canlı referans implementasyon. Kullanıcı
 * onayı için /dashboard/ui-v2 altında izole; mevcut /dashboard DOKUNULMADI.
 * Onay sonrası broad rollout (docs/ui-v2-direction.md → rollout planı).</p>
 *
 * <p>Gerçek veri: usePortfolio + useBusinesses. Sentetik olanlar yalnız görsel
 * motifler (gauge marjı arkı, haftalık trend barları, insight örnekleri).</p>
 */

import { useState } from "react";
import {
  Wallet,
  TrendingUp,
  Banknote,
  Receipt,
  Building2,
  AlertTriangle,
  CalendarCheck,
  PiggyBank,
} from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import { usePortfolio } from "@/hooks/usePortfolio";
import { formatCurrency } from "@/lib/utils";
import {
  getDefaultPeriod,
  setDefaultPeriod,
  PERIODS,
  periodLabel,
  type Period,
} from "@/lib/preferences";
import {
  MetricCard,
  GaugeArc,
  BarChartMini,
  StackInsightCard,
  AssistantPanel,
  AnimatedNumber,
  Reveal,
} from "@/components/v2";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return "Gunaydin";
  if (hour >= 12 && hour < 17) return "Iyi gunler";
  if (hour >= 17 && hour < 23) return "Iyi aksamlar";
  return "Iyi geceler";
}

const tl = (n: number) => formatCurrency(n);

export default function DashboardV2Page() {
  const { businesses } = useBusinesses();
  const [period, setPeriod] = useState<Period>(() => getDefaultPeriod());
  const { portfolio } = usePortfolio(period);

  function handlePeriodChange(next: Period) {
    setPeriod(next);
    setDefaultPeriod(next);
  }

  const income = portfolio?.total_income ?? 0;
  const expense =
    portfolio?.total_expense_with_fixed ?? portfolio?.total_expense ?? 0;
  const net = portfolio?.net_profit_with_fixed ?? portfolio?.net_profit ?? 0;
  const fixed = portfolio?.fixed_cost_total ?? 0;
  const bizCount = portfolio?.business_count ?? businesses.length;

  // Net kar marjı (gauge) — gelir>0 ise net/gelir, aksi 0.
  const margin = income > 0 ? Math.max(0, Math.min(1, net / income)) : 0;

  // Haftalık trend (görsel motif — son barı highlight).
  const weekBars = [
    { value: 42, label: "Pzt" },
    { value: 55, label: "Sal" },
    { value: 38, label: "Çar" },
    { value: 67, label: "Per" },
    { value: 49, label: "Cum" },
    { value: 73, label: "Cmt" },
    { value: Math.max(20, Math.round(margin * 100)) || 80, label: "Bug", highlight: true },
  ];

  return (
    // Showcase kendi zeminini katmanlar (.v2-app-bg) — shell'i bozmadan v2 görünümü.
    <div className="v2-app-bg -mx-4 -mt-4 px-4 pt-4 pb-4 rounded-t-2xl">
      <div className="space-y-5 max-w-7xl mx-auto">
        {/* Hero başlık + periyot */}
        <Reveal as="section" index={0} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="v2-eyebrow text-accent-strong dark:text-accent">
              {getGreeting()} • UI v2 önizleme
            </p>
            <h1 className="v2-display text-3xl sm:text-5xl mt-2">
              Overview Panel
            </h1>
            <p className="text-[rgb(var(--v2-muted))] text-sm mt-2">
              {bizCount} işletme • {periodLabel(period).toLowerCase()} özeti
            </p>
          </div>
          <div className="v2-sunken inline-flex flex-wrap items-center gap-1 p-1 rounded-xl text-sm">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                aria-pressed={period === p}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all v2-press ${
                  period === p
                    ? "bg-[rgb(var(--v2-ink))] text-[rgb(var(--v2-card))]"
                    : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
                }`}
              >
                {periodLabel(p)}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Metrik kartı grid — mobile-first (1→2→4 kolon), stagger giriş */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Reveal index={1}>
            <MetricCard
              label="Net Kar"
              value={net}
              format={tl}
              icon={Wallet}
              variant="ink"
              delta={12.4}
              segments={[
                { value: Math.max(1, net), tone: "accent" },
                { value: Math.max(1, expense), tone: "muted" },
              ]}
            />
          </Reveal>
          <Reveal index={2}>
            <MetricCard
              label="Toplam Gelir"
              value={income}
              format={tl}
              icon={TrendingUp}
              variant="accent"
              delta={8.1}
              segments={[
                { value: Math.max(1, income), tone: "accent" },
                { value: Math.max(1, expense), tone: "ink" },
              ]}
            />
          </Reveal>
          <Reveal index={3}>
            <MetricCard
              label="Toplam Gider"
              value={expense}
              format={tl}
              icon={Receipt}
              delta={-3.2}
              segments={[
                { value: Math.max(1, expense - fixed), tone: "muted" },
                { value: Math.max(0, fixed), tone: "negative" },
              ]}
            />
          </Reveal>
          <Reveal index={4}>
            <MetricCard
              label="İşletme"
              value={bizCount}
              format={(n) => Math.round(n).toString()}
              icon={Building2}
              segments={[{ value: bizCount, tone: "accent" }]}
            />
          </Reveal>
        </section>

        {/* Orta sıra — gauge + bar-chart + asistan paneli */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Net kar marjı gauge */}
          <Reveal index={5} className="v2-card v2-lift p-5 sm:p-6 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between">
              <span className="v2-eyebrow">Net Kar Marjı</span>
              <span className="v2-chip-accent">
                <PiggyBank size={13} /> hedef %30
              </span>
            </div>
            <GaugeArc
              progress={margin}
              value={`%${Math.round(margin * 100)}`}
              label="marj"
              size={200}
              className="my-2"
            />
            <p className="text-xs text-[rgb(var(--v2-muted))] text-center">
              Gelir{" "}
              <AnimatedNumber
                value={income}
                format={tl}
                className="font-semibold text-[rgb(var(--v2-ink))]"
              />{" "}
              üzerinden
            </p>
          </Reveal>

          {/* Haftalık trend bar-chart */}
          <Reveal index={6} className="v2-card v2-lift p-5 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="v2-eyebrow">Haftalık Hareket</span>
              <span className="v2-chip-ink">
                <CalendarCheck size={13} /> bu hafta
              </span>
            </div>
            <BarChartMini bars={weekBars} height={140} showLabels className="flex-1" />
          </Reveal>

          {/* AI-asistan motifi */}
          <Reveal index={7}>
            <AssistantPanel
              messages={[
                {
                  from: "assistant",
                  text: `Bu dönem net kâr ${tl(net)}. Kar marjı %${Math.round(
                    margin * 100
                  )}.`,
                },
                { from: "user", text: "En çok hangi işletme katkı sağladı?" },
                {
                  from: "assistant",
                  text: "Detaylı dağılım için işletme grafiğine bakabilirsin.",
                },
              ]}
            />
          </Reveal>
        </section>

        {/* Alt sıra — stack insight kartları */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Reveal index={8}>
            <StackInsightCard
              title="Öne Çıkanlar"
              insights={[
                {
                  icon: TrendingUp,
                  title: "Net kâr yükselişte",
                  detail: "Geçen döneme göre +%12.4",
                  value: tl(net),
                  tone: "accent",
                },
                {
                  icon: Banknote,
                  title: "Sabit giderler",
                  detail: "Toplam giderin parçası",
                  value: tl(fixed),
                  tone: "neutral",
                },
                {
                  icon: Building2,
                  title: "Aktif işletme",
                  detail: "Portföy genelinde",
                  value: `${bizCount}`,
                  tone: "neutral",
                },
              ]}
            />
          </Reveal>
          <Reveal index={9}>
            <StackInsightCard
              title="Dikkat Gerektirenler"
              insights={[
                {
                  icon: AlertTriangle,
                  title: "Gün kapanışı bekleyen",
                  detail: "Bugün için onay bekliyor",
                  value: "2",
                  tone: "negative",
                },
                {
                  icon: Receipt,
                  title: "Yüksek gider günü",
                  detail: "Ortalamanın üzerinde",
                  value: tl(expense),
                  tone: "negative",
                },
                {
                  icon: CalendarCheck,
                  title: "Yaklaşan vergi",
                  detail: "Bu ay içinde",
                  value: "—",
                  tone: "neutral",
                },
              ]}
            />
          </Reveal>
        </section>

        <p className="text-center text-xs text-[rgb(var(--v2-muted))] pt-2">
          UI v2 referans önizleme — onay sonrası ana sayfaya uygulanır.
        </p>
      </div>
    </div>
  );
}
