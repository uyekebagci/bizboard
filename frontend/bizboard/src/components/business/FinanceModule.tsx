"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  PiggyBank,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  Activity,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency, cn } from "@/lib/utils";
import type { PeriodSummary, Transaction, FixedCostSummary } from "@/types";

interface Props {
  businessId: string;
  currency: string;
}

interface CategoryBreakdown {
  name: string;
  income: number;
  expense: number;
}

const MONTH_LABELS = ["", "Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];

export function FinanceModule({ businessId, currency }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<PeriodSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCostSummary | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: number; year: number; income: number; expense: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;

        const [curSum, prevSum, txList, fcData] = await Promise.all([
          api.get<PeriodSummary>(`/businesses/${businessId}/summary?year=${year}&month=${month}`),
          api.get<PeriodSummary>(`/businesses/${businessId}/summary?year=${prevYear}&month=${prevMonth}`),
          api.get<Transaction[]>(`/businesses/${businessId}/transactions?limit=10`),
          api.get<FixedCostSummary>(`/businesses/${businessId}/fixed-costs/summary`),
        ]);

        setSummary(curSum);
        setPrevSummary(prevSum);
        setTransactions(txList);
        setFixedCosts(fcData);

        // Son 4 ay trend verisi
        const trend: { month: number; year: number; income: number; expense: number }[] = [];
        for (let i = 3; i >= 0; i--) {
          let m = month - i;
          let y = year;
          if (m <= 0) { m += 12; y -= 1; }
          try {
            const s = i === 0 ? curSum : (i === 1 ? prevSum : await api.get<PeriodSummary>(`/businesses/${businessId}/summary?year=${y}&month=${m}`));
            trend.push({ month: m, year: y, income: s.total_income, expense: s.total_expense });
          } catch {
            trend.push({ month: m, year: y, income: 0, expense: 0 });
          }
        }
        setMonthlyTrend(trend);
      } catch (err) {
        console.error("Finance module data fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [businessId]);

  if (loading) return <FinanceModuleSkeleton />;
  if (!summary) return <EmptyFinance />;

  const income = summary.total_income;
  const expense = summary.total_expense;
  const fixedCost = summary.fixed_cost_total ?? 0;
  const totalExpense = summary.total_expense_with_fixed ?? expense;
  const netProfit = summary.net_profit_with_fixed ?? income - totalExpense;
  const profitMargin = income > 0 ? (netProfit / income) * 100 : 0;

  // Önceki ay değişim yüzdeleri
  const prevIncome = prevSummary?.total_income ?? 0;
  const prevExpense = prevSummary?.total_expense ?? 0;

  const incomePct = prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : (income > 0 ? 100 : 0);
  const expensePct = prevExpense > 0 ? ((expense - prevExpense) / prevExpense) * 100 : (expense > 0 ? 100 : 0);

  // Kategori kırılımı
  const categories: CategoryBreakdown[] = [];
  if (summary.breakdown_by_category) {
    Object.entries(summary.breakdown_by_category).forEach(([name, vals]) => {
      categories.push({ name, income: vals.income ?? 0, expense: vals.expense ?? 0 });
    });
    categories.sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }

  // Gelir/Gider karşılaştırma
  const total = income + totalExpense;
  const incomePctBar = total > 0 ? (income / total) * 100 : 50;

  // Son 5 işlem
  const recentTx = transactions.slice(0, 5);

  return (
    <div className="space-y-4">

      {/* ─── Gelir/Gider Oranı Barı ─────────────────────────── */}
      <div className="card p-4">
        <h4 className="text-xs font-semibold text-surface-300 mb-3">Gelir / Gider Orani</h4>
        <div className="relative h-7 rounded-full overflow-hidden flex bg-surface-700">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-700 flex items-center justify-center"
            style={{ width: `${incomePctBar}%` }}
          >
            {incomePctBar > 20 && (
              <span className="text-white text-[10px] font-bold">{incomePctBar.toFixed(0)}%</span>
            )}
          </div>
          <div
            className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-700 flex items-center justify-center"
            style={{ width: `${100 - incomePctBar}%` }}
          >
            {(100 - incomePctBar) > 20 && (
              <span className="text-white text-[10px] font-bold">{(100 - incomePctBar).toFixed(0)}%</span>
            )}
          </div>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-green-500 font-medium">Gelir: {formatCurrency(income, currency)}</span>
          <span className="text-[10px] text-red-500 font-medium">Gider: {formatCurrency(totalExpense, currency)}</span>
        </div>

        {/* Önceki aya göre değişim */}
        <div className="flex gap-3 mt-3 pt-3 border-t border-surface-700">
          <div className="flex-1 flex items-center gap-1.5">
            {incomePct >= 0
              ? <TrendingUp size={12} className="text-green-500" />
              : <TrendingDown size={12} className="text-red-500" />
            }
            <span className={cn("text-[10px] font-semibold", incomePct >= 0 ? "text-green-500" : "text-red-500")}>
              {incomePct >= 0 ? "+" : ""}{incomePct.toFixed(1)}%
            </span>
            <span className="text-[10px] text-surface-400">gelir</span>
          </div>
          <div className="flex-1 flex items-center gap-1.5">
            {expensePct <= 0
              ? <TrendingDown size={12} className="text-green-500" />
              : <TrendingUp size={12} className="text-red-500" />
            }
            <span className={cn("text-[10px] font-semibold", expensePct <= 0 ? "text-green-500" : "text-red-500")}>
              {expensePct >= 0 ? "+" : ""}{expensePct.toFixed(1)}%
            </span>
            <span className="text-[10px] text-surface-400">gider</span>
          </div>
          <div className="flex items-center gap-1.5">
            <PiggyBank size={12} className={profitMargin >= 0 ? "text-green-500" : "text-red-500"} />
            <span className={cn("text-[10px] font-bold", profitMargin >= 0 ? "text-green-500" : "text-red-500")}>
              %{profitMargin.toFixed(1)}
            </span>
            <span className="text-[10px] text-surface-400">marj</span>
          </div>
        </div>
      </div>

      {/* ─── Mini Aylık Trend (Son 4 Ay) ─────────────────────── */}
      {monthlyTrend.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-surface-300">Aylik Trend</h4>
            <div className="flex items-center gap-3 text-[9px] font-medium">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" /> Gelir</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Gider</span>
            </div>
          </div>
          <div className="flex items-end gap-2 h-28">
            {monthlyTrend.map((m, idx) => {
              const maxVal = Math.max(...monthlyTrend.map((t) => Math.max(t.income, t.expense)), 1);
              const incH = (m.income / maxVal) * 100;
              const expH = (m.expense / maxVal) * 100;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                    <div className="bg-surface-900 text-white rounded-lg p-2 text-[9px] shadow-xl whitespace-nowrap border border-surface-700">
                      <p className="font-bold">{MONTH_LABELS[m.month]} {m.year}</p>
                      <p className="text-green-400">Gelir: {formatCurrency(m.income, currency)}</p>
                      <p className="text-red-400">Gider: {formatCurrency(m.expense, currency)}</p>
                    </div>
                  </div>
                  <div className="w-full flex gap-0.5 items-end h-20">
                    <div className="flex-1 bg-green-500 rounded-t-sm min-h-[2px] transition-all duration-500" style={{ height: `${Math.max(incH, 2)}%` }} />
                    <div className="flex-1 bg-red-400 rounded-t-sm min-h-[2px] transition-all duration-500" style={{ height: `${Math.max(expH, 2)}%` }} />
                  </div>
                  <span className="text-[9px] text-surface-400 font-medium">{MONTH_LABELS[m.month]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Kategori Kırılımı ───────────────────────────────── */}
      {categories.length > 0 && (
        <div className="card p-4">
          <h4 className="text-xs font-semibold text-surface-300 mb-3">Kategori Kirilimi</h4>
          <div className="space-y-2">
            {categories.slice(0, 6).map((cat) => {
              const catTotal = cat.income + cat.expense;
              const maxCat = Math.max(...categories.map((c) => c.income + c.expense), 1);
              const barWidth = (catTotal / maxCat) * 100;

              return (
                <div key={cat.name} className="flex items-center gap-3">
                  <span className="text-xs text-surface-300 w-24 truncate font-medium">{cat.name}</span>
                  <div className="flex-1 h-4 rounded-full bg-surface-700 overflow-hidden flex">
                    {cat.income > 0 && (
                      <div
                        className="h-full bg-green-400 transition-all duration-500"
                        style={{ width: `${catTotal > 0 ? (cat.income / catTotal) * barWidth : 0}%` }}
                      />
                    )}
                    {cat.expense > 0 && (
                      <div
                        className="h-full bg-red-400 transition-all duration-500"
                        style={{ width: `${catTotal > 0 ? (cat.expense / catTotal) * barWidth : 0}%` }}
                      />
                    )}
                  </div>
                  <div className="w-20 text-right">
                    {cat.income > 0 && (
                      <span className="text-[10px] text-green-500 font-medium block">{formatCurrency(cat.income, currency)}</span>
                    )}
                    {cat.expense > 0 && (
                      <span className="text-[10px] text-red-500 font-medium block">{formatCurrency(cat.expense, currency)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Sabit Gider Özeti ───────────────────────────────── */}
      {fixedCosts && fixedCosts.total_monthly_cost > 0 && (
        <div className="card p-4">
          <h4 className="text-xs font-semibold text-surface-300 mb-3">Aylik Sabit Giderler</h4>
          <div className="grid grid-cols-3 gap-2">
            {fixedCosts.rent_cost > 0 && (
              <FixedCostMini label="Kira" value={fixedCosts.rent_cost} currency={currency} color="text-amber-500" />
            )}
            {fixedCosts.personnel_cost > 0 && (
              <FixedCostMini label="Personel" value={fixedCosts.personnel_cost} currency={currency} color="text-blue-400" />
            )}
            {fixedCosts.other_cost > 0 && (
              <FixedCostMini label="Diger" value={fixedCosts.other_cost} currency={currency} color="text-surface-300" />
            )}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-700">
            <span className="text-xs font-medium text-surface-400">Toplam</span>
            <span className="text-sm font-bold text-white">{formatCurrency(fixedCosts.total_monthly_cost, currency)}</span>
          </div>
        </div>
      )}

      {/* ─── Son İşlemler ────────────────────────────────────── */}
      {recentTx.length > 0 && (
        <div className="card p-4">
          <h4 className="text-xs font-semibold text-surface-300 mb-3">Son Islemler</h4>
          <div className="space-y-1.5">
            {recentTx.map((tx) => {
              const isIncome = tx.direction === "income";
              return (
                <div key={tx.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-700 transition-colors">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    isIncome ? "bg-green-500/10" : "bg-red-500/10"
                  )}>
                    {isIncome
                      ? <ArrowDownLeft size={14} className="text-green-500" />
                      : <ArrowUpRight size={14} className="text-red-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {tx.description || tx.category?.name || (isIncome ? "Gelir" : "Gider")}
                    </p>
                    <p className="text-[10px] text-surface-400">
                      {tx.category?.name && `${tx.category.name} · `}
                      {new Date(tx.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className={cn(
                    "text-xs font-bold shrink-0",
                    isIncome ? "text-green-500" : "text-red-500"
                  )}>
                    {isIncome ? "+" : "-"}{formatCurrency(tx.amount, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Detaylı Finans Sayfasına Yönlendirme ────────────── */}
      <button
        onClick={() => router.push("/dashboard/finance")}
        className="w-full card p-4 flex items-center justify-between group hover:border-brand-400 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center group-hover:bg-brand-500/20 transition-colors">
            <BarChart3 size={20} className="text-brand-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white group-hover:text-brand-400 transition-colors">
              Detayli Finans Analizi
            </p>
            <p className="text-[10px] text-surface-400">
              Tum isletmelerin finansal karsilastirmasi, trendler ve raporlar
            </p>
          </div>
        </div>
        <ChevronRight size={18} className="text-surface-400 group-hover:text-brand-400 transition-colors" />
      </button>
    </div>
  );
}

// ─── Alt Bileşenler ─────────────────────────────────────────────────────

function FixedCostMini({ label, value, currency, color }: { label: string; value: number; currency: string; color: string }) {
  return (
    <div className="text-center p-2 bg-surface-700 rounded-lg">
      <p className="text-[9px] text-surface-400 font-medium uppercase">{label}</p>
      <p className={cn("text-xs font-bold mt-0.5", color)}>{formatCurrency(value, currency)}</p>
    </div>
  );
}

function FinanceModuleSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 bg-surface-700 rounded-2xl" />
      <div className="h-36 bg-surface-700 rounded-2xl" />
      <div className="h-40 bg-surface-700 rounded-2xl" />
      <div className="h-48 bg-surface-700 rounded-2xl" />
    </div>
  );
}

function EmptyFinance() {
  return (
    <div className="card p-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-surface-700 flex items-center justify-center mx-auto mb-3">
        <Wallet size={24} className="text-surface-400" />
      </div>
      <p className="text-sm font-medium text-surface-300">Henuz finansal veri yok</p>
      <p className="text-xs text-surface-400 mt-1">Islem ekleyerek finansal takibe baslayin</p>
    </div>
  );
}
