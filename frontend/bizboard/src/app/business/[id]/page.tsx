"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Settings, Plus } from "lucide-react";
import { BusinessHeader } from "@/components/business/BusinessHeader";
import { FinanceSummary } from "@/components/business/FinanceSummary";
import { TransactionList } from "@/components/business/TransactionList";
import { ModuleTabs } from "@/components/business/ModuleTabs";
import { FixedCostsWidget } from "@/components/business/FixedCostsWidget";
import { useBusiness } from "@/hooks/useBusiness";
import Link from "next/link";

export default function BusinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = params.id as string;
  const { business, transactions, summary, isLoading } = useBusiness(businessId);

  if (isLoading) {
    return <BusinessDetailSkeleton />;
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <p className="text-surface-300 text-lg">Isletme bulunamadi</p>
        <button onClick={() => router.push("/dashboard")} className="btn-primary mt-4">
          Panele Don
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in pb-24 overflow-x-hidden max-w-full">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-surface-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Geri</span>
        </button>
        <Link
          href={`/business/${businessId}/settings`}
          className="p-2 rounded-xl hover:bg-surface-600 transition-colors"
        >
          <Settings size={20} className="text-surface-300" />
        </Link>
      </div>

      {/* Business Header */}
      <BusinessHeader business={business} />

      {/* Finance Summary Cards */}
      <FinanceSummary summary={summary} currency={business.currency} />

      {/* Fixed Costs Widget */}
      <FixedCostsWidget businessId={businessId} currency={business.currency} />

      {/* Module Tabs */}
      <ModuleTabs business={business} />

      {/* Recent Transactions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">
            Son Islemler
          </h2>
          <Link
            href={`/dashboard/add-transaction?business=${businessId}`}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus size={16} />
            Ekle
          </Link>
        </div>
        <TransactionList
          transactions={transactions}
          currency={business.currency}
        />
      </section>
    </div>
  );
}

function BusinessDetailSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-6 bg-surface-600 rounded w-24" />
      <div className="h-24 bg-surface-600 rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface-600 rounded-xl" />
        ))}
      </div>
      <div className="h-10 bg-surface-600 rounded-xl" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-surface-600 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
