"use client";

import { useEffect, useState } from "react";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
// v1.6.23.14 (TODO 935f5c52): StatsRow + ExpenseChart kaldırıldı (DGR profili
// için gereksiz — rapor merkezi için anlamlı, ana sayfada dikkat dağıtıyordu).
import { GroupedBusinessGrid } from "@/components/dashboard/groups/GroupedBusinessGrid";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { CarryOverBanner } from "@/components/closing/CarryOverBanner";
// v1.6.14: QuickActions kısayolları sidebar'a taşındı — widget kaldırıldı.
import { DebtWidget } from "@/components/dashboard/DebtWidget";
import { AlertsWidget } from "@/components/dashboard/AlertsWidget";
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

  // v1.6.23.14: employeeData aggregation kaldırıldı — Personel widget'ı
  // ana sayfadan kaldırıldığı için artık gereksiz. /businesses/{id}/employees/summary
  // endpoint'i kullanılmaya devam ediyor (Finans Merkezi / işletme detayı).
  const [debtData, setDebtData] = useState<{ receivable: number; payable: number } | null>(null);

  const isLoading = bizLoading || portLoading;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-5">
      {/* Greeting + period selector (v1.6.7+) — Redesign PR-2: glass + seg-active */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 rise">
        <div>
          <p className="text-[13px] text-brand-300 font-semibold tracking-wide">{getGreeting()} 👋</p>
          <h1 className="text-2xl sm:text-[28px] font-extrabold h-display mt-1 text-surface-100">
            Isletmeleriniz bir bakista
          </h1>
          <p className="text-surface-400 text-sm mt-1.5">
            Durum — {periodLabel(period).toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 glass-card p-1 text-sm">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                period === p
                  ? "seg-active font-semibold"
                  : "text-surface-400 hover:text-surface-100"
              }`}
              aria-pressed={period === p}
            >
              {periodLabel(p)}
            </button>
          ))}
        </div>
      </section>

      {/* v1.6.19 (WP-2) + v1.6.23.21: 'Dünden Kalan Eksik' banner — kullanıcının
          ilk işletmesi için. Multi-tenant'da business selector eklenmesi gerek (TODO). */}
      <CarryOverBanner businessId={businesses?.[0]?.id ?? null} />

      {/* v1.6.23.14 (TODO 935f5c52): DGR kullanım profili için 5 gereksiz
          widget kaldırıldı: StatsRow (Toplam Gelir, Toplam Gider, Personel,
          Kar Marjı) + ExpenseChart (Gelir-Gider Dağılımı). DGR günlük kasa
          + konsolide pozisyon odaklı çalışıyor; bu widget'lar rapor merkezi
          için anlamlı, ana sayfada dikkat dağıtıyordu.
          Backend endpoint'leri/queryler ölü kod değil — Finans Merkezi'nde
          kullanılmaya devam ediyor. */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PortfolioCard portfolio={portfolio} period={period} />
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
          <h2 className="text-lg font-bold h-display text-surface-100">
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
        <h2 className="text-lg font-bold h-display text-surface-100 mb-3">
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
