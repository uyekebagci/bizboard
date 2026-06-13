"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  PiggyBank,
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Wallet,
  CreditCard,
  Minus,
  Activity,
  ChevronRight,
  Layers,
  Calendar,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { formatCurrency, cn } from "@/lib/utils";
import type {
  FinanceOverview,
  FinanceMonthData,
  FinanceCategoryData,
  BusinessFinanceData,
  TopTransactionData,
  DailyCashFlowData,
} from "@/types";

// ─── Yardımcı Fonksiyonlar ─────────────────────────────────────────────
function formatPct(val: number | undefined | null): string {
  if (val == null) return "—";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}

function pctColor(val: number | undefined | null): string {
  if (val == null || val === 0) return "text-[rgb(var(--v2-muted))]";
  return val > 0 ? "text-accent-strong dark:text-accent" : "text-status-danger";
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

// ─── Ana Sayfa ──────────────────────────────────────────────────────────
export default function FinancePage() {
  const router = useRouter();
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * v1.6.15+: dönem modu — "daily" yeni default (Bugün). "1 Ay" / "3 Ay" / ... eski
   * monthly mod. localStorage: bizboard.preferences.financePeriod
   *  - "daily"  → ?days=1 (current_period = bugün)
   *  - "1m"     → ?months=1
   *  - "3m"     → ?months=3
   *  - "6m"     → ?months=6
   *  - "1y"     → ?months=12
   *  - "all"    → ?months=0
   */
  type PeriodChoice = "daily" | "1m" | "3m" | "6m" | "1y" | "all";
  const [period, setPeriod] = useState<PeriodChoice>(() => {
    if (typeof window === "undefined") return "daily";
    try {
      const raw = window.localStorage.getItem("bizboard.preferences.financePeriod");
      if (raw && ["daily", "1m", "3m", "6m", "1y", "all"].includes(raw)) {
        return raw as PeriodChoice;
      }
      // v1.6.7 geri uyum: eski financeMonths anahtarı varsa migrate et.
      const oldMonths = window.localStorage.getItem("bizboard.preferences.financeMonths");
      if (oldMonths === "1") return "1m";
      if (oldMonths === "3") return "3m";
      if (oldMonths === "6") return "6m";
      if (oldMonths === "12") return "1y";
      if (oldMonths === "0") return "all";
    } catch {}
    return "daily";
  });
  const [activeTab, setActiveTab] = useState<"overview" | "cashflow" | "categories" | "businesses">("overview");

  function persistPeriod(next: PeriodChoice) {
    setPeriod(next);
    try {
      window.localStorage.setItem("bizboard.preferences.financePeriod", next);
    } catch {}
  }

  function periodQueryString(p: PeriodChoice): string {
    switch (p) {
      case "daily": return "days=1";
      case "1m":   return "months=1";
      case "3m":   return "months=3";
      case "6m":   return "months=6";
      case "1y":   return "months=12";
      case "all":  return "months=0";
    }
  }

  useEffect(() => {
    async function fetchData() {
      // İlk yükleme → skeleton, sonraki → sadece fade
      if (data) setRefreshing(true);
      else setLoading(true);
      try {
        const result = await api.get<FinanceOverview>(
          `/finance/overview?${periodQueryString(period)}`,
        );
        setData(result);
      } catch (err) {
        logger.error("api", "Finance overview fetch failed", undefined, err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }
    fetchData();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <FinanceSkeleton />;
  if (!data) return <EmptyState />;

  const cur = data.current_period;
  const prev = data.previous_period;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <section className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="v2-icon-btn v2-press"
            aria-label="Geri"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="v2-display text-xl">Finans Merkezi</h1>
            <p className="text-[rgb(var(--v2-muted))] text-sm mt-0.5">Detayli finansal analiz ve raporlar</p>
          </div>
        </div>
        {/* Dönem Seçici (v1.6.15+: 'Bugun' default) — UI v2: sunken segment + accent aktif. */}
        <div className="flex items-center gap-1 v2-sunken p-1 rounded-xl">
          {([
            { value: "daily", label: "Bugun" },
            { value: "1m",    label: "1 Ay" },
            { value: "3m",    label: "3 Ay" },
            { value: "6m",    label: "6 Ay" },
            { value: "1y",    label: "1 Yil" },
            { value: "all",   label: "Tumu" },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => persistPeriod(value)}
              aria-pressed={period === value}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                period === value
                  ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                  : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Tabs — UI v2: sunken segment + accent aktif. */}
      <section className="flex items-center gap-1 v2-sunken p-1 rounded-xl">
        {([
          { key: "overview", label: "Genel Bakis", icon: BarChart3 },
          { key: "cashflow", label: "Nakit Akisi", icon: Activity },
          { key: "categories", label: "Kategoriler", icon: Layers },
          { key: "businesses", label: "Isletmeler", icon: Building2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            aria-pressed={activeTab === key}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
              activeTab === key
                ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold"
                : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </section>

      {/* Özet Kartlar — Her zaman göster */}
      <section className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity duration-200", refreshing ? "opacity-40" : "opacity-100")}>
        <SummaryCard
          title="Toplam Gelir"
          value={cur.income}
          change={cur.income_change_pct}
          icon={ArrowDownLeft}
          iconBg="bg-accent/15"
          iconColor="text-accent-strong dark:text-accent"
          valueColor="text-accent-strong dark:text-accent"
          index={0}
        />
        <SummaryCard
          title="Toplam Gider"
          value={cur.total_expense_with_fixed || cur.expense}
          change={cur.expense_change_pct}
          icon={ArrowUpRight}
          iconBg="bg-status-danger/15"
          iconColor="text-status-danger"
          valueColor="text-status-danger"
          invertChange
          index={1}
        />
        <SummaryCard
          title="Net Kar"
          value={cur.net_profit_with_fixed ?? cur.net_profit}
          change={cur.profit_change_pct}
          icon={PiggyBank}
          iconBg={cn(
            (cur.net_profit_with_fixed ?? cur.net_profit) >= 0
              ? "bg-accent/15"
              : "bg-status-danger/15"
          )}
          iconColor={cn(
            (cur.net_profit_with_fixed ?? cur.net_profit) >= 0
              ? "text-accent-strong dark:text-accent"
              : "text-status-danger"
          )}
          valueColor={cn(
            (cur.net_profit_with_fixed ?? cur.net_profit) >= 0
              ? "text-accent-strong dark:text-accent"
              : "text-status-danger"
          )}
          index={2}
        />
        <SummaryCard
          title="Islem Sayisi"
          value={cur.transaction_count}
          icon={Receipt}
          iconBg="bg-[rgb(var(--v2-sunken))]"
          iconColor="text-[rgb(var(--v2-muted))]"
          valueColor="text-[rgb(var(--v2-ink))]"
          isCurrency={false}
          index={3}
        />
      </section>

      {/* Tab İçerikleri */}
      <div className={cn("transition-opacity duration-200", refreshing ? "opacity-40 pointer-events-none" : "opacity-100")}>
        {activeTab === "overview" && <OverviewTab data={data} dailyMode={period === "daily"} />}
        {activeTab === "cashflow" && <CashFlowTab data={data} />}
        {activeTab === "categories" && <CategoriesTab data={data} />}
        {activeTab === "businesses" && <BusinessesTab data={data} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

// ─── Özet Kart ──────────────────────────────────────────────────────────
function SummaryCard({
  title,
  value,
  change,
  icon: Icon,
  iconBg,
  iconColor,
  valueColor,
  invertChange,
  isCurrency = true,
  index = 0,
}: {
  title: string;
  value: number;
  change?: number | null;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  valueColor: string;
  invertChange?: boolean;
  isCurrency?: boolean;
  index?: number;
}) {
  const changeVal = invertChange && change != null ? -change : change;

  return (
    // Mockup-fidelity: rise stagger (kartlar sırayla belirir).
    <div className="rise v2-card p-4" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="flex items-center justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", iconBg)}>
          <Icon size={18} className={iconColor} />
        </div>
        {change != null && (
          <span className={cn("text-xs font-semibold", pctColor(changeVal))}>
            {formatPct(changeVal)}
          </span>
        )}
      </div>
      <p className="v2-eyebrow mb-0.5">{title}</p>
      <p className={cn("num text-lg font-bold", valueColor)}>
        {isCurrency ? formatCurrency(value) : value}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TAB: Genel Bakış
// ═══════════════════════════════════════════════════════════════════════
function OverviewTab({ data, dailyMode }: { data: FinanceOverview; dailyMode: boolean }) {
  return (
    <div className="space-y-4">
      {/* v1.6.15+: daily mod'da günlük bar chart (son 30 gün), monthly mod'da aylık trend */}
      {dailyMode ? (
        <DailyTrendChart cashFlow={data.daily_cash_flow ?? []} />
      ) : (
        <MonthlyTrendChart trend={data.monthly_trend} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* En Yüksek Giderler */}
        <TopTransactionsList
          title="En Yuksek Giderler"
          items={data.top_expenses}
          icon={ArrowUpRight}
          iconColor="text-status-danger"
          amountColor="text-status-danger"
        />

        {/* En Yüksek Gelirler */}
        <TopTransactionsList
          title="En Yuksek Gelirler"
          items={data.top_incomes}
          icon={ArrowDownLeft}
          iconColor="text-accent-strong dark:text-accent"
          amountColor="text-accent-strong dark:text-accent"
        />
      </div>

      {/* Gelir/Gider Karşılaştırma Barı */}
      <IncomeExpenseCompare
        income={data.current_period.income}
        expense={data.current_period.total_expense_with_fixed || data.current_period.expense}
        fixedCost={data.current_period.fixed_cost}
      />
    </div>
  );
}

// ─── Aylık Trend Chart ──────────────────────────────────────────────────
function MonthlyTrendChart({ trend }: { trend: FinanceMonthData[] }) {
  if (trend.length === 0) return null;

  const maxVal = Math.max(
    ...trend.map((m) => Math.max(m.income, m.expense + (m.fixed_cost || 0))),
    1
  );

  return (
    <div className="v2-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))]">Aylik Gelir / Gider Trendi</h3>
        <div className="flex items-center gap-4 text-[10px] font-medium text-[rgb(var(--v2-muted))]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-accent" /> Gelir
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-status-danger" /> Gider
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[rgb(var(--v2-ink))]" /> Net Kar
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex items-end gap-2 h-48">
        {trend.map((m, idx) => {
          const incomeH = (m.income / maxVal) * 100;
          const expenseH = ((m.expense + (m.fixed_cost || 0)) / maxVal) * 100;
          const isProfit = m.net_profit >= 0;

          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="v2-card text-[rgb(var(--v2-ink))] rounded-lg p-2.5 text-[10px] shadow-v2-hover whitespace-nowrap">
                  <p className="font-bold mb-1">{m.label} {m.year}</p>
                  <p className="text-accent-strong dark:text-accent">Gelir: {formatCurrency(m.income)}</p>
                  <p className="text-status-danger">Gider: {formatCurrency(m.expense + (m.fixed_cost || 0))}</p>
                  <p className={isProfit ? "text-accent-strong dark:text-accent" : "text-status-danger"}>
                    Net: {formatCurrency(m.net_profit)}
                  </p>
                  <p className="text-[rgb(var(--v2-muted))]">{m.transaction_count} islem</p>
                </div>
              </div>

              {/* Bars */}
              <div className="w-full flex gap-0.5 items-end h-40">
                <div
                  className="flex-1 bg-accent rounded-t-md transition-all duration-500 min-h-[2px]"
                  style={{ height: `${Math.max(incomeH, 1)}%` }}
                />
                <div
                  className="flex-1 bg-status-danger rounded-t-md transition-all duration-500 min-h-[2px]"
                  style={{ height: `${Math.max(expenseH, 1)}%` }}
                />
              </div>

              {/* Net profit indicator */}
              <div className={cn(
                "w-full h-1 rounded-full",
                isProfit ? "bg-accent" : "bg-status-danger"
              )} />

              {/* Label */}
              <span className="text-[10px] text-[rgb(var(--v2-muted))] font-medium">{m.label.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Günlük Trend Chart (v1.6.15+) ──────────────────────────────────────
function DailyTrendChart({ cashFlow }: { cashFlow: DailyCashFlowData[] }) {
  if (cashFlow.length === 0) {
    return (
      <div className="v2-card p-5 text-center text-sm text-[rgb(var(--v2-muted))]">
        Henuz gunluk veri yok.
      </div>
    );
  }

  // Son 30 günü göster (data zaten 30+ gün, ama tutmak gerekirse slice).
  const days = cashFlow.slice(-30);
  const maxVal = Math.max(
    ...days.map((d) => Math.max(d.income, d.expense)),
    1,
  );

  return (
    <div className="v2-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))]">Gunluk Gelir / Gider (son 30 gun)</h3>
        <div className="flex items-center gap-4 text-[10px] font-medium text-[rgb(var(--v2-muted))]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-accent" /> Gelir
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-status-danger" /> Gider
          </span>
        </div>
      </div>

      <div className="flex items-end gap-0.5 h-40">
        {days.map((d, idx) => {
          const incomeH = (d.income / maxVal) * 100;
          const expenseH = (d.expense / maxVal) * 100;
          const isProfit = d.net >= 0;
          return (
            <div key={idx} className="flex-1 flex flex-col items-center group relative min-w-0">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 pointer-events-none">
                <div className="v2-card text-[rgb(var(--v2-ink))] rounded-lg p-2.5 text-[10px] shadow-v2-hover whitespace-nowrap">
                  <p className="font-bold mb-1">{formatDate(d.date)}</p>
                  <p className="text-accent-strong dark:text-accent">Gelir: {formatCurrency(d.income)}</p>
                  <p className="text-status-danger">Gider: {formatCurrency(d.expense)}</p>
                  <p className={isProfit ? "text-accent-strong dark:text-accent" : "text-status-danger"}>
                    Net: {formatCurrency(d.net)}
                  </p>
                </div>
              </div>

              <div className="w-full flex gap-px items-end h-36">
                <div
                  className="flex-1 bg-accent rounded-t-sm transition-all duration-500 min-h-[1px]"
                  style={{ height: `${Math.max(incomeH, 1)}%` }}
                />
                <div
                  className="flex-1 bg-status-danger rounded-t-sm transition-all duration-500 min-h-[1px]"
                  style={{ height: `${Math.max(expenseH, 1)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-between text-[10px] text-[rgb(var(--v2-muted))]">
        <span>{formatDate(days[0].date)}</span>
        <span>{formatDate(days[days.length - 1].date)}</span>
      </div>
    </div>
  );
}

// ─── Top İşlemler Listesi ───────────────────────────────────────────────
function TopTransactionsList({
  title,
  items,
  icon: Icon,
  iconColor,
  amountColor,
}: {
  title: string;
  items: TopTransactionData[];
  icon: LucideIcon;
  iconColor: string;
  amountColor: string;
}) {
  if (items.length === 0) {
    return (
      <div className="v2-card p-4">
        <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-3">{title}</h3>
        <p className="text-[rgb(var(--v2-muted))] text-xs text-center py-6">Henuz islem yok</p>
      </div>
    );
  }

  return (
    <div className="v2-card p-4">
      <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[rgb(var(--v2-sunken))] transition-colors">
            <div className="w-8 h-8 rounded-lg bg-[rgb(var(--v2-sunken))] flex items-center justify-center text-[rgb(var(--v2-muted))] text-xs font-bold">
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[rgb(var(--v2-ink))] truncate">
                {item.description || item.category_name}
              </p>
              <p className="text-[10px] text-[rgb(var(--v2-muted))]">
                {item.business_name} · {item.category_name} · {formatDate(item.date)}
              </p>
            </div>
            <span className={cn("num text-sm font-bold", amountColor)}>
              {formatCurrency(item.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Gelir/Gider Karşılaştırma Barı ────────────────────────────────────
function IncomeExpenseCompare({
  income,
  expense,
  fixedCost,
}: {
  income: number;
  expense: number;
  fixedCost: number;
}) {
  const total = income + expense;
  const incomePct = total > 0 ? (income / total) * 100 : 50;
  const expensePct = total > 0 ? (expense / total) * 100 : 50;
  const variableExpense = expense - fixedCost;

  return (
    <div className="v2-card p-5">
      <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-4">Gelir / Gider Karsilastirmasi</h3>

      {/* Büyük bar */}
      <div className="relative h-10 rounded-xl overflow-hidden flex bg-[rgb(var(--v2-sunken))]">
        <div
          className="h-full bg-accent flex items-center justify-center transition-all duration-700"
          style={{ width: `${incomePct}%` }}
        >
          {incomePct > 15 && (
            <span className="text-accent-ink text-xs font-bold">
              {formatCurrency(income)} ({incomePct.toFixed(0)}%)
            </span>
          )}
        </div>
        <div
          className="h-full bg-status-danger flex items-center justify-center transition-all duration-700"
          style={{ width: `${expensePct}%` }}
        >
          {expensePct > 15 && (
            <span className="text-white text-xs font-bold">
              {formatCurrency(expense)} ({expensePct.toFixed(0)}%)
            </span>
          )}
        </div>
      </div>

      {/* Alt detaylar */}
      {/* W2: dar ekranda sıkışmasın — tek kolon → sm'de 3 kolon. Token-correct renkler. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div className="text-center p-3 bg-accent/15 rounded-xl">
          <p className="text-[10px] text-accent-strong dark:text-accent font-medium uppercase">Gelir</p>
          <p className="num text-base font-bold text-accent-strong dark:text-accent mt-0.5">{formatCurrency(income)}</p>
        </div>
        <div className="text-center p-3 bg-status-danger/15 rounded-xl">
          <p className="text-[10px] text-status-danger font-medium uppercase">Islem Gideri</p>
          <p className="num text-base font-bold text-status-danger mt-0.5">{formatCurrency(variableExpense > 0 ? variableExpense : expense)}</p>
        </div>
        {fixedCost > 0 && (
          <div className="text-center p-3 bg-status-warning/15 rounded-xl">
            <p className="text-[10px] text-status-warning font-medium uppercase">Sabit Gider</p>
            <p className="num text-base font-bold text-status-warning mt-0.5">{formatCurrency(fixedCost)}</p>
          </div>
        )}
        {fixedCost <= 0 && (
          <div className="text-center p-3 bg-[rgb(var(--v2-sunken))] rounded-xl">
            <p className="text-[10px] text-[rgb(var(--v2-muted))] font-medium uppercase">Net Kar</p>
            <p className={cn("num text-base font-bold mt-0.5", income - expense >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger")}>
              {formatCurrency(income - expense)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TAB: Nakit Akışı
// ═══════════════════════════════════════════════════════════════════════
function CashFlowTab({ data }: { data: FinanceOverview }) {
  const cashFlow = data.daily_cash_flow;

  if (cashFlow.length === 0) {
    return <EmptySection text="Nakit akisi verisi bulunamadi" />;
  }

  // Son 30 güne ait veri
  const maxAbs = Math.max(
    ...cashFlow.map((d) => Math.max(d.income, d.expense)),
    1
  );

  // Günlük ortalamaları hesapla
  const totalDays = cashFlow.length;
  const totalIncome = cashFlow.reduce((s, d) => s + d.income, 0);
  const totalExpense = cashFlow.reduce((s, d) => s + d.expense, 0);
  const avgIncome = totalDays > 0 ? totalIncome / totalDays : 0;
  const avgExpense = totalDays > 0 ? totalExpense / totalDays : 0;

  // Pozitif / negatif gün sayısı
  const positiveDays = cashFlow.filter((d) => d.net >= 0).length;
  const negativeDays = cashFlow.filter((d) => d.net < 0).length;

  return (
    <div className="space-y-4">
      {/* Nakit Akışı Özet Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard label="Gunluk Ort. Gelir" value={formatCurrency(avgIncome)} color="text-accent-strong dark:text-accent" />
        <MiniCard label="Gunluk Ort. Gider" value={formatCurrency(avgExpense)} color="text-status-danger" />
        <MiniCard label="Pozitif Gun" value={`${positiveDays} gun`} color="text-accent-strong dark:text-accent" />
        <MiniCard label="Negatif Gun" value={`${negativeDays} gun`} color="text-status-danger" />
      </div>

      {/* Kümülatif Nakit Akışı Grafiği */}
      <CumulativeCashFlowChart data={cashFlow} />

      {/* Günlük Akış Listesi */}
      <DailyCashFlowList data={cashFlow} />
    </div>
  );
}

function CumulativeCashFlowChart({ data }: { data: DailyCashFlowData[] }) {
  const values = data.map((d) => d.cumulative);
  const maxVal = Math.max(...values.map(Math.abs), 1);
  const midY = 50; // middle of chart (percentage)

  return (
    <div className="v2-card p-5">
      <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-4">Kumulatif Nakit Akisi (Son 30 Gun)</h3>
      <div className="relative h-48 flex items-end gap-px">
        {/* Y-axis center line */}
        <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-[rgb(var(--v2-border))] z-0" />

        {data.map((d, i) => {
          const isPositive = d.cumulative >= 0;
          const barHeight = Math.abs(d.cumulative) / maxVal * 50;

          return (
            <div
              key={i}
              className="flex-1 relative flex flex-col items-center group"
              style={{ height: "100%" }}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-20">
                <div className="v2-card text-[rgb(var(--v2-ink))] rounded-lg p-2 text-[9px] shadow-v2-hover whitespace-nowrap">
                  <p className="font-bold">{formatDate(d.date)}</p>
                  <p className="text-accent-strong dark:text-accent">+{formatCurrency(d.income)}</p>
                  <p className="text-status-danger">-{formatCurrency(d.expense)}</p>
                  <p className={d.cumulative >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger"}>
                    Toplam: {formatCurrency(d.cumulative)}
                  </p>
                </div>
              </div>

              {/* Bar */}
              <div className="w-full flex items-center justify-center" style={{ height: "100%" }}>
                <div
                  className={cn(
                    "w-full rounded-sm transition-all duration-300",
                    isPositive ? "bg-accent" : "bg-status-danger",
                    isPositive ? "self-end" : "self-start"
                  )}
                  style={{
                    height: `${Math.max(barHeight, 1)}%`,
                    position: "absolute",
                    ...(isPositive
                      ? { bottom: "50%", left: 0, right: 0 }
                      : { top: "50%", left: 0, right: 0 }),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis labels (every 5th day) */}
      <div className="flex gap-px mt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            {(i % 5 === 0 || i === data.length - 1) && (
              <span className="text-[8px] text-[rgb(var(--v2-muted))]">{formatDate(d.date).split(" ")[0]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyCashFlowList({ data }: { data: DailyCashFlowData[] }) {
  // Son 7 gün
  const recent = [...data].reverse().slice(0, 7);

  return (
    <div className="v2-card p-4">
      <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-3">Son 7 Gunluk Nakit Akisi</h3>
      <div className="space-y-1.5">
        {recent.map((d) => (
          <div key={d.date} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgb(var(--v2-sunken))] transition-colors">
            <div className="w-8 text-center">
              <p className="text-xs font-bold text-[rgb(var(--v2-ink))]">
                {new Date(d.date).getDate()}
              </p>
              <p className="text-[9px] text-[rgb(var(--v2-muted))]">
                {new Date(d.date).toLocaleDateString("tr-TR", { weekday: "short" })}
              </p>
            </div>
            <div className="flex-1 flex gap-3">
              {d.income > 0 && (
                <span className="num text-xs font-medium text-accent-strong dark:text-accent">+{formatCurrency(d.income)}</span>
              )}
              {d.expense > 0 && (
                <span className="num text-xs font-medium text-status-danger">-{formatCurrency(d.expense)}</span>
              )}
              {d.income === 0 && d.expense === 0 && (
                <span className="text-xs text-[rgb(var(--v2-muted))]">Islem yok</span>
              )}
            </div>
            <div className="text-right">
              <p className={cn("num text-xs font-bold", d.net >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger")}>
                {d.net >= 0 ? "+" : ""}{formatCurrency(d.net)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TAB: Kategoriler
// ═══════════════════════════════════════════════════════════════════════
function CategoriesTab({ data }: { data: FinanceOverview }) {
  const [view, setView] = useState<"expense" | "income">("expense");
  const categories = view === "expense" ? data.expense_by_category : data.income_by_category;

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center gap-1 v2-sunken rounded-xl p-1 max-w-xs">
        <button
          onClick={() => setView("expense")}
          aria-pressed={view === "expense"}
          className={cn(
            "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            view === "expense" ? "bg-status-danger/15 text-status-danger font-semibold" : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
          )}
        >
          Gider Kategorileri
        </button>
        <button
          onClick={() => setView("income")}
          aria-pressed={view === "income"}
          className={cn(
            "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            view === "income" ? "bg-accent/16 text-accent-strong dark:text-accent font-semibold" : "text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
          )}
        >
          Gelir Kategorileri
        </button>
      </div>

      {categories.length === 0 ? (
        <EmptySection text="Bu donemde kategori verisi yok" />
      ) : (
        <>
          {/* Donut / Ring Chart */}
          <CategoryRingChart categories={categories} type={view} />

          {/* Kategori Listesi */}
          <CategoryList categories={categories} type={view} />
        </>
      )}
    </div>
  );
}

function CategoryRingChart({
  categories,
  type,
}: {
  categories: FinanceCategoryData[];
  type: "expense" | "income";
}) {
  const total = categories.reduce((s, c) => s + c.amount, 0);
  const colors = type === "expense"
    ? ["#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6", "#64748b"]
    : ["#22c55e", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#64748b"];

  // SVG donut chart
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="v2-card p-5">
      <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-4">
        {type === "expense" ? "Gider" : "Gelir"} Dagilimi
      </h3>
      <div className="flex items-center gap-8">
        {/* SVG Ring */}
        <div className="relative w-44 h-44 shrink-0">
          <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
            {categories.map((cat, i) => {
              const pct = total > 0 ? cat.amount / total : 0;
              const strokeLength = pct * circumference;
              const currentOffset = offset;
              offset += strokeLength;

              return (
                <circle
                  key={cat.name}
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth="20"
                  strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
                  strokeDashoffset={-currentOffset}
                  className="transition-all duration-700"
                />
              );
            })}
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[10px] text-[rgb(var(--v2-muted))] font-medium">Toplam</p>
            <p className="num text-lg font-bold text-[rgb(var(--v2-ink))]">{formatCurrency(total)}</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          {categories.map((cat, i) => (
            <div key={cat.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[rgb(var(--v2-ink))] truncate">{cat.name}</span>
                  <span className="num text-xs font-bold text-[rgb(var(--v2-ink))] ml-2">{formatCurrency(cat.amount)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1.5 rounded-full bg-[rgb(var(--v2-sunken))] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${cat.percentage}%`,
                        backgroundColor: colors[i % colors.length],
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[rgb(var(--v2-muted))] w-8 text-right">%{cat.percentage.toFixed(0)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryList({
  categories,
  type,
}: {
  categories: FinanceCategoryData[];
  type: "expense" | "income";
}) {
  return (
    <div className="v2-card p-4">
      <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-3">Kategori Detaylari</h3>
      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat.name} className="flex items-center gap-3 p-3 rounded-xl v2-sunken">
            <div className="w-10 h-10 rounded-xl bg-[rgb(var(--v2-card))] border border-[rgb(var(--v2-border))] flex items-center justify-center">
              <span className="text-lg">{cat.icon || (type === "expense" ? "💸" : "💰")}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">{cat.name}</p>
              <p className="text-[10px] text-[rgb(var(--v2-muted))]">{cat.transaction_count} islem</p>
            </div>
            <div className="text-right">
              <p className={cn(
                "num text-sm font-bold",
                type === "expense" ? "text-status-danger" : "text-accent-strong dark:text-accent"
              )}>
                {formatCurrency(cat.amount)}
              </p>
              <p className="text-[10px] text-[rgb(var(--v2-muted))]">%{cat.percentage.toFixed(1)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TAB: İşletmeler
// ═══════════════════════════════════════════════════════════════════════
function BusinessesTab({ data }: { data: FinanceOverview }) {
  const businesses = data.business_breakdown;

  if (businesses.length === 0) {
    return <EmptySection text="Isletme verisi bulunamadi" />;
  }

  const totalIncome = businesses.reduce((s, b) => s + b.income, 0);
  const totalExpense = businesses.reduce((s, b) => s + b.expense, 0);

  return (
    <div className="space-y-4">
      {/* İşletme Karşılaştırma */}
      <div className="v2-card p-5">
        <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-4">Isletme Karsilastirmasi</h3>
        <div className="space-y-4">
          {businesses.map((biz) => {
            const incomeShare = totalIncome > 0 ? (biz.income / totalIncome) * 100 : 0;
            const expenseShare = totalExpense > 0 ? (biz.expense / totalExpense) * 100 : 0;
            const isProfit = biz.net_profit >= 0;

            return (
              <div key={biz.business_id} className="p-3 rounded-xl v2-sunken">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: biz.color || "#6366f1" }}
                    >
                      {biz.business_name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[rgb(var(--v2-ink))]">{biz.business_name}</p>
                      <p className="text-[10px] text-[rgb(var(--v2-muted))]">{biz.transaction_count} islem</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("num text-sm font-bold", isProfit ? "text-accent-strong dark:text-accent" : "text-status-danger")}>
                      {isProfit ? "+" : ""}{formatCurrency(biz.net_profit)}
                    </p>
                    <p className="text-[10px] text-[rgb(var(--v2-muted))]">
                      Kar Marji: %{biz.profit_margin.toFixed(1)}
                    </p>
                  </div>
                </div>

                {/* Gelir bar */}
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[rgb(var(--v2-muted))] w-10">Gelir</span>
                    <div className="flex-1 h-2 rounded-full bg-[rgb(var(--v2-border))] overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-500"
                        style={{ width: `${incomeShare}%` }}
                      />
                    </div>
                    <span className="num text-[10px] font-medium text-accent-strong dark:text-accent w-20 text-right">
                      {formatCurrency(biz.income)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[rgb(var(--v2-muted))] w-10">Gider</span>
                    <div className="flex-1 h-2 rounded-full bg-[rgb(var(--v2-border))] overflow-hidden">
                      <div
                        className="h-full bg-status-danger rounded-full transition-all duration-500"
                        style={{ width: `${expenseShare}%` }}
                      />
                    </div>
                    <span className="num text-[10px] font-medium text-status-danger w-20 text-right">
                      {formatCurrency(biz.expense)}
                    </span>
                  </div>
                  {biz.fixed_cost > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[rgb(var(--v2-muted))] w-10">Sabit</span>
                      <div className="flex-1 h-2 rounded-full bg-[rgb(var(--v2-border))] overflow-hidden">
                        <div
                          className="h-full bg-status-warning rounded-full transition-all duration-500"
                          style={{ width: `${totalExpense > 0 ? (biz.fixed_cost / totalExpense) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="num text-[10px] font-medium text-status-warning w-20 text-right">
                        {formatCurrency(biz.fixed_cost)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* İşletme Performans Tablosu */}
      <div className="v2-card p-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-3">Performans Tablosu</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgb(var(--v2-border))]">
              <th className="text-left py-2 px-2 text-[rgb(var(--v2-muted))] font-medium">Isletme</th>
              <th className="text-right py-2 px-2 text-[rgb(var(--v2-muted))] font-medium">Gelir</th>
              <th className="text-right py-2 px-2 text-[rgb(var(--v2-muted))] font-medium">Gider</th>
              <th className="text-right py-2 px-2 text-[rgb(var(--v2-muted))] font-medium">Sabit</th>
              <th className="text-right py-2 px-2 text-[rgb(var(--v2-muted))] font-medium">Net Kar</th>
              <th className="text-right py-2 px-2 text-[rgb(var(--v2-muted))] font-medium">Marj</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((biz) => (
              <tr key={biz.business_id} className="border-b border-[rgb(var(--v2-border))] hover:bg-[rgb(var(--v2-sunken))] transition-colors">
                <td className="py-2.5 px-2 font-medium text-[rgb(var(--v2-ink))]">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-md"
                      style={{ backgroundColor: biz.color || "#6366f1" }}
                    />
                    {biz.business_name}
                  </div>
                </td>
                <td className="num py-2.5 px-2 text-right text-accent-strong dark:text-accent font-medium">{formatCurrency(biz.income)}</td>
                <td className="num py-2.5 px-2 text-right text-status-danger font-medium">{formatCurrency(biz.expense)}</td>
                <td className="num py-2.5 px-2 text-right text-status-warning font-medium">{formatCurrency(biz.fixed_cost)}</td>
                <td className={cn(
                  "num py-2.5 px-2 text-right font-bold",
                  biz.net_profit >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger"
                )}>
                  {formatCurrency(biz.net_profit)}
                </td>
                <td className={cn(
                  "num py-2.5 px-2 text-right font-medium",
                  biz.profit_margin >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger"
                )}>
                  %{biz.profit_margin.toFixed(1)}
                </td>
              </tr>
            ))}
            {/* Toplam satırı */}
            <tr className="border-t-2 border-[rgb(var(--v2-border))] font-bold">
              <td className="py-2.5 px-2 text-[rgb(var(--v2-ink))]">Toplam</td>
              <td className="num py-2.5 px-2 text-right text-accent-strong dark:text-accent">{formatCurrency(totalIncome)}</td>
              <td className="num py-2.5 px-2 text-right text-status-danger">{formatCurrency(totalExpense)}</td>
              <td className="num py-2.5 px-2 text-right text-status-warning">
                {formatCurrency(businesses.reduce((s, b) => s + b.fixed_cost, 0))}
              </td>
              <td className={cn(
                "num py-2.5 px-2 text-right",
                totalIncome - totalExpense >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger"
              )}>
                {formatCurrency(totalIncome - totalExpense)}
              </td>
              <td className="num py-2.5 px-2 text-right text-[rgb(var(--v2-muted))]">
                %{totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : "0"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Yardımcı Bileşenler
// ═══════════════════════════════════════════════════════════════════════

function MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="v2-card p-3 text-center">
      <p className="v2-eyebrow">{label}</p>
      <p className={cn("num text-base font-bold mt-1", color)}>{value}</p>
    </div>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="v2-card p-8 text-center">
      <Wallet size={32} className="text-[rgb(var(--v2-muted))] mx-auto mb-2" />
      <p className="text-[rgb(var(--v2-muted))] text-sm">{text}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-2xl v2-sunken flex items-center justify-center mb-4">
        <BarChart3 size={28} className="text-[rgb(var(--v2-muted))]" />
      </div>
      <h2 className="text-lg font-bold text-[rgb(var(--v2-ink))] mb-1">Finans Verileri Yuklenemedi</h2>
      <p className="text-[rgb(var(--v2-muted))] text-sm">Lutfen daha sonra tekrar deneyin.</p>
    </div>
  );
}

function FinanceSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl v2-sunken" />
        <div>
          <div className="h-6 w-40 v2-sunken rounded-lg" />
          <div className="h-4 w-56 v2-sunken rounded-lg mt-1" />
        </div>
      </div>
      <div className="h-10 v2-sunken rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 v2-sunken rounded-2xl" />
        ))}
      </div>
      <div className="h-64 v2-sunken rounded-2xl" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-48 v2-sunken rounded-2xl" />
        <div className="h-48 v2-sunken rounded-2xl" />
      </div>
    </div>
  );
}
