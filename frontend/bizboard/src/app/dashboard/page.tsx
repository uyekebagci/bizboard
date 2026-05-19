"use client";

import { useEffect, useState } from "react";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { GroupedBusinessGrid } from "@/components/dashboard/groups/GroupedBusinessGrid";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { CarryOverBanner } from "@/components/closing/CarryOverBanner";
// v1.6.14: QuickActions kısayolları sidebar'a taşındı — widget kaldırıldı.
import { DebtWidget } from "@/components/dashboard/DebtWidget";
import { AlertsWidget } from "@/components/dashboard/AlertsWidget";
import { ExpenseChart } from "@/components/dashboard/ExpenseChart";
import { useBusinesses } from "@/hooks/useBusinesses";
import { usePortfolio } from "@/hooks/usePortfolio";
import { api } from "@/lib/api/client";
import {
  getDefaultPeriod,
  setDefaultPeriod,
  PERIODS,
  periodLabel,
  type Period,
} from "@/lib/preferences";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return "Gunaydin";
  if (hour >= 12 && hour < 17) return "Iyi gunler";
  if (hour >= 17 && hour < 23) return "Iyi aksamlar";
  return "Iyi geceler";
}

export default function DashboardPage() {
  const { businesses, isLoading: bizLoading } = useBusinesses();

  // v1.6.7: kullanıcının seçtiği periyot — localStorage'a yazılıp tüm tab/visit'lerde aktif.
  const [period, setPeriod] = useState<Period>(() => getDefaultPeriod());
  const { portfolio, isLoading: portLoading } = usePortfolio(period);

  function handlePeriodChange(next: Period) {
    setPeriod(next);
    setDefaultPeriod(next);
  }

  // Aggregated employee data
  const [employeeData, setEmployeeData] = useState<{ count: number; cost: number } | null>(null);
  const [debtData, setDebtData] = useState<{ receivable: number; payable: number } | null>(null);

  useEffect(() => {
    async function fetchEmployeeTotals() {
      if (businesses.length === 0) return;
      try {
        const results = await Promise.all(
          businesses.map((b) =>
            api.get<{ active_employees: number; total_cost: number }>(`/businesses/${b.id}/employees/summary`).catch(() => null)
          )
        );
        let count = 0, cost = 0;
        for (const r of results) {
          if (r) { count += r.active_employees || 0; cost += r.total_cost || 0; }
        }
        setEmployeeData({ count, cost });
      } catch { }
    }
    fetchEmployeeTotals();
  }, [businesses]);

  const isLoading = bizLoading || portLoading;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-5">
      {/* Greeting + period selector (v1.6.7+) */}
      <section className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{getGreeting()} 👋</h1>
          <p className="text-surface-400 mt-1">
            Isletmelerinizin durumu — {periodLabel(period).toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 bg-surface-800 rounded-xl p-1 border border-surface-700">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                period === p
                  ? "bg-brand-600 text-white"
                  : "text-surface-300 hover:text-white"
              }`}
              aria-pressed={period === p}
            >
              {periodLabel(p)}
            </button>
          ))}
        </div>
      </section>

      {/* v1.6.19 (WP-2): 'Dünden Kalan Eksik' banner — yalnız önceki günde fark varsa */}
      <CarryOverBanner />

      {/* Portfolio (50%) + Stats 2x2 (50%) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PortfolioCard portfolio={portfolio} period={period} />
        <StatsRow portfolio={portfolio} debtData={debtData} employeeData={employeeData} />
      </section>

      {/* Charts + Debt */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ExpenseChart portfolio={portfolio} />
        <DebtWidget
          businesses={businesses}
          onTotalChange={(data) => setDebtData(data)}
        />
      </section>

      {/* v1.6.14: 'Kisayollar' widget'i kaldirildi — tum kisayollar yan menude. */}

      {/* Alerts */}
      <section>
        <AlertsWidget businesses={businesses} />
      </section>

      {/* Business Cards Grid */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">
            Isletmeleriniz
          </h2>
          <span className="text-sm text-surface-400">
            {businesses.length} aktif
          </span>
        </div>
        <GroupedBusinessGrid businesses={businesses} portfolio={portfolio} />
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Son Islemler
        </h2>
        <RecentActivity />
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-8 bg-surface-200 rounded-lg w-48" />
        <div className="h-5 bg-surface-200 rounded-lg w-64 mt-2" />
      </div>
      <div className="h-44 bg-surface-200 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-44 bg-surface-200 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-surface-200 rounded-2xl" />)}
        </div>
      </div>
      <div className="h-16 bg-surface-200 rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-40 bg-surface-200 rounded-2xl" />
        <div className="h-40 bg-surface-200 rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-44 bg-surface-200 rounded-2xl" />)}
      </div>
    </div>
  );
}
