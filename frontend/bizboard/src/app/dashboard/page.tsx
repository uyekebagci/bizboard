"use client";

/**
 * Dashboard — "Genel Bakış" (UI v2 / Daxa "Overview Panel").
 *
 * <p>v1.6.x → UI v2 promote: showcase'teki (/dashboard/ui-v2) yeni Daxa
 * tasarımı GERÇEK landing sayfası oldu. Görsel hero katmanı (metrik kartları,
 * net-kâr marjı gauge'ı, haftalık hareket, asistan motifi, insight stack'leri)
 * + ESKİ dashboard'ın KRİTİK işlevsel widget'ları korunur:</p>
 *
 * <ul>
 *   <li>{@link CarryOverBanner} — "Dünden Kalan Eksik/Fazla" (gün-kapanışı taşıma)</li>
 *   <li>{@link AlertsWidget} — envanter/personel uyarıları (gerçek veri)</li>
 *   <li>{@link GroupedBusinessGrid} — işletme kartları + gruplama + "İşletme Ekle"</li>
 *   <li>{@link RecentActivity} — son işlemler (tıklanabilir)</li>
 * </ul>
 *
 * <p>Veri: usePortfolio + useBusinesses (dönem seçici localStorage'a yazılır).
 * Borç/alacak özeti gerçek API'den çekilip "Dikkat Gerektirenler" insight'ına
 * beslenir. Haftalık-trend barları (GET /portfolio/activity/daily) ve
 * MetricCard delta yüzdeleri (GET /portfolio/comparison) artık GERÇEK
 * veriden gelir (usePortfolioCharts) — veri yoksa nötr boş-durum, uydurma
 * sayı yok.</p>
 */

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  TrendingUp,
  Banknote,
  Receipt,
  Building2,
  AlertTriangle,
  CalendarCheck,
  PiggyBank,
  Scale,
  ArrowDownLeft,
} from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import { usePortfolio } from "@/hooks/usePortfolio";
import { usePortfolioCharts } from "@/hooks/usePortfolioCharts";
import { api } from "@/lib/api/client";
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
  WidgetDetailModal,
  type Insight,
} from "@/components/v2";
import {
  PortfolioMetricDetail,
  metricDetailTitle,
  metricDetailSubtitle,
  type MetricKind,
} from "@/components/dashboard/PortfolioMetricDetail";
import { CarryOverBanner } from "@/components/closing/CarryOverBanner";
import { AlertsWidget } from "@/components/dashboard/AlertsWidget";
import { GroupedBusinessGrid } from "@/components/dashboard/groups/GroupedBusinessGrid";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 17) return "İyi günler";
  if (hour >= 17 && hour < 23) return "İyi akşamlar";
  return "İyi geceler";
}

const tl = (n: number) => formatCurrency(n);

/** ISO tarihten (yyyy-MM-dd) Türkçe kısa gün etiketi (Pzt..Paz). */
const TR_WEEKDAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
function weekdayLabel(isoDate: string): string {
  // Saat dilimi kaymasını önlemek için yerel gün olarak ayrıştır.
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return TR_WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? "";
}

interface DebtSummary {
  receivable_count: number;
  payable_count: number;
  pending_receivable: number;
  pending_payable: number;
}

/** Portföy genelinde bekleyen borç/alacak — "Dikkat Gerektirenler" beslemesi. */
function useDebtTotals(businessIds: string[]) {
  const [totals, setTotals] = useState<{
    receivable: number;
    payable: number;
    rCount: number;
    pCount: number;
  } | null>(null);

  // Stabil bağımlılık: id listesini virgülle birleştir (referans değişimini yut).
  const key = businessIds.join(",");

  useEffect(() => {
    if (businessIds.length === 0) {
      setTotals(null);
      return;
    }
    let alive = true;
    Promise.all(
      businessIds.map((id) =>
        api
          .get<DebtSummary>(`/businesses/${id}/debts/summary`)
          .catch(() => null)
      )
    )
      .then((results) => {
        if (!alive) return;
        let receivable = 0;
        let payable = 0;
        let rCount = 0;
        let pCount = 0;
        for (const r of results) {
          if (!r) continue;
          receivable += r.pending_receivable || 0;
          payable += r.pending_payable || 0;
          rCount += r.receivable_count || 0;
          pCount += r.payable_count || 0;
        }
        setTotals({ receivable, payable, rCount, pCount });
      })
      .catch(() => {
        if (alive) setTotals(null);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return totals;
}

export default function DashboardPage() {
  const { businesses, isLoading: bizLoading } = useBusinesses();

  // v1.6.7: kullanıcının seçtiği periyot — localStorage'a yazılıp tüm visit'lerde aktif.
  const [period, setPeriod] = useState<Period>(() => getDefaultPeriod());
  const { portfolio, isLoading: portLoading } = usePortfolio(period);
  // Grafik verisi (gerçek): haftalık aktivite serisi + dönem delta yüzdeleri.
  const { activity, comparison } = usePortfolioCharts(period);

  function handlePeriodChange(next: Period) {
    setPeriod(next);
    setDefaultPeriod(next);
  }

  const businessIds = useMemo(() => businesses.map((b) => b.id), [businesses]);
  const debt = useDebtTotals(businessIds);

  // Metrik kartı detay-modal'ı — hangi metriğin kırılımı açık.
  const [metricDetail, setMetricDetail] = useState<MetricKind | null>(null);
  const nameOf = useMemo(() => {
    const map = new Map(businesses.map((b) => [b.id, b.name]));
    return (id: string) => map.get(id) ?? "İşletme";
  }, [businesses]);

  const isLoading = bizLoading || portLoading;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const income = portfolio?.total_income ?? 0;
  const expense =
    portfolio?.total_expense_with_fixed ?? portfolio?.total_expense ?? 0;
  const net = portfolio?.net_profit_with_fixed ?? portfolio?.net_profit ?? 0;
  const fixed = portfolio?.fixed_cost_total ?? 0;
  const bizCount = portfolio?.business_count ?? businesses.length;

  // Net kar marjı (gauge) — gelir>0 ise net/gelir, aksi 0.
  const margin = income > 0 ? Math.max(0, Math.min(1, net / income)) : 0;

  // Haftalık trend — GERÇEK günlük aktivite serisi (/portfolio/activity/daily).
  // Bar yüksekliği = günlük net büyüklüğü (BarChartMini abs ile normalize eder),
  // son gün (bugün) vurgulu. Veri yoksa boş seri → nötr boş-durum (uydurma yok).
  const days = activity?.days ?? [];
  const hasActivity =
    (activity?.business_count ?? 0) > 0 &&
    days.some((d) => d.income !== 0 || d.expense !== 0);
  const weekBars = hasActivity
    ? days.map((d, i) => ({
        value: d.net,
        label: weekdayLabel(d.date),
        highlight: i === days.length - 1,
      }))
    : [];

  // "Öne Çıkanlar" — portföyden türetilen gerçek değerler. Satırlar tıklanabilir:
  // Net kâr → net kırılım modal'ı, Aktif işletme → işletme listesi modal'ı.
  const highlightInsights: Insight[] = [
    {
      icon: TrendingUp,
      title: "Net kâr",
      detail: `${periodLabel(period).toLowerCase()} dönemi`,
      value: tl(net),
      tone: net >= 0 ? "accent" : "negative",
      onClick: () => setMetricDetail("net"),
    },
    {
      icon: Banknote,
      title: "Sabit giderler",
      detail: "Toplam giderin parçası",
      value: tl(fixed),
      tone: "neutral",
      onClick: () => setMetricDetail("expense"),
    },
    {
      icon: Building2,
      title: "Aktif işletme",
      detail: "Portföy genelinde",
      value: `${bizCount}`,
      tone: "neutral",
      onClick: () => setMetricDetail("business"),
    },
  ];

  // "Dikkat Gerektirenler" — gerçek borç/alacak verisi varsa onu göster.
  // Satırlar ilgili detay/filtreli sayfaya deep-link.
  const attentionInsights: Insight[] = [];
  if (debt && debt.payable > 0) {
    attentionInsights.push({
      icon: Scale,
      title: "Bekleyen borç",
      detail: `${debt.pCount} kayıt`,
      value: tl(debt.payable),
      tone: "negative",
      href: "/dashboard/verecekler",
    });
  }
  if (debt && debt.receivable > 0) {
    attentionInsights.push({
      icon: ArrowDownLeft,
      title: "Bekleyen alacak",
      detail: `${debt.rCount} kayıt`,
      value: tl(debt.receivable),
      tone: "accent",
      href: "/dashboard/alacaklar",
    });
  }
  if (expense > income && income > 0) {
    attentionInsights.push({
      icon: Receipt,
      title: "Gider geliri aştı",
      detail: "Dönem net negatif",
      value: tl(expense - income),
      tone: "negative",
      onClick: () => setMetricDetail("expense"),
    });
  }
  // Veri yoksa nötr boş-durum satırı (kart hep dengeli görünsün).
  if (attentionInsights.length === 0) {
    attentionInsights.push({
      icon: CalendarCheck,
      title: "Bekleyen kalem yok",
      detail: "Borç/alacak ve dönem dengeli",
      value: "—",
      tone: "neutral",
    });
  }

  return (
    <div className="space-y-5">
      {/* Hero başlık + periyot seçici */}
      <Reveal
        as="section"
        index={0}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <p className="v2-eyebrow text-accent-strong dark:text-accent">
            {getGreeting()} • Genel Bakış
          </p>
          <h1 className="v2-display text-3xl sm:text-5xl mt-2">Genel Bakış</h1>
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

      {/* v1.6.19 (WP-2): "Dünden Kalan Eksik" banner — ilk işletmenin dünkü kapanışı.
          Kritik aksiyon — /kapanislar arşivine gider. Promote'ta korundu. */}
      <CarryOverBanner businessId={businesses?.[0]?.id ?? null} />

      {/* Metrik kartı grid — mobile-first (1→2→4 kolon), stagger giriş */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Reveal index={1}>
          <MetricCard
            label="Net Kar"
            value={net}
            format={tl}
            icon={Wallet}
            variant="ink"
            delta={comparison?.net_delta_pct ?? null}
            onClick={() => setMetricDetail("net")}
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
            delta={comparison?.income_delta_pct ?? null}
            onClick={() => setMetricDetail("income")}
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
            delta={comparison?.expense_delta_pct ?? null}
            goodDirection="down"
            onClick={() => setMetricDetail("expense")}
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
            onClick={() => setMetricDetail("business")}
            segments={[{ value: bizCount, tone: "accent" }]}
          />
        </Reveal>
      </section>

      {/* Orta sıra — gauge + bar-chart + asistan paneli */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Net kar marjı gauge */}
        <Reveal
          index={5}
          className="v2-card v2-lift p-5 sm:p-6 flex flex-col items-center justify-between"
        >
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
              <CalendarCheck size={13} /> son 7 gün
            </span>
          </div>
          {weekBars.length > 0 ? (
            <BarChartMini
              bars={weekBars}
              height={140}
              showLabels
              className="flex-1"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center text-sm text-[rgb(var(--v2-muted))]">
              Son 7 günde hareket yok
            </div>
          )}
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

      {/* Insight stack'leri — gerçek portföy + borç/alacak verisi */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Reveal index={8}>
          <StackInsightCard title="Öne Çıkanlar" insights={highlightInsights} />
        </Reveal>
        <Reveal index={9}>
          <StackInsightCard
            title="Dikkat Gerektirenler"
            insights={attentionInsights}
          />
        </Reveal>
      </section>

      {/* Uyarılar — envanter/personel (gerçek veri, koşullu render) */}
      <AlertsWidget businesses={businesses} />

      {/* İşletme kartları + gruplama — yönetim/navigasyon (promote'ta korundu) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="v2-display text-lg sm:text-xl">İşletmeleriniz</h2>
          <span className="text-sm text-[rgb(var(--v2-muted))]">
            {businesses.length} aktif
          </span>
        </div>
        <GroupedBusinessGrid businesses={businesses} portfolio={portfolio} />
      </section>

      {/* Son işlemler — tıklanabilir (promote'ta korundu) */}
      <section>
        <h2 className="v2-display text-lg sm:text-xl mb-3">Son İşlemler</h2>
        <RecentActivity />
      </section>

      <p className="text-center text-xs text-[rgb(var(--v2-muted))] pt-2">
        Veriler {periodLabel(period).toLowerCase()} dönemine göre gösterilir.
      </p>

      {/* Metrik kartı detay tablosu — tıklanan metriğin işletme-bazlı kırılımı.
          Tutarlı v2 modal kabuğu (WidgetDetailModal). */}
      <WidgetDetailModal
        open={metricDetail !== null}
        onClose={() => setMetricDetail(null)}
        title={metricDetail ? metricDetailTitle(metricDetail) : ""}
        subtitle={
          metricDetail
            ? `${metricDetailSubtitle(metricDetail)} · ${periodLabel(period).toLowerCase()}`
            : undefined
        }
        size="md"
      >
        {metricDetail && (
          <PortfolioMetricDetail
            kind={metricDetail}
            rows={portfolio?.businesses ?? []}
            nameOf={nameOf}
            total={
              metricDetail === "income"
                ? income
                : metricDetail === "expense"
                  ? expense
                  : net
            }
          />
        )}
      </WidgetDetailModal>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-10 v2-card rounded-2xl w-56" />
        <div className="h-5 v2-card rounded-lg w-64 mt-3" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 v2-card rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-56 v2-card rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-48 v2-card rounded-2xl" />
        <div className="h-48 v2-card rounded-2xl" />
      </div>
    </div>
  );
}
