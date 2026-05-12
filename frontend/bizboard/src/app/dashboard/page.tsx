"use client";

import { useEffect, useState } from "react";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { BusinessGrid } from "@/components/dashboard/BusinessGrid";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DebtWidget } from "@/components/dashboard/DebtWidget";
import { AlertsWidget } from "@/components/dashboard/AlertsWidget";
import { ExpenseChart } from "@/components/dashboard/ExpenseChart";
import { useBusinesses } from "@/hooks/useBusinesses";
import { usePortfolio } from "@/hooks/usePortfolio";
import { api } from "@/lib/api/client";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return "Gunaydin";
  if (hour >= 12 && hour < 17) return "Iyi gunler";
  if (hour >= 17 && hour < 23) return "Iyi aksamlar";
  return "Iyi geceler";
}

export default function DashboardPage() {
  const { businesses, isLoading: bizLoading } = useBusinesses();
  const { portfolio, isLoading: portLoading } = usePortfolio();

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
      {/* Greeting */}
      <section>
        <h1 className="text-2xl font-bold text-white">{getGreeting()} 👋</h1>
        <p className="text-surface-400 mt-1">
          Isletmelerinizin durumu
        </p>
      </section>

      {/* Portfolio (50%) + Stats 2x2 (50%) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PortfolioCard portfolio={portfolio} />
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

      {/* Quick Actions */}
      <section>
        <QuickActions />
      </section>

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
        <BusinessGrid businesses={businesses} portfolio={portfolio} />
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
