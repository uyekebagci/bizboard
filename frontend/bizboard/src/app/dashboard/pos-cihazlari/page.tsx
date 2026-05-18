"use client";

/**
 * v1.6.4: POS Cihazları sayfası.
 *
 * Veriler:
 *   GET /api/pos/businesses          — POS işlemi olan işletmelerin özeti
 *   GET /api/pos/transactions/daily  — son N gün için günlük POS işlemleri
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  TrendingUp,
  Percent,
  Receipt,
  Loader2,
  Building2,
  Plus,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useRouter } from "next/navigation";
import type { PosBusinessSummary, PosTransactionRow } from "@/types";

export default function PosCihazlariPage() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<PosBusinessSummary[]>([]);
  const [daily, setDaily] = useState<PosTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBiz, setSelectedBiz] = useState<string | "all">("all");

  useEffect(() => {
    async function load() {
      try {
        const [s, d] = await Promise.all([
          api.get<PosBusinessSummary[]>("/pos/businesses").catch(() => []),
          api.get<PosTransactionRow[]>("/pos/transactions/daily?days=30").catch(() => []),
        ]);
        setSummaries(s || []);
        setDaily(d || []);
      } catch (err) {
        logger.error("api", "POS data fetch failed", undefined, err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalGross = summaries.reduce((a, b) => a + (b.total_gross || 0), 0);
  const totalCommission = summaries.reduce((a, b) => a + (b.total_commission || 0), 0);
  const totalNet = summaries.reduce((a, b) => a + (b.total_net || 0), 0);

  const filteredDaily = selectedBiz === "all"
    ? daily
    : daily.filter((d) => d.business_id === selectedBiz);

  // Group daily by date for display
  const dailyByDate = filteredDaily.reduce<Record<string, PosTransactionRow[]>>((acc, row) => {
    (acc[row.date] = acc[row.date] || []).push(row);
    return acc;
  }, {});
  const sortedDates = Object.keys(dailyByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors"
        >
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <CreditCard size={20} className="text-indigo-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">POS Cihazlari</h1>
            <p className="text-xs text-surface-400">
              Tum isletmelerdeki POS islemleri ve komisyon ozeti
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-indigo-400" />
        </div>
      ) : summaries.length === 0 ? (
        <div className="card p-8 text-center">
          <CreditCard size={32} className="mx-auto text-surface-500 mb-2" />
          <p className="text-surface-300 font-medium">Henuz POS islemi yok</p>
          <p className="text-surface-400 text-sm mt-1">
            Islem eklerken &quot;Odeme Yontemi&quot; olarak POS seciniz.
          </p>
          <Link
            href="/dashboard/add-transaction?payment_method=POS&type=income"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            POS Islemi Ekle
          </Link>
        </div>
      ) : (
        <>
          {/* Totals */}
          <section className="grid grid-cols-3 gap-3">
            <div className="card p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-400 uppercase tracking-wider">
                <TrendingUp size={12} /> Toplam
              </div>
              <p className="mt-1 text-lg font-bold text-white">
                {formatCurrency(totalGross, "TRY")}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-400 uppercase tracking-wider">
                <Percent size={12} /> Komisyon
              </div>
              <p className="mt-1 text-lg font-bold text-red-300">
                -{formatCurrency(totalCommission, "TRY")}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-[11px] text-surface-400 uppercase tracking-wider">
                <Receipt size={12} /> Net
              </div>
              <p className="mt-1 text-lg font-bold text-emerald-300">
                {formatCurrency(totalNet, "TRY")}
              </p>
            </div>
          </section>

          {/* Business filter chips */}
          <section>
            <h2 className="text-sm font-semibold text-surface-200 mb-2">Isletme</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedBiz("all")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  selectedBiz === "all"
                    ? "bg-indigo-500/20 border-indigo-400 text-indigo-200"
                    : "bg-surface-700 border-surface-600 text-surface-300"
                }`}
              >
                Tumu ({summaries.length})
              </button>
              {summaries.map((s) => (
                <button
                  key={s.business_id}
                  onClick={() => setSelectedBiz(s.business_id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                    selectedBiz === s.business_id
                      ? "bg-indigo-500/20 border-indigo-400 text-indigo-200"
                      : "bg-surface-700 border-surface-600 text-surface-300"
                  }`}
                >
                  <Building2 size={12} />
                  {s.business_name}
                </button>
              ))}
            </div>
          </section>

          {/* Per-business cards */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-surface-200">Isletme Bazli Ozet</h2>
            <div className="card divide-y divide-surface-700">
              {summaries.map((s) => (
                <Link
                  key={s.business_id}
                  href={`/business/${s.business_id}`}
                  className="block p-4 hover:bg-surface-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{s.business_name}</p>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {s.transaction_count} islem · ort. %{s.weighted_avg_rate.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">
                        {formatCurrency(s.total_gross, s.currency)}
                      </p>
                      <p className="text-[11px] text-surface-400">
                        Net: <span className="text-emerald-300">{formatCurrency(s.total_net, s.currency)}</span>
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Daily transactions */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-surface-200">
              Gunluk POS Islemleri
              <span className="ml-2 text-xs font-normal text-surface-400">son 30 gun</span>
            </h2>
            {sortedDates.length === 0 ? (
              <div className="card p-6 text-center">
                <p className="text-surface-400 text-sm">Bu filtre icin islem yok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedDates.map((date) => {
                  const rows = dailyByDate[date];
                  const dayGross = rows.reduce((a, r) => a + r.amount, 0);
                  const dayNet = rows.reduce((a, r) => a + r.net, 0);
                  return (
                    <div key={date} className="card">
                      <div className="px-4 py-2.5 border-b border-surface-700 flex items-center justify-between">
                        <p className="text-sm font-medium text-surface-200">
                          {new Date(date).toLocaleDateString("tr-TR", {
                            day: "numeric", month: "long", weekday: "short",
                          })}
                        </p>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">
                            {formatCurrency(dayGross, rows[0]?.currency || "TRY")}
                          </p>
                          <p className="text-[10px] text-emerald-300">
                            Net {formatCurrency(dayNet, rows[0]?.currency || "TRY")}
                          </p>
                        </div>
                      </div>
                      <div className="divide-y divide-surface-700">
                        {rows.map((r) => (
                          <div key={r.transaction_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-white truncate">
                                {r.description || r.business_name}
                              </p>
                              <p className="text-[11px] text-surface-400">
                                {r.business_name} · %{r.pos_rate}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-white">
                                {formatCurrency(r.amount, r.currency)}
                              </p>
                              <p className="text-[10px] text-surface-400">
                                <span className="text-red-300">-{formatCurrency(r.commission, r.currency)}</span>
                                {" · "}
                                <span className="text-emerald-300">{formatCurrency(r.net, r.currency)}</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
